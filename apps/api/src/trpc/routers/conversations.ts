import { and, asc, eq, ilike, or, schema, sql } from '@diguro/db';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { listConversations } from '../../services/conversations/list.ts';
import { getConversation } from '../../services/conversations/get.ts';
import {
  deleteConversation,
  renameConversation,
} from '../../services/conversations/delete.ts';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';

export const conversationsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    try {
      // Read activeWorkspaceId from the session so the chat sidebar shows
      // only threads belonging to the current scope. Legacy rows with
      // null workspaceId are surfaced alongside (handled in the service)
      // so chats from before workspace-tagging stay visible.
      const sessionRow = (
        await ctx.db
          .select({ activeWorkspaceId: schema.sessions.activeWorkspaceId })
          .from(schema.sessions)
          .where(eq(schema.sessions.id, ctx.session.id))
          .limit(1)
      )[0];
      const workspaceId = sessionRow?.activeWorkspaceId ?? null;

      return await listConversations(
        { db: ctx.db },
        { userId: ctx.user.id, workspaceId },
      );
    } catch (err) {
      throw mapDomainError(err);
    }
  }),

  get: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      try {
        const conv = await getConversation(
          { db: ctx.db },
          { userId: ctx.user.id, conversationId: input.id },
        );
        if (!conv) throw new ResourceNotFound(input.id);
        return conv;
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteConversation(
          { db: ctx.db, objectStore: ctx.objectStore },
          { userId: ctx.user.id, conversationId: input.id },
        );
        return { success: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  rename: authedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await renameConversation(
          { db: ctx.db },
          { userId: ctx.user.id, conversationId: input.id, title: input.title },
        );
        return { success: true as const };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  /**
   * Typeahead for the chat composer's # file mention. Returns up to `limit`
   * fully-ingested files in the requested scope whose name matches the
   * (optional) prefix query. Scope authorization is the same boundary the
   * retrieval tool enforces — a user can only mention files their own chat
   * could already retrieve from.
   */
  searchMentionableFiles: authedProcedure
    .input(
      z.object({
        scope: z.enum(['organization', 'workspace', 'user']),
        q: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const limit = input.limit ?? 20;
        const q = (input.q ?? '').trim();
        const nameLike = q.length > 0 ? `%${escapeLike(q)}%` : null;

        const scopeWhere =
          input.scope === 'organization'
            ? (() => {
                const orgId = (ctx.user as { organizationId?: string | null })
                  .organizationId;
                if (!orgId) {
                  throw new Forbidden('Caller is not in any organization');
                }
                return eq(schema.resources.organizationId, orgId);
              })()
            : input.scope === 'workspace'
              ? await (async () => {
                  const sessionRow = (
                    await ctx.db
                      .select({ activeWorkspaceId: schema.sessions.activeWorkspaceId })
                      .from(schema.sessions)
                      .where(eq(schema.sessions.id, ctx.session.id))
                      .limit(1)
                  )[0];
                  const wsId = sessionRow?.activeWorkspaceId ?? null;
                  if (!wsId) {
                    throw new Forbidden('No active workspace');
                  }
                  // Mirror the chat retrieval scope: workspace mention
                  // picker also surfaces org-wide files alongside the
                  // workspace's own. Keeps the picker consistent with
                  // what the model can actually search.
                  const orgId = (ctx.user as { organizationId?: string | null })
                    .organizationId ?? null;
                  return orgId
                    ? or(
                        eq(schema.resources.workspaceId, wsId),
                        eq(schema.resources.organizationId, orgId),
                      )
                    : eq(schema.resources.workspaceId, wsId);
                })()
              : eq(schema.resources.userId, ctx.user.id);

        const where = and(
          scopeWhere,
          nameLike ? ilike(schema.resources.name, nameLike) : sql`TRUE`,
          // Only include files whose CURRENT version finished ingesting —
          // chunks for unfinished versions aren't searchable yet.
          sql`EXISTS (
            SELECT 1 FROM resource_versions rv
            WHERE rv.id = ${schema.resources.currentVersionId}
              AND rv.ingest_status = 'DONE'
          )`,
        );

        const rows = await ctx.db
          .select({
            id: schema.resources.id,
            name: schema.resources.name,
          })
          .from(schema.resources)
          .where(where)
          .orderBy(asc(schema.resources.name))
          .limit(limit);

        return rows;
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}
