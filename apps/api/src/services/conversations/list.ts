import { and, desc, eq, isNull, or, schema, type Db } from '@diguro/db';

export interface ConversationSummary {
  id: string;
  title: string;
  workspaceId: string | null;
  modelId: string | null;
  createdAt: Date;
}

/**
 * Conversations the caller can see in the chat sidebar, scoped to the
 * given context:
 *   - workspaceId set    → that workspace's threads, PLUS any legacy
 *                          rows where workspaceId is null (created
 *                          before workspace-tagging was wired into
 *                          chat-route). Including the legacy rows
 *                          avoids hiding the user's old chats.
 *   - workspaceId = null → only personal threads (workspaceId IS NULL).
 */
export async function listConversations(
  deps: { db: Db },
  input: {
    userId: string;
    workspaceId: string | null;
    limit?: number;
  },
): Promise<ConversationSummary[]> {
  const scopeFilter =
    input.workspaceId === null
      ? isNull(schema.conversations.workspaceId)
      : or(
          eq(schema.conversations.workspaceId, input.workspaceId),
          isNull(schema.conversations.workspaceId),
        );

  const rows = await deps.db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      workspaceId: schema.conversations.workspaceId,
      modelId: schema.conversations.modelId,
      createdAt: schema.conversations.createdAt,
    })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.userId, input.userId), scopeFilter))
    .orderBy(desc(schema.conversations.createdAt))
    .limit(input.limit ?? 100);

  return rows;
}
