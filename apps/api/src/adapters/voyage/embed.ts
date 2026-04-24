import { z } from 'zod';
import type {
  EmbedDocumentsResult,
  EmbedProvider,
  EmbedQueryResult,
} from '../../ports/embedProvider.ts';
import type { CallUsage } from '../../ports/usage.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * Voyage-3-large. 1024-dim, locked per DB — swapping models requires a full
 * re-embed + Postgres column migration. Uses REST (no SDK needed).
 *
 * Each call returns `CallUsage` with provider-reported total tokens so the
 * caller can write an accurate tokenUsage row.
 */

const MODEL = 'voyage-3-large';
const MODEL_ID = `voyage/${MODEL}`;
const DIMENSIONS = 1024;
const MAX_BATCH = 16;
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';

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
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type Parsed = z.infer<typeof EmbedResponse>;

export interface VoyageDeps {
  apiKey: string;
  logger: Logger;
}

export function createVoyageEmbedProvider(deps: VoyageDeps): EmbedProvider {
  async function call(
    inputs: readonly string[],
    inputType: 'document' | 'query',
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
      const { parsed, requestId } = await callBatch(deps, batch, inputType);
      const baseOffset = batchIdx * MAX_BATCH;
      for (const entry of parsed.data) {
        out[baseOffset + entry.index] = entry.embedding;
      }
      totalTokens += parsed.usage?.total_tokens ?? 0;
      if (requestId) lastRequestId = requestId;
    }

    const final: number[][] = new Array<number[]>(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!v) throw new Error(`Voyage response missing embedding at index ${i}`);
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
    embedDocuments: async (inputs): Promise<EmbedDocumentsResult> =>
      call(inputs, 'document'),
    embedQuery: async (input): Promise<EmbedQueryResult> => {
      const { vectors, usage } = await call([input], 'query');
      const vector = vectors[0];
      if (!vector) throw new Error('Voyage returned no embedding for query');
      return { vector, usage };
    },
  };
}

async function callBatch(
  deps: VoyageDeps,
  batch: string[],
  inputType: 'document' | 'query',
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
        input_type: inputType,
      }),
    });

    if (res.ok) {
      const raw: unknown = await res.json();
      const parsed = EmbedResponse.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Voyage response shape mismatch: ${parsed.error.message}`);
      }
      return { parsed: parsed.data, requestId: res.headers.get('x-request-id') };
    }

    const retriable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => '');
    if (!retriable || attempt >= MAX_RETRIES) {
      throw new Error(`Voyage ${res.status}: ${body.slice(0, 500)}`);
    }

    const retryAfterHeader = res.headers.get('retry-after');
    const delayMs = resolveBackoffMs(retryAfterHeader, attempt);
    deps.logger.warn('voyage retry', {
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
