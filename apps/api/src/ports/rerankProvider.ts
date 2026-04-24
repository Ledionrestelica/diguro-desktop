import type { CallUsage } from './usage.ts';

/**
 * Reranker port. Takes a query + candidate documents, returns the candidates
 * reordered by relevance with a score. Concrete implementations are model-
 * specific (Cohere Rerank 3.5 for us). Services depend on this interface.
 *
 * Rerank is billed per-request, not per-token. `usage.requestCount` should
 * be 1 for a normal call; the cost calculator multiplies by per-request
 * pricing.
 */
export interface RerankProvider {
  rerank(input: RerankInput): Promise<RerankResponse>;
}

export interface RerankInput {
  query: string;
  /**
   * Documents to score. Keep short enough that the provider accepts them —
   * Cohere currently caps each at 4096 tokens of context total (including
   * the query). We pre-truncate at the chunk level before sending.
   */
  documents: readonly string[];
  /** Return only the top-k. Default: all. */
  topK?: number;
}

export interface RerankResponse {
  results: RerankResult[];
  usage: CallUsage;
}

export interface RerankResult {
  /** Index into the original `documents` array. */
  index: number;
  /** Relevance score (higher = more relevant). Provider-specific scale. */
  score: number;
}
