import type { UIMessage } from 'ai';
import { sql, schema, type Db } from '@diguro/db';
import { MessageParts } from '@diguro/shared';

const TITLE_MAX_LENGTH = 60;
const TITLE_FALLBACK = 'New chat';

export interface UpsertConversationInput {
  conversationId: string;
  userId: string;
  organizationId: string | null;
  modelId: string;
  firstUserText: string | undefined;
}

/**
 * Create the conversation row if it doesn't exist yet. Idempotent — subsequent
 * messages in the same conversation reuse it via onConflictDoNothing.
 */
export async function upsertConversation(
  deps: { db: Db },
  input: UpsertConversationInput,
): Promise<void> {
  const title = deriveTitle(input.firstUserText);
  await deps.db
    .insert(schema.conversations)
    .values({
      id: input.conversationId,
      userId: input.userId,
      organizationId: input.organizationId,
      title,
      modelId: input.modelId,
    })
    .onConflictDoNothing({ target: schema.conversations.id });
}

export interface PersistUserMessageInput {
  conversationId: string;
  message: UIMessage;
}

/**
 * Save a user message. Parts are validated through the shared MessageParts
 * schema — unknown keys on AI-SDK parts (like `state`) get stripped.
 */
export async function persistUserMessage(
  deps: { db: Db },
  input: PersistUserMessageInput,
): Promise<void> {
  const parts = MessageParts.parse(input.message.parts);
  await deps.db
    .insert(schema.messages)
    .values({
      id: input.message.id,
      conversationId: input.conversationId,
      role: 'USER',
      parts,
    })
    .onConflictDoNothing({ target: schema.messages.id });
}

export interface PersistAssistantMessagesInput {
  conversationId: string;
  modelId: string;
  messages: UIMessage[];
}

/**
 * Save one or more assistant messages emitted by a single `streamText` run.
 * Called from the `onFinish` callback where `response.messages` is available.
 */
export async function persistAssistantMessages(
  deps: { db: Db },
  input: PersistAssistantMessagesInput,
): Promise<void> {
  if (input.messages.length === 0) return;
  const rows = input.messages.map((m) => ({
    id: m.id,
    conversationId: input.conversationId,
    role: 'ASSISTANT' as const,
    parts: MessageParts.parse(m.parts),
    modelId: input.modelId,
  }));
  await deps.db
    .insert(schema.messages)
    .values(rows)
    .onConflictDoNothing({ target: schema.messages.id });
  // Bump the conversation's lastReplacedAt-equivalent — not modelled yet; this
  // is a good spot when we add Conversation.updatedAt.
  await deps.db
    .update(schema.conversations)
    .set({ modelId: input.modelId })
    .where(sql`${schema.conversations.id} = ${input.conversationId}`);
}

function deriveTitle(firstUserText: string | undefined): string {
  if (!firstUserText) return TITLE_FALLBACK;
  const trimmed = firstUserText.trim().replace(/\s+/g, ' ');
  if (!trimmed) return TITLE_FALLBACK;
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Extract the plain-text content of the latest user message from a UIMessage[]
 * — useful for title derivation and persistence.
 */
export function extractFirstUserText(messages: UIMessage[]): string | undefined {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return undefined;
  return firstUser.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('')
    .trim();
}

export function lastMessage(messages: UIMessage[]): UIMessage | undefined {
  return messages[messages.length - 1];
}
