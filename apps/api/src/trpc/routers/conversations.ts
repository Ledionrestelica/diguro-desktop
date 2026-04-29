import { eq, schema } from '@diguro/db';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { listConversations } from '../../services/conversations/list.ts';
import { getConversation } from '../../services/conversations/get.ts';
import {
  deleteConversation,
  renameConversation,
} from '../../services/conversations/delete.ts';
import { ResourceNotFound } from '@diguro/shared/errors';

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
});
