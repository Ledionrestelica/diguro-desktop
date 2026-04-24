import { and, asc, eq, inArray, schema, type Db } from '@diguro/db';
import { MessageParts, type MessageParts as MessagePartsT } from '@diguro/shared';

export interface ConversationDetail {
  id: string;
  title: string;
  workspaceId: string | null;
  modelId: string | null;
  /** Which corpus this conversation's retrieval tool searches. Locked on
   *  first-create; client uses this to render the (disabled) scope pill
   *  when opening an existing chat. */
  retrievalScope: 'organization' | 'user';
  createdAt: Date;
  messages: PersistedMessage[];
}

export interface PersistedMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  parts: MessagePartsT;
  modelId: string | null;
  createdAt: Date;
  /**
   * Citations referenced in this message's text parts. Rank is the order
   * in which they were cited (1, 2, 3, …) — what the UI renders as `[1]`,
   * `[2]` chips. Only populated for assistant messages that used the
   * retrieval tool.
   */
  citations: MessageCitation[];
}

export interface MessageCitation {
  id: string;
  chunkId: string;
  rank: number;
  snippet: string;
  sourceName: string;
  pageNumber: number | null;
  resourceId: string;
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

  const citationsByMessage = await loadCitations(
    deps,
    messageRows.map((m) => m.id),
  );

  const messages: PersistedMessage[] = messageRows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: MessageParts.parse(row.parts),
    modelId: row.modelId,
    createdAt: row.createdAt,
    citations: citationsByMessage.get(row.id) ?? [],
  }));

  return {
    id: conv.id,
    title: conv.title,
    workspaceId: conv.workspaceId,
    modelId: conv.modelId,
    retrievalScope: conv.retrievalScope ?? 'organization',
    createdAt: conv.createdAt,
    messages,
  };
}

async function loadCitations(
  deps: { db: Db },
  messageIds: string[],
): Promise<Map<string, MessageCitation[]>> {
  const out = new Map<string, MessageCitation[]>();
  if (messageIds.length === 0) return out;

  // Single join fetches everything the UI needs: citation → chunk →
  // resourceVersion → resource for the source name + page. We deliberately
  // do this client-side (not inside get.ts's main select) because it keeps
  // each query small and readable.
  const rows = await deps.db
    .select({
      id: schema.citations.id,
      messageId: schema.citations.messageId,
      chunkId: schema.citations.chunkId,
      rank: schema.citations.rank,
      snippet: schema.citations.snippet,
      pageNumber: schema.chunks.pageNumber,
      resourceId: schema.resources.id,
      sourceName: schema.resources.name,
    })
    .from(schema.citations)
    .innerJoin(schema.chunks, eq(schema.chunks.id, schema.citations.chunkId))
    .innerJoin(
      schema.resourceVersions,
      eq(schema.resourceVersions.id, schema.chunks.resourceVersionId),
    )
    .innerJoin(
      schema.resources,
      eq(schema.resources.id, schema.resourceVersions.resourceId),
    )
    .where(inArray(schema.citations.messageId, messageIds));

  for (const r of rows) {
    const list = out.get(r.messageId) ?? [];
    list.push({
      id: r.id,
      chunkId: r.chunkId,
      rank: r.rank,
      snippet: r.snippet,
      sourceName: r.sourceName,
      pageNumber: r.pageNumber,
      resourceId: r.resourceId,
    });
    out.set(r.messageId, list);
  }
  // Sort by rank within each message — the UI renders in citation order.
  for (const list of out.values()) list.sort((a, b) => a.rank - b.rank);
  return out;
}
