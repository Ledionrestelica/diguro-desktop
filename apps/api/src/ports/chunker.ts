/**
 * Chunker port. Pure function — takes an extracted doc, returns chunks
 * ready to be written to the `chunks` table. No I/O, no framework
 * dependencies. The default implementation lives in
 * services/chunking/index.ts; swap for ColBERT-style or semantic chunking
 * later without touching the pipeline.
 */
export interface Chunker {
  chunk(input: ChunkerInput): Chunk[];
}

export interface ChunkerInput {
  /** Full extracted text, pages joined with blank lines. */
  fullText: string;
  /**
   * Per-page text. Used to derive `pageNumber` on each chunk by matching
   * offsets into page boundaries. Empty for pageless formats (MD/TXT).
   */
  pages: { pageNumber: number; text: string }[];
}

export interface Chunk {
  /** Ordinal position of the chunk within the doc, zero-based. */
  chunkIndex: number;
  /** Chunk text as it will be embedded (may have overlap with neighbors). */
  text: string;
  /** Char offset into `fullText` where this chunk starts (inclusive). */
  startOffset: number;
  /** Char offset into `fullText` where this chunk ends (exclusive). */
  endOffset: number;
  /**
   * 1-based page number the chunk starts on. Null when the source format
   * has no pages (MD/TXT/CSV/JSON).
   */
  pageNumber: number | null;
  /**
   * Parent-section id grouping adjacent chunks up to a larger token
   * budget. Parent-doc retrieval: match on the small chunk, return the
   * surrounding section to the model for context.
   */
  parentSectionId: string;
  /**
   * Pre-computed contextual prefix. For markdown docs, the chunker
   * populates this with the section header path (e.g.
   * "4. Access Control > 4.1 Identity and Authentication") so section
   * anchoring is preserved at embed time. Phase 3 LLM contextualizer
   * appends to this rather than overwriting, producing a combined prefix.
   * Null for plain text where no structural context is available.
   */
  contextualPrefix?: string | null;
}
