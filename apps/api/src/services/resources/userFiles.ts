import { and, desc, eq, schema, sql, type Db } from '@diguro/db';
import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import type { Queue } from '../../ports/queue.ts';
import type { Logger } from '../../lib/logger.ts';
import { recordAudit } from '../audit/record.ts';
import {
  FileTooLarge,
  Forbidden,
  ResourceNotFound,
  UnsupportedMimeType,
} from '@diguro/shared/errors';
import {
  ALLOWED_RESOURCE_MIME,
  MAX_RESOURCE_BYTES,
} from './organizationFiles.ts';

/**
 * User-scoped (personal) resource library. Mirrors the organization flow
 * but keyed on users.id — same upload flow, same ingestion pipeline, just
 * a different scope. Personal files are never visible to anyone else in
 * the organization; retrieval is strictly scope-isolated (CLAUDE.md).
 *
 * S3 layout:
 *   user/<userId>/resources/<resourceId>/v<n>/original<.ext>
 *
 * v1 intentionally skips folders for personal files — users have ~10s of
 * personal docs, not the kommun's 1-2k. Folders land in v1.1 if needed.
 */

export interface UserPresignInput {
  userId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface UserPresignResult {
  resourceId: string;
  versionId: string;
  upload: PresignedPut;
}

export async function initiateUserResourceUpload(
  deps: { db: Db; objectStore: ObjectStore },
  input: UserPresignInput,
): Promise<UserPresignResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_RESOURCE_BYTES) {
    throw new FileTooLarge(
      `File must be between 1 byte and ${MAX_RESOURCE_BYTES} bytes`,
    );
  }
  if (!ALLOWED_RESOURCE_MIME.has(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const resourceId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const s3Key = userResourceS3Key({
    userId: input.userId,
    resourceId,
    versionNumber: 1,
    ext,
  });

  await deps.db.transaction(async (tx) => {
    await tx.insert(schema.resources).values({
      id: resourceId,
      userId: input.userId,
      name: input.filename,
    });
    await tx.insert(schema.resourceVersions).values({
      id: versionId,
      resourceId,
      versionNumber: 1,
      sha256: '',
      s3Key,
      mimeType: input.contentType,
      fileSize: input.contentLength,
      uploaderId: input.userId,
      ingestStatus: 'PENDING_UPLOAD',
    });
    await tx
      .update(schema.resources)
      .set({ currentVersionId: versionId })
      .where(eq(schema.resources.id, resourceId));
  });

  const upload = await deps.objectStore.presignPut({
    key: s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return { resourceId, versionId, upload };
}

export async function confirmUserResourceUpload(
  deps: { db: Db; queue: Queue; logger: Logger },
  input: { userId: string; versionId: string },
): Promise<void> {
  const rows = await deps.db
    .select({
      id: schema.resourceVersions.id,
      resourceId: schema.resourceVersions.resourceId,
      status: schema.resourceVersions.ingestStatus,
      ownerUserId: schema.resources.userId,
    })
    .from(schema.resourceVersions)
    .innerJoin(
      schema.resources,
      eq(schema.resources.id, schema.resourceVersions.resourceId),
    )
    .where(eq(schema.resourceVersions.id, input.versionId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.versionId);
  if (row.ownerUserId !== input.userId) {
    throw new Forbidden('Version belongs to a different user');
  }
  if (row.status !== 'PENDING_UPLOAD') return;

  await deps.db
    .update(schema.resourceVersions)
    .set({ ingestStatus: 'PENDING' })
    .where(eq(schema.resourceVersions.id, input.versionId));

  await deps.queue.emit({
    name: 'resource.uploaded',
    data: {
      versionId: input.versionId,
      resourceId: row.resourceId,
      scope: { kind: 'user' as const, userId: input.userId },
    },
  });

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.userId,
      workspaceId: null,
      action: 'resource.uploaded',
      targetType: 'resource',
      targetId: row.resourceId,
      metadata: { versionId: input.versionId, scope: 'user' },
    },
  );
}

export interface UserResourceRow {
  id: string;
  name: string;
  versionId: string | null;
  versionNumber: number | null;
  mimeType: string | null;
  fileSize: number | null;
  ingestStatus: typeof schema.ingestStatus.enumValues[number] | null;
  createdAt: Date;
  lastReplacedAt: Date | null;
}

export async function listUserResources(
  deps: { db: Db },
  input: { userId: string; limit?: number; search?: string },
): Promise<UserResourceRow[]> {
  const limit = input.limit ?? 200;
  const filters = [eq(schema.resources.userId, input.userId)];
  if (input.search && input.search.trim()) {
    filters.push(
      sql`${schema.resources.name} ILIKE ${'%' + input.search.trim() + '%'}`,
    );
  }
  const rows = await deps.db
    .select({
      id: schema.resources.id,
      name: schema.resources.name,
      createdAt: schema.resources.createdAt,
      lastReplacedAt: schema.resources.lastReplacedAt,
      versionId: schema.resourceVersions.id,
      versionNumber: schema.resourceVersions.versionNumber,
      mimeType: schema.resourceVersions.mimeType,
      fileSize: schema.resourceVersions.fileSize,
      ingestStatus: schema.resourceVersions.ingestStatus,
    })
    .from(schema.resources)
    .leftJoin(
      schema.resourceVersions,
      eq(schema.resourceVersions.id, schema.resources.currentVersionId),
    )
    .where(and(...filters))
    .orderBy(desc(schema.resources.createdAt))
    .limit(limit);
  return rows;
}

export async function removeUserResource(
  deps: { db: Db; objectStore: ObjectStore; logger: Logger },
  input: { userId: string; resourceId: string },
): Promise<void> {
  const rows = await deps.db
    .select({ id: schema.resources.id, name: schema.resources.name })
    .from(schema.resources)
    .where(
      and(
        eq(schema.resources.id, input.resourceId),
        eq(schema.resources.userId, input.userId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.resourceId);

  const prefix = `user/${input.userId}/resources/${input.resourceId}/`;
  await deps.objectStore.deletePrefix(prefix).catch(() => 0);

  await deps.db
    .delete(schema.resources)
    .where(eq(schema.resources.id, input.resourceId));

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.userId,
      workspaceId: null,
      action: 'resource.deleted',
      targetType: 'resource',
      targetId: input.resourceId,
      metadata: { name: row.name, scope: 'user' },
    },
  );
}

function userResourceS3Key(p: {
  userId: string;
  resourceId: string;
  versionNumber: number;
  ext: string;
}): string {
  return `user/${p.userId}/resources/${p.resourceId}/v${p.versionNumber}/original${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
