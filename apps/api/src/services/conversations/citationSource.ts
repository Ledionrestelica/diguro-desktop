import { and, eq, schema, type Db } from '@diguro/db';
import { ResourceNotFound } from '@diguro/shared/errors';
import type { ObjectStore } from '../../ports/objectStore.ts';

export interface CitationSource {
  /** Short-lived URL for the exact file version the citation came from. */
  url: string;
  downloadUrl: string;
  name: string;
  mimeType: string;
  pageNumber: number | null;
  pageCount: number | null;
  /** The cited passage (the chunk's text), used to highlight it in the file. */
  passage: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  updatedAt: string;
}

const URL_TTL_SECONDS = 15 * 60;

/**
 * The file behind a citation, for the document preview. Access follows the
 * chat: only the owner of the conversation the citation belongs to can open
 * it. The URL points at the cited version (not the current one), so a
 * citation keeps opening the text it quoted after the file is replaced.
 */
export async function getCitationSource(
  deps: { db: Db; objectStore: ObjectStore },
  input: { userId: string; citationId: string },
): Promise<CitationSource> {
  const [row] = await deps.db
    .select({
      name: schema.resources.name,
      currentVersionId: schema.resources.currentVersionId,
      versionId: schema.resourceVersions.id,
      versionNumber: schema.resourceVersions.versionNumber,
      s3Key: schema.resourceVersions.s3Key,
      s3Deleted: schema.resourceVersions.s3Deleted,
      mimeType: schema.resourceVersions.mimeType,
      pageCount: schema.resourceVersions.pageCount,
      createdAt: schema.resourceVersions.createdAt,
      pageNumber: schema.chunks.pageNumber,
      passage: schema.chunks.text,
    })
    .from(schema.citations)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.citations.messageId))
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .innerJoin(schema.chunks, eq(schema.chunks.id, schema.citations.chunkId))
    .innerJoin(
      schema.resourceVersions,
      eq(schema.resourceVersions.id, schema.chunks.resourceVersionId),
    )
    .innerJoin(schema.resources, eq(schema.resources.id, schema.resourceVersions.resourceId))
    .where(
      and(eq(schema.citations.id, input.citationId), eq(schema.conversations.userId, input.userId)),
    )
    .limit(1);

  if (!row || row.s3Deleted) throw new ResourceNotFound(input.citationId);

  const [url, downloadUrl] = await Promise.all([
    deps.objectStore.presignGet({ key: row.s3Key, expiresInSeconds: URL_TTL_SECONDS }),
    deps.objectStore.presignGet({
      key: row.s3Key,
      expiresInSeconds: URL_TTL_SECONDS,
      downloadAs: row.name,
    }),
  ]);

  return {
    url,
    downloadUrl,
    name: row.name,
    mimeType: row.mimeType,
    pageNumber: row.pageNumber,
    pageCount: row.pageCount,
    passage: row.passage,
    versionNumber: row.versionNumber,
    isCurrentVersion: row.currentVersionId === row.versionId,
    updatedAt: row.createdAt.toISOString(),
  };
}
