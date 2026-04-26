import { and, desc, eq, schema, sql } from '@diguro/db';
import { z } from 'zod';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { resolveWorkspaceLogoUrl } from '../../services/workspaces/attachments.ts';

/**
 * User-facing workspaces router. Anyone authed can list workspaces they
 * belong to (for the /workspaces picker) and switch the active workspace
 * on their session. Admin operations (create / delete / change caps) live
 * in adminOrganization.
 */
export const workspacesRouter = router({
  /**
   * Workspaces the current user is a member of, with per-workspace member
   * count and the caller's own role. Ordered by most-recently-joined.
   */
  myList: authedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({
          id: schema.workspaces.id,
          name: schema.workspaces.name,
          slug: schema.workspaces.slug,
          logoUrl: schema.workspaces.logoUrl,
          createdAt: schema.workspaces.createdAt,
          myRole: schema.members.role,
          memberCount: sql<number>`(
            SELECT COUNT(*)::int FROM ${schema.members} m2
            WHERE m2.workspace_id = ${schema.workspaces.id}
          )`,
        })
        .from(schema.members)
        .innerJoin(
          schema.workspaces,
          eq(schema.members.workspaceId, schema.workspaces.id),
        )
        .where(eq(schema.members.userId, ctx.user.id))
        .orderBy(desc(schema.members.createdAt));

      return await Promise.all(
        rows.map(async (row) => {
          if (!row.logoUrl?.startsWith('workspace://')) return row;
          const resolved = await resolveWorkspaceLogoUrl(
            { objectStore: ctx.objectStore },
            { workspaceId: row.id, url: row.logoUrl },
          ).catch(() => null);
          return { ...row, logoUrl: resolved };
        }),
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  /**
   * Set the active workspace on the caller's session. Validates the
   * workspace exists, is in the caller's organization, and the caller is a
   * member.
   */
  setActive: authedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const wsRows = await ctx.db
          .select({
            id: schema.workspaces.id,
            organizationId: schema.workspaces.organizationId,
          })
          .from(schema.workspaces)
          .where(eq(schema.workspaces.id, input.workspaceId))
          .limit(1);
        const workspace = wsRows[0];
        if (!workspace) throw new ResourceNotFound(input.workspaceId);
        if (
          ctx.user.organizationId &&
          workspace.organizationId !== ctx.user.organizationId
        ) {
          throw new Forbidden('Workspace is in a different organization');
        }

        // organization_admins can switch into any workspace in their org;
        // superadmins are blocked entirely from workspace context (they
        // operate at the platform tier only — see adminPlatform.*).
        if (ctx.user.role === 'superadmin') {
          throw new Forbidden('Superadmins do not have workspace access');
        }
        const isOrgAdmin = ctx.user.role === 'organization_admin';
        if (!isOrgAdmin) {
          const memberRows = await ctx.db
            .select({ id: schema.members.id })
            .from(schema.members)
            .where(
              and(
                eq(schema.members.workspaceId, input.workspaceId),
                eq(schema.members.userId, ctx.user.id),
              ),
            )
            .limit(1);
          if (!memberRows[0]) {
            throw new Forbidden('You are not a member of this workspace');
          }
        }

        await ctx.db
          .update(schema.sessions)
          .set({ activeWorkspaceId: input.workspaceId, updatedAt: new Date() })
          .where(eq(schema.sessions.id, ctx.session.id));

        return { ok: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
