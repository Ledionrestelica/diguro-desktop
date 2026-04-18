import { z } from 'zod';
import type {
  RerankInput,
  RerankProvider,
  RerankResult,
} from '../../ports/rerankProvider.ts';

/**
 * Cohere Rerank v3.5. REST, no SDK dependency. Keeps one of CLAUDE.md's
 * locked-in quality decisions — replacing Jaccard/word-overlap with a
 * proper cross-encoder produces the biggest single-step lift we can buy.
 */

const MODEL = 'rerank-v3.5';
const ENDPOINT = 'https://api.cohere.ai/v2/rerank';

const RerankResponse = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      relevance_score: z.number(),
    }),
  ),
});

export interface CohereDeps {
  apiKey: string;
}

export function createCohereRerankProvider(deps: CohereDeps): RerankProvider {
  return {
    async rerank(input: RerankInput): Promise<RerankResult[]> {
      if (input.documents.length === 0) return [];

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          query: input.query,
          documents: input.documents,
          top_n: input.topK ?? input.documents.length,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Cohere ${res.status}: ${body.slice(0, 500)}`);
      }
      const raw: unknown = await res.json();
      const parsed = RerankResponse.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Cohere response shape mismatch: ${parsed.error.message}`);
      }
      return parsed.data.results.map((r) => ({
        index: r.index,
        score: r.relevance_score,
      }));
    },
  };
}
