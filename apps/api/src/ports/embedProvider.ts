import type { CallUsage } from './usage.ts';

/**
 * Embedding provider port. One dimensionality is locked per database
 * (Voyage-3-large @ 1024 for us). Switching models = full re-embed + migration.
 * Services depend on this interface, never on a concrete adapter.
 *
 * Each call returns its vector(s) plus provider-reported usage so the
 * caller can write a tokenUsage row with its scope context attached.
 */
export interface EmbedProvider {
  /** The dimension of vectors this provider returns. Must match the DB column. */
  readonly dimensions: number;

  /** Embed text chunks for indexing (uses provider's "document" input type). */
  embedDocuments(inputs: readonly string[]): Promise<EmbedDocumentsResult>;

  /** Embed a user query (uses provider's "query" input type). */
  embedQuery(input: string): Promise<EmbedQueryResult>;
}

export interface EmbedDocumentsResult {
  vectors: number[][];
  usage: CallUsage;
}

export interface EmbedQueryResult {
  vector: number[];
  usage: CallUsage;
}
