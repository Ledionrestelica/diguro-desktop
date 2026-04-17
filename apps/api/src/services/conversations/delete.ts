import { and, eq, schema, type Db } from '@diguro/db';
import { ResourceNotFound } from '@diguro/shared/errors';

export async function deleteConversation(
  deps: { db: Db },
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
