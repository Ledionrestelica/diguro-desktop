import { z } from 'zod';
import type {
  EmbedDocumentsResult,
  EmbedProvider,
  EmbedQueryResult,
} from '../../ports/embedProvider.ts';
import type { CallUsage } from '../../ports/usage.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * OpenAI text-embedding-3-large, requested at 1024 dimensions to match
 * the existing pgvector column. OpenAI's newer embeddings use matryoshka
 * representation learning — a 1024-dim truncation is a principled
 * projection of the full 3072-dim vector, not a lossy crop.
 *
 * Every call returns a `CallUsage` with provider-reported input tokens,
 * so the caller can write a tokenUsage row tagged with the right scope
 * (chat conversation for queries, resource version for ingest).
 */

const MODEL = 'text-embedding-3-large';
const MODEL_ID = `openai/${MODEL}`;
const DIMENSIONS = 1024;
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
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type Parsed = z.infer<typeof EmbedResponse>;

export interface OpenAIEmbedDeps {
  apiKey: string;
  logger: Logger;
}

export function createOpenAIEmbedProvider(deps: OpenAIEmbedDeps): EmbedProvider {
  async function call(
    inputs: readonly string[],
  ): Promise<{ vectors: number[][]; usage: CallUsage }> {
    const batches: string[][] = [];
    for (let i = 0; i < inputs.length; i += MAX_BATCH) {
      batches.push([...inputs.slice(i, i + MAX_BATCH)]);
    }

    const out: (number[] | undefined)[] = Array.from({ length: inputs.length });
    let totalTokens = 0;
    let lastRequestId: string | null = null;
    const startedAt = Date.now();

    for (const [batchIdx, batch] of batches.entries()) {
      const { parsed, requestId } = await callBatch(deps, batch);
      const baseOffset = batchIdx * MAX_BATCH;
      for (const entry of parsed.data) {
        out[baseOffset + entry.index] = entry.embedding;
      }
      totalTokens += parsed.usage?.prompt_tokens ?? parsed.usage?.total_tokens ?? 0;
      if (requestId) lastRequestId = requestId;
    }

    const final: number[][] = new Array<number[]>(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!v) throw new Error(`OpenAI returned no embedding at index ${i}`);
      final[i] = v;
    }

    return {
      vectors: final,
      usage: {
        modelId: MODEL_ID,
        promptTokens: totalTokens,
        providerRequestId: lastRequestId,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  return {
    dimensions: DIMENSIONS,
    embedDocuments: async (inputs): Promise<EmbedDocumentsResult> => call(inputs),
    embedQuery: async (input): Promise<EmbedQueryResult> => {
      const { vectors, usage } = await call([input]);
      const vector = vectors[0];
      if (!vector) throw new Error('OpenAI returned no embedding for query');
      return { vector, usage };
    },
  };
}

async function callBatch(
  deps: OpenAIEmbedDeps,
  batch: string[],
): Promise<{ parsed: Parsed; requestId: string | null }> {
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
      return { parsed: parsed.data, requestId: res.headers.get('x-request-id') };
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
