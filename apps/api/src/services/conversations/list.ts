import { and, desc, eq, isNull, schema, type Db } from '@diguro/db';

export interface ConversationSummary {
  id: string;
  title: string;
  workspaceId: string | null;
  modelId: string | null;
  createdAt: Date;
}

/**
 * List a user's conversations scoped to a specific context:
 *   - workspaceId set     → workspace chat (only that workspace's threads).
 *   - workspaceId = null  → personal chat (only threads with no workspace).
 *
 * Mixing the two would leak workspace-scoped conversations into the
 * personal sidebar (and vice versa) and is the bug we're fixing here.
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
      : eq(schema.conversations.workspaceId, input.workspaceId);

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
