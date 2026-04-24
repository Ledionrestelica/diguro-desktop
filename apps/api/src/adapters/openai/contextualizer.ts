import { generateText, type LanguageModel } from 'ai';
import type {
  ContextualizeInput,
  ContextualizeResult,
  Contextualizer,
} from '../../ports/contextualizer.ts';

/**
 * OpenAI-backed contextualizer using GPT-5-nano with reasoningEffort=minimal.
 *
 * The Responses API does automatic prefix caching, so calls that share a
 * leading prompt get a cached-input discount without us managing any
 * cache_control flag. We read AI-SDK's `cachedInputTokens` to capture the
 * discount cleanly in the tokenUsage row.
 */

const CONTEXTUALIZE_PROMPT = `<document>
{{DOCUMENT}}
</document>
Here is the chunk we want to situate within the whole document:
<chunk>
{{CHUNK}}
</chunk>
Please give a short, succinct context (1-2 sentences) to situate this chunk
within the overall document for the purposes of improving search retrieval
of the chunk. Include the section name or number if visible, the topic it
covers, and any key terms or entity names that appear in it. Answer only
with the succinct context — no preamble, no "Here is the context:".`;

export function createOpenAIContextualizer(
  model: LanguageModel,
  modelId: string,
): Contextualizer {
  return {
    async prefixForChunk(input: ContextualizeInput): Promise<ContextualizeResult> {
      const prompt = CONTEXTUALIZE_PROMPT
        .replace('{{DOCUMENT}}', input.fullText)
        .replace('{{CHUNK}}', input.chunkText);

      const startedAt = Date.now();
      const result = await generateText({
        model,
        prompt,
        providerOptions: {
          openai: { reasoningEffort: 'minimal' },
        },
      });
      return {
        prefix: result.text.trim(),
        usage: normalizeUsage({
          modelId,
          usage: result.usage,
          response: result.response,
          latencyMs: Date.now() - startedAt,
        }),
      };
    },
  };
}

function normalizeUsage(args: {
  modelId: string;
  usage: unknown;
  response: unknown;
  latencyMs: number;
}): import('../../ports/usage.ts').CallUsage {
  const u = (args.usage ?? {}) as Record<string, unknown>;
  const totalInput = numeric(u['inputTokens']) ?? numeric(u['promptTokens']) ?? 0;
  const cached = numeric(u['cachedInputTokens']) ?? numeric(u['cachedPromptTokens']) ?? 0;
  const reasoning = numeric(u['reasoningTokens']) ?? 0;
  const totalOutput = numeric(u['outputTokens']) ?? numeric(u['completionTokens']) ?? 0;
  const response = (args.response ?? {}) as Record<string, unknown>;
  const requestId = typeof response['id'] === 'string' ? response['id'] : null;

  return {
    modelId: args.modelId,
    promptTokens: Math.max(0, totalInput - cached),
    cachedInputTokens: cached,
    completionTokens: Math.max(0, totalOutput - reasoning),
    reasoningTokens: reasoning,
    providerRequestId: requestId,
    latencyMs: args.latencyMs,
  };
}

function numeric(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
