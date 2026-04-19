import type { Db } from '@diguro/db';
import type { EmbedProvider } from '../../ports/embedProvider.ts';
import type { RerankProvider } from '../../ports/rerankProvider.ts';
import type { Logger } from '../../lib/logger.ts';
import {
  hybridSearch,
  type HybridCandidate,
  type SearchScope,
} from '../../adapters/drizzle/hybridSearch.ts';

/**
 * RAG search orchestration. Given a query + scope, returns the top K most
 * relevant chunks by:
 *   1. embed the query (Voyage query-mode)
 *   2. hybrid search (pgvector + tsvector, RRF-merged top 50)
 *   3. rerank with Cohere cross-encoder → top 8
 *
 * Rerank is graceful: if COHERE_API_KEY is missing the adapter throws on
 * first call, which we catch and fall back to the RRF-ranked top K. The
 * pipeline still works, just with lower precision — useful for dev or if
 * Cohere has an outage.
 *
 * Scope filter is enforced at the SQL layer — retrieval never crosses
 * organization / workspace / user boundaries.
 */

export interface SearchInput {
  queryText: string;
  scope: SearchScope;
  /** How many final results to return post-rerank. Default 8. */
  topK?: number;
  /** Candidates pulled from each modality before RRF/rerank. Default 50. */
  candidatesPerModality?: number;
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

  const queryEmbedding = await deps.embedProvider.embedQuery(input.queryText);
  const tEmbed = Date.now() - t0;

  const tHybridStart = Date.now();
  const candidates = await hybridSearch(deps.db, {
    queryEmbedding,
    queryText: input.queryText,
    scope: input.scope,
    ...(input.candidatesPerModality
      ? { candidatesPerModality: input.candidatesPerModality }
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
      const reranked = await deps.rerankProvider.rerank({
        query: input.queryText,
        documents: candidates.map((c) => c.text),
        topK,
      });
      const tRerank = Date.now() - tRerankStart;

      const results: SearchResult[] = [];
      for (const r of reranked) {
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
