import { and, eq, schema } from '@diguro/db';
import { authedProcedure, publicProcedure, router } from '../trpc.ts';
import { resolveOrganizationLogoUrl } from '../../services/organizations/attachments.ts';
import { resolveWorkspaceLogoUrl } from '../../services/workspaces/attachments.ts';

/**
 * `health.me` — the client bootstrap call. Returns the signed-in user +
 * their organization (if assigned) + active workspace (if picked), used
 * to gate admin routes and show branding.
 */
export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true,
    time: new Date().toISOString(),
  })),

  me: authedProcedure.query(async ({ ctx }) => {
    let organization: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      primaryColor: string | null;
    } | null = null;
    if (ctx.user.organizationId) {
      const rows = await ctx.db
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          logoUrl: schema.organizations.logoUrl,
          primaryColor: schema.organizations.primaryColor,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, ctx.user.organizationId))
        .limit(1);
      organization = rows[0] ?? null;

      if (organization?.logoUrl?.startsWith('organization://')) {
        organization = {
          ...organization,
          logoUrl: await resolveOrganizationLogoUrl(
            { objectStore: ctx.objectStore },
            { organizationId: organization.id, url: organization.logoUrl },
          ).catch(() => null),
        };
      }
    }

    const sessionRows = await ctx.db
      .select({ activeWorkspaceId: schema.sessions.activeWorkspaceId })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, ctx.session.id))
      .limit(1);
    const activeWorkspaceId = sessionRows[0]?.activeWorkspaceId ?? null;

    let activeWorkspace: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
    } | null = null;
    if (activeWorkspaceId) {
      const rows = await ctx.db
        .select({
          id: schema.workspaces.id,
          name: schema.workspaces.name,
          slug: schema.workspaces.slug,
          logoUrl: schema.workspaces.logoUrl,
          organizationId: schema.workspaces.organizationId,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, activeWorkspaceId))
        .limit(1);
      const row = rows[0];
      if (
        row &&
        (!ctx.user.organizationId || row.organizationId === ctx.user.organizationId)
      ) {
        let wsLogoUrl = row.logoUrl;
        if (wsLogoUrl?.startsWith('workspace://')) {
          wsLogoUrl = await resolveWorkspaceLogoUrl(
            { objectStore: ctx.objectStore },
            { workspaceId: row.id, url: wsLogoUrl },
          ).catch(() => null);
        }
        const memberRows = await ctx.db
          .select({ role: schema.members.role })
          .from(schema.members)
          .where(
            and(
              eq(schema.members.workspaceId, row.id),
              eq(schema.members.userId, ctx.user.id),
            ),
          )
          .limit(1);
        activeWorkspace = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          logoUrl: wsLogoUrl,
          myRole: memberRows[0]?.role ?? null,
        };
      }
    }

    return {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
      sessionId: ctx.session.id,
      organization,
      activeWorkspaceId,
      activeWorkspace,
    };
  }),
});
