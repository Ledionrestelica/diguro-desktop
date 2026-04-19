import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { Db } from '@diguro/db';
import type { EmbedProvider } from '../ports/embedProvider.ts';
import type { RerankProvider } from '../ports/rerankProvider.ts';
import type { Logger } from '../lib/logger.ts';
import { searchAndRerank } from '../services/rag/search.ts';
import type { SearchScope } from '../adapters/drizzle/hybridSearch.ts';

/**
 * `search_documents` tool — the chat model's window into the RAG index.
 * Per-request scope is baked in at tool-creation time (we instantiate one
 * tool per chat turn with the caller's scope closed over), so the model
 * literally cannot break scope isolation even if it tries.
 *
 * The tool returns short excerpts + source metadata — not full chunk
 * bodies — to keep context tokens cheap. When the model wants the full
 * chunk or surrounding section it calls `view_document` (Phase 7b, TODO).
 */

const SearchInput = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Search phrase. Be specific — paraphrase the user question in retrieval-friendly terms, including key nouns and any known entity names.',
    ),
});

export type RetrievalToolDeps = {
  db: Db;
  embedProvider: EmbedProvider;
  rerankProvider: RerankProvider | null;
  logger: Logger;
  scope: SearchScope;
};

export interface RetrievalToolResult {
  results: Array<{
    chunkId: string;
    source: string;
    page: number | null;
    excerpt: string;
    score: number;
  }>;
  matched: number;
}

export function createRetrievalTool(deps: RetrievalToolDeps): Tool {
  return tool({
    description: [
      'Search the organization knowledge base for information relevant to a query.',
      'Use whenever the user asks about their uploaded files, contracts,',
      'policies, meeting minutes, or any org-specific information.',
      'Cite the chunkId of each passage you reference in your answer using',
      'the format [cite:chunkId].',
    ].join(' '),
    inputSchema: SearchInput,
    execute: async ({ query }): Promise<RetrievalToolResult> => {
      const results = await searchAndRerank(
        {
          db: deps.db,
          embedProvider: deps.embedProvider,
          rerankProvider: deps.rerankProvider,
          logger: deps.logger,
        },
        {
          queryText: query,
          scope: deps.scope,
          topK: 8,
        },
      );

      // Debug log — lets you see exactly which chunks won the top-K for a
      // given query. Critical for diagnosing "model said it couldn't find
      // X but X is in the corpus" failures — is the chunk missing, ranked
      // low, or retrieved-but-ignored by the model?
      deps.logger.info('search_documents results', {
        query: query.slice(0, 120),
        matched: results.length,
        top: results.map((r) => ({
          chunkId: r.chunkId,
          source: r.resourceName,
          page: r.pageNumber,
          score: r.rerankScore ?? r.rrfScore,
          preview: r.text.slice(0, 120).replace(/\s+/g, ' '),
        })),
      });

      return {
        matched: results.length,
        results: results.map((r) => ({
          chunkId: r.chunkId,
          source: r.resourceName,
          page: r.pageNumber,
          excerpt: r.text.length > 800 ? r.text.slice(0, 800) + '…' : r.text,
          // Prefer rerank score (0-1, higher = more relevant) when present;
          // fall back to RRF. Model can use this to decide confidence.
          score: r.rerankScore ?? r.rrfScore,
        })),
      };
    },
  });
}
