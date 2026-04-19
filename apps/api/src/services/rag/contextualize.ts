import { eq, schema, type Db } from '@diguro/db';
import type { Contextualizer } from '../../ports/contextualizer.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * Orchestrate contextual-prefix generation for every chunk of a version.
 * Parallel with a concurrency limit to stay under provider rate limits;
 * failures are swallowed per-chunk so one bad call doesn't kill the whole
 * batch — chunks without a prefix still embed fine, just without the
 * contextual lift.
 */

/** Max simultaneous Anthropic calls. Haiku 4.5's RPM cap is generous but
 * we stay well under to leave room for parallel ingest jobs. */
const CONCURRENCY = 8;

/** Anthropic's cache minimum for Haiku. Below this the cache isn't used
 * even if we mark cache_control — we'd pay full price on every call. For
 * tiny docs (extracted text under threshold) we skip contextualization
 * entirely: the retrieval lift wouldn't be worth the spend. */
const MIN_DOC_CHARS_FOR_CACHE = 2048 * 4; // ~2048 tokens × 4 chars/token

export interface ContextualizeDeps {
  db: Db;
  contextualizer: Contextualizer;
  logger: Logger;
}

export interface ContextualizeInput {
  resourceVersionId: string;
  fullText: string;
}

export interface ContextualizeResult {
  /** Chunks considered. */
  total: number;
  /** Chunks for which a prefix was generated + written. */
  succeeded: number;
  /** Chunks that failed — embedded without a prefix. */
  failed: number;
  /** True when the doc was under the cache threshold and we skipped the whole pass. */
  skipped: boolean;
}

export async function contextualizeChunks(
  deps: ContextualizeDeps,
  input: ContextualizeInput,
): Promise<ContextualizeResult> {
  const chunks = await deps.db
    .select({
      id: schema.chunks.id,
      text: schema.chunks.text,
      contextualPrefix: schema.chunks.contextualPrefix,
    })
    .from(schema.chunks)
    .where(eq(schema.chunks.resourceVersionId, input.resourceVersionId));

  if (chunks.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, skipped: false };
  }

  // Short docs: contextualization isn't free and the cache doesn't kick
  // in below Anthropic's minimum. A 1-page doc with 2 chunks: skip.
  if (input.fullText.length < MIN_DOC_CHARS_FOR_CACHE) {
    deps.logger.info('contextualize: skipping short doc', {
      resourceVersionId: input.resourceVersionId,
      docChars: input.fullText.length,
      chunkCount: chunks.length,
    });
    return { total: chunks.length, succeeded: 0, failed: 0, skipped: true };
  }

  let succeeded = 0;
  let failed = 0;

  await runWithConcurrency(chunks, CONCURRENCY, async (chunk) => {
    try {
      const prefix = await deps.contextualizer.prefixForChunk({
        fullText: input.fullText,
        chunkText: chunk.text,
      });
      // Sanitize: collapse newlines, cap length. The prefix goes in front
      // of chunk text at embed time; we don't want a 2000-token monologue
      // burning input tokens.
      const clean = prefix.replace(/\s+/g, ' ').trim().slice(0, 400);
      if (clean.length === 0) throw new Error('empty prefix');

      // Append to any existing prefix (e.g. the markdown chunker's
      // heading path) rather than replace it — we want both structural
      // and semantic context anchoring the chunk at embed time.
      const existing = chunk.contextualPrefix?.trim() ?? '';
      const merged = existing.length > 0 ? `${existing}\n${clean}` : clean;

      await deps.db
        .update(schema.chunks)
        .set({ contextualPrefix: merged })
        .where(eq(schema.chunks.id, chunk.id));
      succeeded += 1;
    } catch (err) {
      failed += 1;
      deps.logger.warn('contextualize chunk failed', {
        chunkId: chunk.id,
        resourceVersionId: input.resourceVersionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  deps.logger.info('contextualize complete', {
    resourceVersionId: input.resourceVersionId,
    total: chunks.length,
    succeeded,
    failed,
  });

  return { total: chunks.length, succeeded, failed, skipped: false };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      if (item === undefined) continue;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
