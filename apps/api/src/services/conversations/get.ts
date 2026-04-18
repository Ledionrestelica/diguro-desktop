import { and, asc, eq, schema, type Db } from '@diguro/db';
import { MessageParts, type MessageParts as MessagePartsT } from '@diguro/shared';

export interface ConversationDetail {
  id: string;
  title: string;
  workspaceId: string | null;
  modelId: string | null;
  createdAt: Date;
  messages: PersistedMessage[];
}

export interface PersistedMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  parts: MessagePartsT;
  modelId: string | null;
  createdAt: Date;
}

export async function getConversation(
  deps: { db: Db },
  input: { userId: string; conversationId: string },
): Promise<ConversationDetail | null> {
  const [conv] = await deps.db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.id, input.conversationId),
        eq(schema.conversations.userId, input.userId),
      ),
    )
    .limit(1);

  if (!conv) return null;

  const messageRows = await deps.db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(asc(schema.messages.createdAt));

  const messages: PersistedMessage[] = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: MessageParts.parse(row.parts),
    modelId: row.modelId,
    createdAt: row.createdAt,
  }));

  return {
    id: conv.id,
    title: conv.title,
    workspaceId: conv.workspaceId,
    modelId: conv.modelId,
    createdAt: conv.createdAt,
    messages,
  };
}
