import { generateText, type LanguageModel } from 'ai';
import type {
  ContextualizeInput,
  Contextualizer,
} from '../../ports/contextualizer.ts';

/**
 * OpenAI-backed contextualizer using GPT-5-nano with reasoningEffort=minimal.
 *
 * Why GPT-5-nano:
 *   - $0.05/M input, $0.40/M output — the cheapest option in the roster.
 *   - Good-enough quality for this task (generating a 1-2 sentence topic
 *     label); we're not asking for judgment, just paraphrase.
 *   - The Responses API does automatic prefix caching: calls that share
 *     the same leading tokens get discounted input, giving us an effective
 *     cache hit rate close to Anthropic's explicit cache without any
 *     cache_control flag to manage.
 *
 * Why reasoningEffort=minimal:
 *   - gpt-5-nano is a reasoning model. Default effort burns output tokens
 *     on internal reasoning, producing short or empty text in return.
 *   - "minimal" tells the API we want the visible answer immediately.
 *     Same pattern we apply to the conversation-title generator.
 *
 * Cost per 5K-token doc, 8 chunks, no caching:
 *   - input: 8 × 5K × $0.05/M = $0.002
 *   - output: 8 × 30 × $0.40/M = $0.0001
 *   - ~$0.002/doc. With the Responses API's automatic prefix caching the
 *     effective cost is lower still.
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

export function createOpenAIContextualizer(model: LanguageModel): Contextualizer {
  return {
    async prefixForChunk(input: ContextualizeInput): Promise<string> {
      const prompt = CONTEXTUALIZE_PROMPT
        .replace('{{DOCUMENT}}', input.fullText)
        .replace('{{CHUNK}}', input.chunkText);

      const { text } = await generateText({
        model,
        prompt,
        providerOptions: {
          openai: { reasoningEffort: 'minimal' },
        },
      });
      return text.trim();
    },
  };
}
