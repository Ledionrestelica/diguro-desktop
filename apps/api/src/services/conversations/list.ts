import { desc, eq, schema, type Db } from '@diguro/db';

export interface ConversationSummary {
  id: string;
  title: string;
  workspaceId: string | null;
  modelId: string | null;
  createdAt: Date;
}

export async function listConversations(
  deps: { db: Db },
  input: { userId: string; limit?: number },
): Promise<ConversationSummary[]> {
  const rows = await deps.db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      workspaceId: schema.conversations.workspaceId,
      modelId: schema.conversations.modelId,
      createdAt: schema.conversations.createdAt,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, input.userId))
    .orderBy(desc(schema.conversations.createdAt))
    .limit(input.limit ?? 100);

  return rows;
}
