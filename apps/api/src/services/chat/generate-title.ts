import { generateText } from 'ai';
import type { ModelRegistry } from '../../ai/registry.ts';
import { DEFAULT_REWRITE_MODEL } from '../../ai/registry.ts';
import { eq, schema, type Db } from '@diguro/db';
import type { Logger } from '../../lib/logger.ts';

const SYSTEM = [
  'You generate short titles for chat conversations.',
  'Rules:',
  '- 3 to 6 words.',
  '- Title Case.',
  '- No quotes, no trailing punctuation.',
  '- Summarize the user intent, not echo their wording verbatim.',
  '- If the message is a greeting or ambiguous, respond exactly "New Chat".',
].join('\n');

const TITLE_MAX_CHARS = 60;

export interface GenerateTitleInput {
  conversationId: string;
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

  let model;
  try {
    model = deps.registry.resolve(input.modelId ?? DEFAULT_REWRITE_MODEL);
  } catch (err) {
    deps.logger.warn('title gen skipped: model unavailable', {
      conversationId: input.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: `First user message:\n${trimmed.slice(0, 800)}`,
    });

    const title = sanitizeTitle(text);
    if (!title) return;

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
