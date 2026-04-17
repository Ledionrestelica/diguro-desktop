import type { UIMessage } from 'ai';
import { sql, schema, type Db } from '@diguro/db';
import { MessagePart, MessageParts, type MessagePart as PersistablePart } from '@diguro/shared';

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
 * Save a user message. Parts are narrowed to our persistable shapes and
 * validated; unknown AI-SDK part types (step-start, source-*, file,
 * dynamic-tool-*) are dropped silently. See toPersistableParts.
 */
export async function persistUserMessage(
  deps: { db: Db },
  input: PersistUserMessageInput,
): Promise<void> {
  const parts = toPersistableParts(input.message.parts);
  if (parts.length === 0) return;
  await deps.db
    .insert(schema.messages)
    .values({
      id: ensureId(input.message.id),
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
): Promise<number> {
  if (input.messages.length === 0) return 0;
  const rows = input.messages
    .map((m) => ({
      id: ensureId(m.id),
      conversationId: input.conversationId,
      role: 'ASSISTANT' as const,
      parts: toPersistableParts(m.parts),
      modelId: input.modelId,
    }))
    .filter((row) => row.parts.length > 0);

  if (rows.length === 0) return 0;

  const inserted = await deps.db
    .insert(schema.messages)
    .values(rows)
    .onConflictDoNothing({ target: schema.messages.id })
    .returning({ id: schema.messages.id });

  await deps.db
    .update(schema.conversations)
    .set({ modelId: input.modelId })
    .where(sql`${schema.conversations.id} = ${input.conversationId}`);

  return inserted.length;
}

/**
 * AI-SDK v6 sometimes emits assistant messages with an empty id. Fall back
 * to a fresh UUID so each row has a distinct primary key.
 */
function ensureId(id: string | undefined): string {
  if (id && id.length > 0) return id;
  return crypto.randomUUID();
}

/**
 * Extract only the parts we persist and validate each. AI-SDK emits other
 * part types (step-start, source-*, dynamic-tool-*, reasoning) that we
 * don't store — step/source are UI signals, and replaying provider-specific
 * reasoning parts back to a different provider (e.g. OpenAI) causes
 * warnings. Unknown types are filtered out.
 *
 * `file` parts are kept — for now they carry base64 data URLs so the whole
 * attachment lives in Postgres. When the Resources system lands, `url` will
 * hold an S3 key and the server will resolve it to a presigned URL on read.
 */
function toPersistableParts(parts: unknown): PersistablePart[] {
  if (!Array.isArray(parts)) return [];
  const out: PersistablePart[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const type = (raw as { type?: unknown }).type;
    if (
      type !== 'text' &&
      type !== 'file' &&
      type !== 'tool-call' &&
      type !== 'citation'
    ) {
      continue;
    }
    if (type === 'text') {
      const text = (raw as { text?: unknown }).text;
      if (typeof text !== 'string' || text.length === 0) continue;
    }
    const parsed = MessagePart.safeParse(raw);
    if (parsed.success) out.push(parsed.data);
  }
  return MessageParts.parse(out);
}

function deriveTitle(firstUserText: string | undefined): string {
  if (!firstUserText) return TITLE_FALLBACK;
  const trimmed = firstUserText.trim().replace(/\s+/g, ' ');
  if (!trimmed) return TITLE_FALLBACK;
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Extract the plain-text content of the first user message for title derivation.
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
