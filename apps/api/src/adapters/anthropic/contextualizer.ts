import { generateText, type LanguageModel } from 'ai';
import type {
  ContextualizeInput,
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
 *
 * The exact cache hit rate depends on timing — Anthropic's ephemeral cache
 * has a 5-minute TTL. Our ingest pipeline runs each chunk back-to-back with
 * a concurrency limit, so calls land well inside the TTL.
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

export function createAnthropicContextualizer(model: LanguageModel): Contextualizer {
  return {
    async prefixForChunk(input: ContextualizeInput): Promise<string> {
      const { text } = await generateText({
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
      return text.trim();
    },
  };
}

function instructionTextFor(chunkText: string): string {
  return CONTEXTUALIZE_PROMPT
    .replace('<document>\n{{DOCUMENT}}\n</document>\n', '')
    .replace('{{CHUNK}}', chunkText);
}
