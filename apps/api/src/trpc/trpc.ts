import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { and, eq, schema } from '@diguro/db';
import type { Ctx } from '../context.ts';
import { mapDomainError } from './error-mapper.ts';
import { Forbidden, Unauthorized } from '@diguro/shared/errors';

const t = initTRPC.context<Ctx>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const mapped = error.cause ? mapDomainError(error.cause) : error;
    return {
      ...shape,
      data: {
        ...shape.data,
        code: mapped.code,
      },
    };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

/**
 * Base procedure — unauthenticated. Use only for sign-in / sign-up.
 */
export const publicProcedure = t.procedure;

/**
 * Authed procedure — requires a valid session.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw mapDomainError(new Unauthorized());
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});

/**
 * Superadmin-only. Platform operators (the 3 of us) use this for the
 * platform admin surface — creating organizations, managing users across
 * all tenants, etc.
 */
export const systemAdminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'superadmin') {
    throw mapDomainError(new Forbidden('Superadmin access required'));
  }
  return next({ ctx });
});

/**
 * Loads the user's organization (the tenant) and attaches it to ctx. Fails
 * for users who aren't assigned to an organization yet and for suspended
 * organizations. Superadmins acting on a specific organization (other than
 * their own) should use systemAdminProcedure + accept an explicit
 * organizationId in the input instead.
 */
export const activeOrganizationProcedure = authedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.user.organizationId) {
      throw mapDomainError(new Forbidden('User is not assigned to an organization'));
    }
    const rows = await ctx.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, ctx.user.organizationId))
      .limit(1);
    const organization = rows[0];
    if (!organization) {
      throw mapDomainError(new Forbidden('Organization not found'));
    }
    if (organization.suspended) {
      throw mapDomainError(
        new Forbidden(`Organization suspended: ${organization.suspended}`),
      );
    }
    return next({ ctx: { ...ctx, organization } });
  },
);

/**
 * Organization-admin procedure — role in ('superadmin','organization_admin').
 * Used for the per-organization admin surface (manage users + workspaces).
 */
export const organizationAdminProcedure = activeOrganizationProcedure.use(
  ({ ctx, next }) => {
    if (ctx.user.role !== 'superadmin' && ctx.user.role !== 'organization_admin') {
      throw mapDomainError(new Forbidden('Organization admin access required'));
    }
    return next({ ctx });
  },
);

/**
 * Workspace-admin procedure — scopes to the caller's active workspace.
 * Grants access if:
 *   - the user is `superadmin` or `organization_admin` (they supersede
 *     workspace roles), OR
 *   - the user's `members.role` in the active workspace is `OWNER` or `ADMIN`.
 *
 * Attaches `ctx.workspace` and `ctx.workspaceMember` (null for platform admins
 * who aren't members of the specific workspace). Enforces that the active
 * workspace belongs to the user's organization — stale sessions after admin
 * moves can't cross organization boundaries.
 */
export const workspaceAdminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const sessionRows = await ctx.db
    .select({ activeWorkspaceId: schema.sessions.activeWorkspaceId })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, ctx.session.id))
    .limit(1);
  const activeWorkspaceId = sessionRows[0]?.activeWorkspaceId;
  if (!activeWorkspaceId) {
    throw mapDomainError(new Forbidden('Pick a workspace first'));
  }

  const wsRows = await ctx.db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, activeWorkspaceId))
    .limit(1);
  const workspace = wsRows[0];
  if (!workspace) {
    throw mapDomainError(new Forbidden('Active workspace not found'));
  }
  if (
    ctx.user.organizationId &&
    workspace.organizationId !== ctx.user.organizationId
  ) {
    throw mapDomainError(
      new Forbidden('Active workspace is in a different organization'),
    );
  }

  const memberRows = await ctx.db
    .select({ id: schema.members.id, role: schema.members.role })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.workspaceId, workspace.id),
        eq(schema.members.userId, ctx.user.id),
      ),
    )
    .limit(1);
  const workspaceMember = memberRows[0] ?? null;

  const hasAccess =
    ctx.user.role === 'superadmin' ||
    ctx.user.role === 'organization_admin' ||
    workspaceMember?.role === 'OWNER' ||
    workspaceMember?.role === 'ADMIN';

  if (!hasAccess) {
    throw mapDomainError(new Forbidden('Workspace admin access required'));
  }

  return next({ ctx: { ...ctx, workspace, workspaceMember } });
});
