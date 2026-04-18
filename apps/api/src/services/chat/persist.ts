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

export interface UpsertConversationResult {
  /** True when the conversation row was just created; false when it already existed. */
  isNew: boolean;
}

/**
 * Create the conversation row if it doesn't exist yet. Idempotent — subsequent
 * messages in the same conversation reuse it via onConflictDoNothing. Returns
 * whether the row was freshly inserted, so callers can trigger one-time side
 * effects (e.g. AI title generation) only on first creation.
 */
export async function upsertConversation(
  deps: { db: Db },
  input: UpsertConversationInput,
): Promise<UpsertConversationResult> {
  const title = deriveTitle(input.firstUserText);
  const inserted = await deps.db
    .insert(schema.conversations)
    .values({
      id: input.conversationId,
      userId: input.userId,
      organizationId: input.organizationId,
      title,
      modelId: input.modelId,
    })
    .onConflictDoNothing({ target: schema.conversations.id })
    .returning({ id: schema.conversations.id });
  return { isNew: inserted.length > 0 };
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
  const seenSourceUrls = new Set<string>();
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const type = (raw as { type?: unknown }).type;
    if (typeof type !== 'string') continue;
    const isToolPart = type.startsWith('tool-') && type.length > 5;
    if (
      type !== 'text' &&
      type !== 'file' &&
      type !== 'citation' &&
      type !== 'source-url' &&
      !isToolPart
    ) {
      continue;
    }
    if (type === 'text') {
      const text = (raw as { text?: unknown }).text;
      if (typeof text !== 'string' || text.length === 0) continue;
    }
    if (type === 'source-url') {
      // AI-SDK may emit provider-metadata fields on source parts. Strip
      // unknown keys and drop duplicate URLs (search tools repeat sources).
      const sourceId = (raw as { sourceId?: unknown }).sourceId;
      const url = (raw as { url?: unknown }).url;
      const title = (raw as { title?: unknown }).title;
      if (typeof url !== 'string' || url.length === 0) continue;
      if (seenSourceUrls.has(url)) continue;
      seenSourceUrls.add(url);
      const clean = {
        type: 'source-url' as const,
        sourceId: typeof sourceId === 'string' ? sourceId : url,
        url,
        ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
      };
      const parsed = MessagePart.safeParse(clean);
      if (parsed.success) out.push(parsed.data);
      continue;
    }
    if (isToolPart) {
      // AI-SDK emits extra fields (providerMetadata, rawInput, etc.) on tool
      // parts. Strip to just the shape we persist; skip mid-stream states
      // so we only store the final result of a completed tool call.
      const state = (raw as { state?: unknown }).state;
      if (state !== 'output-available' && state !== 'output-error') continue;
      const toolCallId = (raw as { toolCallId?: unknown }).toolCallId;
      if (typeof toolCallId !== 'string' || toolCallId.length === 0) continue;
      const input = (raw as { input?: unknown }).input;
      const output = (raw as { output?: unknown }).output;
      const errorText = (raw as { errorText?: unknown }).errorText;
      const clean = {
        type,
        toolCallId,
        state,
        ...(input !== undefined ? { input } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(typeof errorText === 'string' ? { errorText } : {}),
      };
      const parsed = MessagePart.safeParse(clean);
      if (parsed.success) out.push(parsed.data);
      continue;
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
