/**
 * Embedding provider port. One dimensionality is locked per database
 * (Voyage-3-large @ 1024 for us). Switching models = full re-embed + migration.
 * Services depend on this interface, never on a concrete adapter.
 */
export interface EmbedProvider {
  /** The dimension of vectors this provider returns. Must match the DB column. */
  readonly dimensions: number;

  /** Embed text chunks for indexing (uses provider's "document" input type). */
  embedDocuments(inputs: readonly string[]): Promise<number[][]>;

  /** Embed a user query (uses provider's "query" input type). */
  embedQuery(input: string): Promise<number[]>;
}
