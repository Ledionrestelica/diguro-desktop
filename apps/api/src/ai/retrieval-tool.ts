import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { Db } from '@diguro/db';
import type { EmbedProvider } from '../ports/embedProvider.ts';
import type { RerankProvider } from '../ports/rerankProvider.ts';
import type { Logger } from '../lib/logger.ts';
import { searchAndRerank } from '../services/rag/search.ts';
import { recordUsage } from '../services/usage/record.ts';
import type { SearchScope } from '../adapters/drizzle/hybridSearch.ts';

/**
 * `search_documents` tool — the chat model's window into the RAG index.
 * Per-request scope is baked in at tool-creation time (we instantiate one
 * tool per chat turn with the caller's scope closed over), so the model
 * literally cannot break scope isolation even if it tries.
 *
 * Usage telemetry: every embed + rerank call writes a tokenUsage row
 * tagged with the caller's userId and conversationId. Lets the admin
 * dashboard show per-chat retrieval cost.
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
  /** When set, retrieval is constrained to these resource ids. Drives the
   *  chat # mention feature — the user picks one file and the model only
   *  sees chunks from that file. Empty / undefined = unconstrained. */
  resourceIds?: string[];
  /** Context used for usage-row attribution. */
  telemetry: {
    userId: string;
    workspaceId: string | null;
    conversationId: string;
  };
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
  const focused = (deps.resourceIds?.length ?? 0) > 0;
  return tool({
    description: focused
      ? [
          'Search ONE specific document the user just pinned via a # mention.',
          'All retrieval results come from that single file — use this tool',
          'to find the passages relevant to the user\'s question within it.',
          'Cite the chunkId of each passage you reference using [cite:chunkId].',
        ].join(' ')
      : [
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
          ...(deps.resourceIds && deps.resourceIds.length > 0
            ? { resourceIds: deps.resourceIds }
            : {}),
          onUsage: (usage, kind) =>
            recordUsage(
              { db: deps.db, logger: deps.logger },
              {
                userId: deps.telemetry.userId,
                workspaceId: deps.telemetry.workspaceId,
                type: kind,
                modelId: usage.modelId,
                ...(usage.promptTokens !== undefined
                  ? { promptTokens: usage.promptTokens }
                  : {}),
                ...(usage.completionTokens !== undefined
                  ? { completionTokens: usage.completionTokens }
                  : {}),
                ...(usage.cachedInputTokens !== undefined
                  ? { cachedInputTokens: usage.cachedInputTokens }
                  : {}),
                ...(usage.reasoningTokens !== undefined
                  ? { reasoningTokens: usage.reasoningTokens }
                  : {}),
                ...(usage.units !== undefined ? { units: usage.units } : {}),
                ...(usage.requestCount !== undefined
                  ? { requestCount: usage.requestCount }
                  : {}),
                ...(usage.providerRequestId !== undefined
                  ? { providerRequestId: usage.providerRequestId }
                  : {}),
                ...(usage.latencyMs !== undefined
                  ? { latencyMs: usage.latencyMs }
                  : {}),
                conversationId: deps.telemetry.conversationId,
              },
            ),
        },
      );

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
          score: r.rerankScore ?? r.rrfScore,
        })),
      };
    },
  });
}
