import { generateText, type LanguageModel } from 'ai';
import type {
  ContextualizeInput,
  ContextualizeResult,
  Contextualizer,
} from '../../ports/contextualizer.ts';

/**
 * Anthropic-backed contextualizer using Haiku 4.5 + ephemeral prompt caching.
 *
 * Cost math per 5000-token doc with 8 chunks:
 *   - Without caching: 8 × 5000 input = 40K tokens × $1/M = $0.04
 *   - With caching:    first chunk writes cache (5000 × $1.25/M = $0.00625),
 *                      subsequent 7 chunks read cache (7 × 5000 × $0.10/M =
 *                      $0.0035), + chunk-specific fresh text × 8 (~1K tokens
 *                      × $1/M = $0.001) + output (~30 tokens × 8 × $5/M =
 *                      $0.001)
 *   Total: ~$0.012 per doc — ~3× cheaper than uncached.
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

/**
 * `modelId` is the "provider/model" slug used for cost pricing — keeping
 * it explicit avoids coupling to AI-SDK's internal provider naming.
 */
export function createAnthropicContextualizer(
  model: LanguageModel,
  modelId: string,
): Contextualizer {
  return {
    async prefixForChunk(input: ContextualizeInput): Promise<ContextualizeResult> {
      const startedAt = Date.now();
      const result = await generateText({
        model,
        // Two-part user message: cached doc body + fresh chunk-specific
        // instruction. cache_control on the first part tells Anthropic to
        // cache the prefix up to that marker.
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `<document>\n${input.fullText}\n</document>`,
                providerOptions: {
                  anthropic: { cacheControl: { type: 'ephemeral' } },
                },
              },
              {
                type: 'text',
                text: instructionTextFor(input.chunkText),
              },
            ],
          },
        ],
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

function instructionTextFor(chunkText: string): string {
  return CONTEXTUALIZE_PROMPT
    .replace('<document>\n{{DOCUMENT}}\n</document>\n', '')
    .replace('{{CHUNK}}', chunkText);
}

// Local helper — keeps generateText-result normalization in one place.
// Duplicated in the OpenAI adapter; if a third contextualizer lands,
// extract to a shared module.
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
