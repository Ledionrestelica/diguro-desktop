/**
 * Contextualizer port. For each chunk of a document, produces a 1-2 sentence
 * prefix that situates the chunk within the overall document — its section,
 * role, what topic it contributes to the parent. This prefix is prepended
 * to the chunk text at embedding time (not stored as the chunk body — we
 * keep the raw chunk intact for citations and UI display).
 *
 * Anthropic's published "contextual retrieval" technique: per their
 * benchmarks, ~35% reduction in retrieval failures on top of plain dense
 * retrieval, and another lift when combined with reranking. Cost is
 * dominated by input tokens (the doc body) — prompt caching makes per-chunk
 * incremental cost near zero.
 *
 * Implementations: Anthropic (Haiku 4.5 + cache_control) today; could swap
 * to a cheaper model or a fine-tuned summarizer later without touching the
 * ingestion pipeline.
 */
export interface Contextualizer {
  prefixForChunk(input: ContextualizeInput): Promise<string>;
}

export interface ContextualizeInput {
  /** Entire document body — cached by implementations that support it. */
  fullText: string;
  /** The specific chunk to situate within the document. */
  chunkText: string;
}
