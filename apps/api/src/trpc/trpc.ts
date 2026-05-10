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
 * Organization-admin procedure — only `organization_admin` passes. Superadmins
 * are platform operators, not organization members; they manage tenants
 * exclusively through `adminPlatform.*` and never through this surface.
 * This is enforced server-side as defense-in-depth on top of the frontend
 * redirect that keeps superadmins out of `/admin/organization/*`.
 */
export const organizationAdminProcedure = activeOrganizationProcedure.use(
  ({ ctx, next }) => {
    if (ctx.user.role !== 'organization_admin') {
      throw mapDomainError(new Forbidden('Organization admin access required'));
    }
    return next({ ctx });
  },
);

/**
 * Workspace-admin procedure — scopes to the caller's active workspace.
 * Grants access if:
 *   - the user is `organization_admin` of the org that owns the workspace
 *     (they supersede workspace roles within their tenant), OR
 *   - the user's `members.role` in the active workspace is `OWNER` or `ADMIN`.
 *
 * Superadmins have NO workspace presence — they operate exclusively at
 * the platform tier and never as members of a tenant org or workspace.
 *
 * Attaches `ctx.workspace` and `ctx.workspaceMember` (null for org admins
 * who aren't direct members of the specific workspace). Enforces that the
 * active workspace belongs to the user's organization — stale sessions
 * after admin moves can't cross organization boundaries.
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

  if (ctx.user.role === 'superadmin') {
    throw mapDomainError(new Forbidden('Superadmins do not have workspace access'));
  }
  // Workspace-admin access:
  //   - org admins implicitly admin every workspace in THEIR own org
  //     (the org-tenant guard above already rejected anything outside
  //     the caller's org), so no explicit member row required.
  //   - everyone else needs an OWNER/ADMIN member row in this workspace.
  const isOrgAdmin = ctx.user.role === 'organization_admin';
  const hasAccess =
    isOrgAdmin ||
    workspaceMember?.role === 'OWNER' ||
    workspaceMember?.role === 'ADMIN';

  if (!hasAccess) {
    throw mapDomainError(new Forbidden('Workspace admin access required'));
  }

  return next({ ctx: { ...ctx, workspace, workspaceMember } });
});
