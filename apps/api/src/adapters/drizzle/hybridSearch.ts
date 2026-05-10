import { sql, type Db } from '@diguro/db';

/**
 * Hybrid search over Chunk+Embedding. Runs vector and keyword searches in
 * parallel, then merges candidates with Reciprocal Rank Fusion.
 *
 * Scope isolation is enforced at the SQL layer — chunks outside the
 * caller's scope are filtered before ranking. Retrieval never crosses
 * organization / workspace / user boundaries.
 *
 * This lives in `adapters/drizzle/` (not `services/`) because the SQL is
 * Postgres-specific (pgvector `<=>`, tsvector, GIN). The RAG service
 * composes this with embedding + reranking, staying provider-agnostic.
 */

export type SearchScope =
  | { kind: 'organization'; organizationId: string }
  /** Workspace scope is a UNION of the workspace's own files + the parent
   *  organization's files. Lets a workspace chat surface org-wide docs
   *  (HR policies, brand guidelines, common templates) alongside its own,
   *  without having to switch the scope toggle. The organizationId is
   *  required because no FK lookup happens in the SQL — caller resolves it. */
  | { kind: 'workspace'; workspaceId: string; organizationId: string | null }
  | { kind: 'user'; userId: string };

export interface HybridSearchInput {
  /** Embedded query vector (1024-dim, Voyage-3-large). */
  queryEmbedding: number[];
  /** Raw query text for BM25-style keyword match. */
  queryText: string;
  scope: SearchScope;
  /** Candidates per modality before RRF merge. Default 50. */
  candidatesPerModality?: number;
  /** Restrict retrieval to these resource ids (in addition to the scope
   *  filter). Used by the chat # mention feature so the model only sees
   *  chunks from the file the user picked. Empty array = no filter. */
  resourceIds?: string[];
}

export interface HybridCandidate {
  chunkId: string;
  resourceId: string;
  resourceVersionId: string;
  resourceName: string;
  text: string;
  pageNumber: number | null;
  parentSectionId: string | null;
  /** Cosine distance from the query vector. Null if not in vector top-N. */
  vectorDistance: number | null;
  /** ts_rank_cd score. Null if not in keyword top-N. */
  keywordScore: number | null;
  /** Final RRF score — higher = better. */
  rrfScore: number;
}

/**
 * Reciprocal Rank Fusion constant. k=60 is the published value from the
 * RRF paper (Cormack 2009). Higher k softens the top-rank bonus; lower k
 * rewards being in position 1 more. 60 is the industry default for text.
 */
const RRF_K = 60;

export async function hybridSearch(
  db: Db,
  input: HybridSearchInput,
): Promise<HybridCandidate[]> {
  const [vectorHits, keywordHits] = await Promise.all([
    vectorSearch(db, input),
    keywordSearch(db, input),
  ]);
  return rrfMerge(vectorHits, keywordHits);
}

/* ------------------------------ vector ------------------------------ */

interface VectorRow extends Record<string, unknown> {
  chunk_id: string;
  resource_id: string;
  resource_version_id: string;
  resource_name: string;
  text: string;
  page_number: number | null;
  parent_section_id: string | null;
  distance: number;
}

async function vectorSearch(
  db: Db,
  input: HybridSearchInput,
): Promise<VectorRow[]> {
  const limit = input.candidatesPerModality ?? 50;
  const vecLiteral = toPgVectorLiteral(input.queryEmbedding);
  const scopeClause = scopeFilter(input.scope);
  const resourceClause = resourceIdsFilter(input.resourceIds);

  const result = await db.execute<VectorRow>(sql`
    SELECT c.id AS chunk_id,
           r.id AS resource_id,
           rv.id AS resource_version_id,
           r.name AS resource_name,
           c.text,
           c.page_number,
           c.parent_section_id,
           (e.vector <=> ${vecLiteral}::vector) AS distance
    FROM embeddings e
    JOIN chunks c ON c.id = e.chunk_id
    JOIN resource_versions rv ON rv.id = c.resource_version_id
    JOIN resources r ON r.id = rv.resource_id
    WHERE ${scopeClause}
      AND ${resourceClause}
      AND rv.id = r.current_version_id
      AND rv.ingest_status = 'DONE'
    ORDER BY e.vector <=> ${vecLiteral}::vector
    LIMIT ${limit}
  `);
  return result as unknown as VectorRow[];
}

/* ------------------------------ keyword ------------------------------ */

interface KeywordRow extends Record<string, unknown> {
  chunk_id: string;
  resource_id: string;
  resource_version_id: string;
  resource_name: string;
  text: string;
  page_number: number | null;
  parent_section_id: string | null;
  score: number;
}

async function keywordSearch(
  db: Db,
  input: HybridSearchInput,
): Promise<KeywordRow[]> {
  const limit = input.candidatesPerModality ?? 50;
  const scopeClause = scopeFilter(input.scope);
  const resourceClause = resourceIdsFilter(input.resourceIds);

  const result = await db.execute<KeywordRow>(sql`
    SELECT c.id AS chunk_id,
           r.id AS resource_id,
           rv.id AS resource_version_id,
           r.name AS resource_name,
           c.text,
           c.page_number,
           c.parent_section_id,
           ts_rank_cd(
             to_tsvector('english', c.text),
             plainto_tsquery('english', ${input.queryText})
           ) AS score
    FROM chunks c
    JOIN resource_versions rv ON rv.id = c.resource_version_id
    JOIN resources r ON r.id = rv.resource_id
    WHERE ${scopeClause}
      AND ${resourceClause}
      AND rv.id = r.current_version_id
      AND rv.ingest_status = 'DONE'
      AND to_tsvector('english', c.text) @@ plainto_tsquery('english', ${input.queryText})
    ORDER BY score DESC
    LIMIT ${limit}
  `);
  return result as unknown as KeywordRow[];
}

/* ------------------------------ merge ------------------------------ */

function rrfMerge(
  vectorHits: VectorRow[],
  keywordHits: KeywordRow[],
): HybridCandidate[] {
  const byId = new Map<string, HybridCandidate>();

  vectorHits.forEach((row, idx) => {
    byId.set(row.chunk_id, {
      chunkId: row.chunk_id,
      resourceId: row.resource_id,
      resourceVersionId: row.resource_version_id,
      resourceName: row.resource_name,
      text: row.text,
      pageNumber: row.page_number,
      parentSectionId: row.parent_section_id,
      vectorDistance: row.distance,
      keywordScore: null,
      rrfScore: 1 / (RRF_K + idx + 1),
    });
  });

  keywordHits.forEach((row, idx) => {
    const existing = byId.get(row.chunk_id);
    const contribution = 1 / (RRF_K + idx + 1);
    if (existing) {
      existing.keywordScore = row.score;
      existing.rrfScore += contribution;
    } else {
      byId.set(row.chunk_id, {
        chunkId: row.chunk_id,
        resourceId: row.resource_id,
        resourceVersionId: row.resource_version_id,
        resourceName: row.resource_name,
        text: row.text,
        pageNumber: row.page_number,
        parentSectionId: row.parent_section_id,
        vectorDistance: null,
        keywordScore: row.score,
        rrfScore: contribution,
      });
    }
  });

  return Array.from(byId.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

/* ------------------------------ helpers ------------------------------ */

function toPgVectorLiteral(vec: number[]): string {
  // pgvector expects a literal like "[0.1,0.2,...]". Join without spaces
  // to keep the on-wire payload small for 1024-dim vectors.
  return `[${vec.join(',')}]`;
}

function scopeFilter(scope: SearchScope) {
  switch (scope.kind) {
    case 'organization':
      return sql`r.organization_id = ${scope.organizationId}`;
    case 'workspace':
      // Union of workspace files + parent-org files. When the workspace
      // has no parent org (shouldn't happen in v1, but defensive) fall
      // back to workspace-only.
      return scope.organizationId
        ? sql`(r.workspace_id = ${scope.workspaceId} OR r.organization_id = ${scope.organizationId})`
        : sql`r.workspace_id = ${scope.workspaceId}`;
    case 'user':
      return sql`r.user_id = ${scope.userId}`;
  }
}

function resourceIdsFilter(ids: string[] | undefined) {
  if (!ids || ids.length === 0) return sql`TRUE`;
  // Build `r.id IN ($1, $2, ...)` with each id as its own bound parameter.
  // We avoided `= ANY(${ids})` because postgres-js doesn't reliably wrap a
  // JS array as a Postgres array parameter when used through Drizzle's
  // sql template — a single-element array unwraps to a bare scalar and
  // Postgres errors with "malformed array literal".
  const params = ids.map((id) => sql`${id}`);
  return sql`r.id IN (${sql.join(params, sql`, `)})`;
}
