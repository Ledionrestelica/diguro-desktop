import { z } from 'zod';
import type { EmbedProvider } from '../../ports/embedProvider.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * OpenAI text-embedding-3-large, requested at 1024 dimensions to match
 * the existing pgvector column. OpenAI's newer embeddings use matryoshka
 * representation learning — a 1024-dim truncation is a principled
 * projection of the full 3072-dim vector, not a lossy crop. Benchmark
 * quality is very close to Voyage-3-large (within a few percent on
 * MIRACL / MTEB).
 *
 * Why offer it as an alternative to Voyage:
 *   - Pricing is comparable ($0.13/M input vs Voyage's $0.12/M).
 *   - Uses existing OPENAI_API_KEY — no second billing relationship.
 *   - OpenAI tier-1 rate limits are much higher than Voyage's free tier,
 *     so dev work doesn't stall on 3 RPM caps.
 *   - Swap between providers is one env var + re-ingest (vectors from
 *     different providers share a column but live in different semantic
 *     spaces — they must all come from the same provider to be
 *     comparable at query time).
 *
 * Retry pattern mirrors the Voyage adapter: exponential backoff on 429
 * and 5xx, respects Retry-After.
 */

const MODEL = 'text-embedding-3-large';
const DIMENSIONS = 1024;
/** OpenAI accepts up to 2048 inputs per request but charges per token;
 * we size batches to ~8K tokens per request to stay comfortable under
 * request-level size caps and keep a single 429 cheap to retry. */
const MAX_BATCH = 16;
const ENDPOINT = 'https://api.openai.com/v1/embeddings';

const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;
const MIN_BACKOFF_MS = 2_000;

const EmbedResponse = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()).length(DIMENSIONS),
      index: z.number().int().nonnegative(),
    }),
  ),
});

export interface OpenAIEmbedDeps {
  apiKey: string;
  logger: Logger;
}

export function createOpenAIEmbedProvider(deps: OpenAIEmbedDeps): EmbedProvider {
  async function call(inputs: readonly string[]): Promise<number[][]> {
    const batches: string[][] = [];
    for (let i = 0; i < inputs.length; i += MAX_BATCH) {
      batches.push([...inputs.slice(i, i + MAX_BATCH)]);
    }

    const out: (number[] | undefined)[] = Array.from({ length: inputs.length });
    for (const [batchIdx, batch] of batches.entries()) {
      const parsed = await callBatch(deps, batch);
      const baseOffset = batchIdx * MAX_BATCH;
      for (const entry of parsed.data) {
        out[baseOffset + entry.index] = entry.embedding;
      }
    }

    const final: number[][] = new Array<number[]>(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!v) throw new Error(`OpenAI returned no embedding at index ${i}`);
      final[i] = v;
    }
    return final;
  }

  return {
    dimensions: DIMENSIONS,
    embedDocuments: call,
    embedQuery: async (input) => {
      const [v] = await call([input]);
      if (!v) throw new Error('OpenAI returned no embedding for query');
      return v;
    },
  };
}

async function callBatch(
  deps: OpenAIEmbedDeps,
  batch: string[],
): Promise<z.infer<typeof EmbedResponse>> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${deps.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: batch,
        dimensions: DIMENSIONS,
        encoding_format: 'float',
      }),
    });

    if (res.ok) {
      const raw: unknown = await res.json();
      const parsed = EmbedResponse.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`OpenAI embed response shape mismatch: ${parsed.error.message}`);
      }
      return parsed.data;
    }

    const retriable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => '');
    if (!retriable || attempt >= MAX_RETRIES) {
      throw new Error(`OpenAI embed ${res.status}: ${body.slice(0, 500)}`);
    }
    const delayMs = resolveBackoffMs(res.headers.get('retry-after'), attempt);
    deps.logger.warn('openai embed retry', {
      status: res.status,
      attempt: attempt + 1,
      delayMs,
      bodyPreview: body.slice(0, 200),
    });
    await sleep(delayMs);
  }
}

function resolveBackoffMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }
  }
  const expo = MIN_BACKOFF_MS * Math.pow(2, attempt);
  return Math.min(expo, MAX_BACKOFF_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
