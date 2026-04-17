import { z } from 'zod';
import { eq, schema, type Db } from '@diguro/db';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import {
  MAX_ATTACHMENT_BYTES,
  presignChatAttachment,
  resolveChatAttachmentUrl,
} from '../../services/chat/attachments.ts';
import { Forbidden } from '@diguro/shared/errors';

const PresignInput = z.object({
  conversationId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  contentLength: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

const ResolveInput = z.object({
  url: z.string().min(1),
});

export const chatAttachmentsRouter = router({
  presignUpload: authedProcedure
    .input(PresignInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await ensureConversationOwnership(ctx.db, {
          userId: ctx.user.id,
          conversationId: input.conversationId,
        });
        const result = await presignChatAttachment(
          { objectStore: ctx.objectStore },
          {
            userId: ctx.user.id,
            conversationId: input.conversationId,
            filename: input.filename,
            contentType: input.contentType,
            contentLength: input.contentLength,
          },
        );
        return result;
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  getUrl: authedProcedure
    .input(ResolveInput)
    .query(async ({ ctx, input }) => {
      try {
        const url = await resolveChatAttachmentUrl(
          { objectStore: ctx.objectStore },
          { userId: ctx.user.id, url: input.url },
        );
        return { url };
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});

/**
 * Verify that either the conversation exists and is owned by this user, or
 * doesn't exist yet (first upload before the conversation row is created).
 * The userId prefix on the S3 key gives us a second line of defense — but we
 * reject here for early feedback and cleaner errors.
 */
async function ensureConversationOwnership(
  db: Db,
  input: { userId: string; conversationId: string },
): Promise<void> {
  const rows = await db
    .select({
      id: schema.conversations.id,
      userId: schema.conversations.userId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);
  const conv = rows[0];
  if (!conv) return; // not yet persisted — OK, this may be the first upload
  if (conv.userId !== input.userId) {
    throw new Forbidden();
  }
}
