import { generateText } from 'ai';
import type { ModelRegistry } from '../../ai/registry.ts';
import { DEFAULT_REWRITE_MODEL } from '../../ai/registry.ts';
import { eq, schema, type Db } from '@diguro/db';
import type { Logger } from '../../lib/logger.ts';
import { recordUsage } from '../usage/record.ts';

const SYSTEM = [
  'You generate short titles for chat conversations.',
  'Rules:',
  '- 3 to 6 words.',
  '- Title Case.',
  '- No quotes, no trailing punctuation.',
  '- Summarize the user intent, not echo their wording verbatim.',
  '- Always produce a meaningful, specific title — never "New Chat", "Chat",',
  '  or any generic placeholder. For greetings, describe the greeting (e.g.',
  '  "Friendly Hello Intro"). For one-word inputs, infer the likely topic.',
].join('\n');

const GENERIC_TITLES = new Set(['new chat', 'chat', 'new conversation', 'conversation']);

const TITLE_MAX_CHARS = 60;

export interface GenerateTitleInput {
  conversationId: string;
  /** User whose conversation this is — usage is attributed to them. */
  userId: string;
  firstUserText: string;
  modelId?: string;
}

/**
 * Generate a short title for a new conversation using a cheap/fast model and
 * write it back to the `conversations` row. Safe to call fire-and-forget —
 * errors are swallowed with a logged warning; the row retains whatever
 * provisional title was set at upsert time.
 *
 * Skipped silently when the registry can't resolve the model (e.g. no
 * OpenAI key configured in dev).
 */
export async function generateAndApplyConversationTitle(
  deps: { registry: ModelRegistry; db: Db; logger: Logger },
  input: GenerateTitleInput,
): Promise<void> {
  const trimmed = input.firstUserText.trim();
  if (!trimmed) return;

  const modelId = input.modelId ?? DEFAULT_REWRITE_MODEL;
  let model;
  try {
    model = deps.registry.resolve(modelId);
  } catch (err) {
    deps.logger.warn('title gen skipped: model unavailable', {
      conversationId: input.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    const startedAt = Date.now();
    const result = await generateText({
      model,
      system: SYSTEM,
      prompt: `First user message:\n${trimmed.slice(0, 800)}`,
      // gpt-5-nano + Responses API defaults to higher reasoning effort, which
      // can eat the whole completion and leave `text` empty. Titles don't need
      // reasoning — force minimal so the model emits text immediately.
      providerOptions: {
        openai: { reasoningEffort: 'minimal' },
      },
    });
    const text = result.text;

    // Record usage before title validation — we paid for the call whether
    // or not the generated title was usable.
    const u = (result.usage ?? {}) as Record<string, unknown>;
    const totalInput =
      asNumber(u['inputTokens']) ?? asNumber(u['promptTokens']) ?? 0;
    const cached =
      asNumber(u['cachedInputTokens']) ?? asNumber(u['cachedPromptTokens']) ?? 0;
    const reasoning = asNumber(u['reasoningTokens']) ?? 0;
    const totalOutput =
      asNumber(u['outputTokens']) ?? asNumber(u['completionTokens']) ?? 0;
    await recordUsage(
      { db: deps.db, logger: deps.logger },
      {
        userId: input.userId,
        workspaceId: null,
        type: 'TITLE',
        modelId,
        promptTokens: Math.max(0, totalInput - cached),
        cachedInputTokens: cached,
        completionTokens: Math.max(0, totalOutput - reasoning),
        reasoningTokens: reasoning,
        providerRequestId:
          typeof result.response?.id === 'string' ? result.response.id : null,
        latencyMs: Date.now() - startedAt,
        conversationId: input.conversationId,
      },
    );

    const title = sanitizeTitle(text);
    if (!title) return;
    // Guard against the model returning a generic placeholder — keep the
    // provisional title (first user text) instead of overwriting with it.
    if (GENERIC_TITLES.has(title.toLowerCase())) return;

    await deps.db
      .update(schema.conversations)
      .set({ title })
      .where(eq(schema.conversations.id, input.conversationId));

    deps.logger.info('conversation title generated', {
      conversationId: input.conversationId,
      title,
    });
  } catch (err) {
    deps.logger.warn('title gen failed', {
      conversationId: input.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sanitizeTitle(raw: string): string {
  let s = raw.trim();
  // Strip surrounding quotes if the model returned a quoted string
  s = s.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '');
  // Take the first line only
  const firstLine = s.split(/\r?\n/)[0] ?? s;
  s = firstLine.trim();
  // Strip trailing punctuation
  s = s.replace(/[.!?,;:]+$/g, '').trim();
  if (s.length === 0) return '';
  if (s.length > TITLE_MAX_CHARS) s = `${s.slice(0, TITLE_MAX_CHARS).trimEnd()}…`;
  return s;
}
