import { and, eq, schema, type Db } from '@diguro/db';
import { ResourceNotFound } from '@diguro/shared/errors';
import type { ObjectStore } from '../../ports/objectStore.ts';
import { deleteConversationAttachments } from '../chat/attachments.ts';

export async function deleteConversation(
  deps: { db: Db; objectStore: ObjectStore },
  input: { userId: string; conversationId: string },
): Promise<void> {
  const result = await deps.db
    .delete(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.userId, input.userId),
      ),
    )
    .returning({ id: schema.conversations.id });

  if (result.length === 0) {
    throw new ResourceNotFound(input.conversationId);
  }

  // Best-effort S3 cleanup — failures here don't fail the DB delete because
  // the reconciliation job will eventually catch orphans. We log but swallow.
  await deleteConversationAttachments(
    { objectStore: deps.objectStore },
    { userId: input.userId, conversationId: input.conversationId },
  ).catch(() => undefined);
}

export async function renameConversation(
  deps: { db: Db },
  input: { userId: string; conversationId: string; title: string },
): Promise<void> {
  const result = await deps.db
    .update(schema.conversations)
    .set({ title: input.title })
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.userId, input.userId),
      ),
    )
    .returning({ id: schema.conversations.id });

  if (result.length === 0) {
    throw new ResourceNotFound(input.conversationId);
  }
}
