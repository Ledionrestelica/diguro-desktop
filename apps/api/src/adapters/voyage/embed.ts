import { z } from 'zod';
import type { EmbedProvider } from '../../ports/embedProvider.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * Voyage-3-large. 1024-dim, locked per DB — swapping models requires a full
 * re-embed + Postgres column migration. Uses REST (no SDK needed).
 *
 * Batching: Voyage accepts up to 128 inputs per request; we cap at 100 to
 * stay under their token-per-request limits too. We handle larger input
 * arrays by chunking the request.
 */

const MODEL = 'voyage-3-large';
const DIMENSIONS = 1024;
const MAX_BATCH = 100;
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

const EmbedResponse = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()).length(DIMENSIONS),
      index: z.number().int().nonnegative(),
    }),
  ),
});

export interface VoyageDeps {
  apiKey: string;
  logger: Logger;
}

export function createVoyageEmbedProvider(deps: VoyageDeps): EmbedProvider {
  async function call(
    inputs: readonly string[],
    inputType: 'document' | 'query',
  ): Promise<number[][]> {
    const batches: string[][] = [];
    for (let i = 0; i < inputs.length; i += MAX_BATCH) {
      batches.push([...inputs.slice(i, i + MAX_BATCH)]);
    }

    const out: (number[] | undefined)[] = Array.from({ length: inputs.length });
    for (const [batchIdx, batch] of batches.entries()) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: batch,
          input_type: inputType,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Voyage ${res.status}: ${body.slice(0, 500)}`);
      }
      const raw: unknown = await res.json();
      const parsed = EmbedResponse.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Voyage response shape mismatch: ${parsed.error.message}`);
      }
      // Voyage returns entries keyed by `index` within the request batch;
      // map back into the caller's original positions.
      const baseOffset = batchIdx * MAX_BATCH;
      for (const entry of parsed.data.data) {
        out[baseOffset + entry.index] = entry.embedding;
      }
    }

    // Safety: every slot must be filled before we return.
    const final: number[][] = new Array<number[]>(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!v) {
        throw new Error(`Voyage response missing embedding at index ${i}`);
      }
      final[i] = v;
    }
    return final;
  }

  return {
    dimensions: DIMENSIONS,
    embedDocuments: (inputs) => call(inputs, 'document'),
    embedQuery: async (input) => {
      const [v] = await call([input], 'query');
      if (!v) throw new Error('Voyage returned no embedding for query');
      return v;
    },
  };
}
