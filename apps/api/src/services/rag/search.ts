import type { Db } from '@diguro/db';
import type { EmbedProvider } from '../../ports/embedProvider.ts';
import type { RerankProvider } from '../../ports/rerankProvider.ts';
import type { CallUsage } from '../../ports/usage.ts';
import type { Logger } from '../../lib/logger.ts';
import {
  hybridSearch,
  type HybridCandidate,
  type SearchScope,
} from '../../adapters/drizzle/hybridSearch.ts';

/**
 * RAG search orchestration. Given a query + scope, returns the top K most
 * relevant chunks by:
 *   1. embed the query
 *   2. hybrid search (pgvector + tsvector, RRF-merged top 50)
 *   3. rerank with Cohere cross-encoder → top 8
 *
 * Every provider call (embed + rerank) surfaces a `CallUsage` to the
 * optional `onUsage` callback so the caller can write tokenUsage rows
 * tagged with its scope (userId, conversationId). Rerank is graceful: if
 * the provider throws we fall back to the RRF top K and emit no usage
 * for the failed call.
 */

export interface SearchInput {
  queryText: string;
  scope: SearchScope;
  /** How many final results to return post-rerank. Default 8. */
  topK?: number;
  /** Candidates pulled from each modality before RRF/rerank. Default 50. */
  candidatesPerModality?: number;
  /** Restrict retrieval to these resource ids. Used by chat # mention to
   *  focus the model on a single file the user picked. */
  resourceIds?: string[];
  /** Called for each billable provider call. Errors are swallowed so
   *  telemetry issues never break retrieval. */
  onUsage?: (usage: CallUsage, kind: 'EMBED' | 'RERANK') => void | Promise<void>;
}

export interface SearchResult extends HybridCandidate {
  /** Cohere relevance score, or null when rerank was skipped. */
  rerankScore: number | null;
}

export interface SearchDeps {
  db: Db;
  embedProvider: EmbedProvider;
  rerankProvider: RerankProvider | null;
  logger: Logger;
}

export async function searchAndRerank(
  deps: SearchDeps,
  input: SearchInput,
): Promise<SearchResult[]> {
  const t0 = Date.now();
  const topK = input.topK ?? 8;

  const embedResult = await deps.embedProvider.embedQuery(input.queryText);
  await safeOnUsage(input.onUsage, embedResult.usage, 'EMBED', deps.logger);
  const tEmbed = Date.now() - t0;

  const tHybridStart = Date.now();
  const candidates = await hybridSearch(deps.db, {
    queryEmbedding: embedResult.vector,
    queryText: input.queryText,
    scope: input.scope,
    ...(input.candidatesPerModality
      ? { candidatesPerModality: input.candidatesPerModality }
      : {}),
    ...(input.resourceIds && input.resourceIds.length > 0
      ? { resourceIds: input.resourceIds }
      : {}),
  });
  const tHybrid = Date.now() - tHybridStart;

  if (candidates.length === 0) {
    deps.logger.info('rag search: zero candidates', {
      queryText: input.queryText.slice(0, 100),
      scope: input.scope.kind,
    });
    return [];
  }

  // Rerank path — Cohere cross-encoder over top-N candidates.
  if (deps.rerankProvider && candidates.length > 1) {
    const tRerankStart = Date.now();
    try {
      const rerankResponse = await deps.rerankProvider.rerank({
        query: input.queryText,
        documents: candidates.map((c) => c.text),
        topK,
      });
      await safeOnUsage(input.onUsage, rerankResponse.usage, 'RERANK', deps.logger);
      const tRerank = Date.now() - tRerankStart;

      const results: SearchResult[] = [];
      for (const r of rerankResponse.results) {
        const c = candidates[r.index];
        if (!c) continue;
        results.push({ ...c, rerankScore: r.score });
      }

      deps.logger.info('rag search timings', {
        queryText: input.queryText.slice(0, 100),
        scope: input.scope.kind,
        candidates: candidates.length,
        results: results.length,
        embedMs: tEmbed,
        hybridMs: tHybrid,
        rerankMs: tRerank,
        totalMs: Date.now() - t0,
      });
      return results;
    } catch (err) {
      deps.logger.warn('rerank failed, falling back to RRF top-K', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback / skip-rerank path: sort by RRF and take top-K.
  const fallback = candidates.slice(0, topK).map((c) => ({
    ...c,
    rerankScore: null as number | null,
  }));
  deps.logger.info('rag search timings (no rerank)', {
    queryText: input.queryText.slice(0, 100),
    scope: input.scope.kind,
    candidates: candidates.length,
    results: fallback.length,
    embedMs: tEmbed,
    hybridMs: tHybrid,
    totalMs: Date.now() - t0,
  });
  return fallback;
}

async function safeOnUsage(
  cb: SearchInput['onUsage'],
  usage: CallUsage,
  kind: 'EMBED' | 'RERANK',
  logger: Logger,
): Promise<void> {
  if (!cb) return;
  try {
    await cb(usage, kind);
  } catch (err) {
    logger.warn('search onUsage callback failed', {
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
