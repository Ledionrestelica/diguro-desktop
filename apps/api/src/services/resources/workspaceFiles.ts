import { and, desc, eq, isNull, schema, sql, type Db } from '@diguro/db';
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
import { ALLOWED_RESOURCE_MIME, MAX_RESOURCE_BYTES } from './organizationFiles.ts';

/**
 * Workspace-scoped resources. Visible only to members of the workspace —
 * org-wide retrieval doesn't see them, and other workspaces in the same
 * org can't either. Mirrors organizationFiles.ts shape so the desktop UI
 * is identical apart from the scope label.
 *
 * S3 layout:
 *   workspace/<workspaceId>/resources/<resourceId>/v<n>/original<.ext>
 */

export interface PresignInput {
  workspaceId: string;
  uploaderId: string;
  filename: string;
  contentType: string;
  contentLength: number;
  folderId?: string | null;
}

export interface PresignResult {
  resourceId: string;
  versionId: string;
  upload: PresignedPut;
}

export async function initiateWorkspaceResourceUpload(
  deps: { db: Db; objectStore: ObjectStore },
  input: PresignInput,
): Promise<PresignResult> {
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
  const s3Key = resourceS3Key({
    workspaceId: input.workspaceId,
    resourceId,
    versionNumber: 1,
    ext,
  });

  if (input.folderId) {
    const folder = await deps.db
      .select({ id: schema.fileFolders.id })
      .from(schema.fileFolders)
      .where(
        and(
          eq(schema.fileFolders.id, input.folderId),
          eq(schema.fileFolders.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!folder[0]) {
      throw new Forbidden('Folder does not belong to this workspace');
    }
  }

  await deps.db.transaction(async (tx) => {
    await tx.insert(schema.resources).values({
      id: resourceId,
      workspaceId: input.workspaceId,
      name: input.filename,
      folderId: input.folderId ?? null,
    });
    await tx.insert(schema.resourceVersions).values({
      id: versionId,
      resourceId,
      versionNumber: 1,
      sha256: '',
      s3Key,
      mimeType: input.contentType,
      fileSize: input.contentLength,
      uploaderId: input.uploaderId,
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

export async function confirmWorkspaceResourceUpload(
  deps: { db: Db; queue: Queue; logger: Logger },
  input: { workspaceId: string; versionId: string; actorUserId: string },
): Promise<void> {
  const rows = await deps.db
    .select({
      id: schema.resourceVersions.id,
      resourceId: schema.resourceVersions.resourceId,
      status: schema.resourceVersions.ingestStatus,
      resourceWorkspaceId: schema.resources.workspaceId,
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
  if (row.resourceWorkspaceId !== input.workspaceId) {
    throw new Forbidden('Version belongs to a different workspace');
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
      scope: { kind: 'workspace' as const, workspaceId: input.workspaceId },
    },
  });

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
      action: 'resource.uploaded',
      targetType: 'resource',
      targetId: row.resourceId,
      metadata: { versionId: input.versionId, workspaceId: input.workspaceId },
    },
  );
}

export interface WorkspaceResourceRow {
  id: string;
  name: string;
  folderId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  mimeType: string | null;
  fileSize: number | null;
  ingestStatus: typeof schema.ingestStatus.enumValues[number] | null;
  createdAt: Date;
  lastReplacedAt: Date | null;
}

export async function listWorkspaceResources(
  deps: { db: Db },
  input: {
    workspaceId: string;
    limit?: number;
    search?: string;
    folderId?: string | null;
  },
): Promise<WorkspaceResourceRow[]> {
  const limit = input.limit ?? 200;
  const filters = [eq(schema.resources.workspaceId, input.workspaceId)];
  if (input.search && input.search.trim()) {
    filters.push(sql`${schema.resources.name} ILIKE ${'%' + input.search.trim() + '%'}`);
  } else if (input.folderId === null) {
    filters.push(isNull(schema.resources.folderId));
  } else if (typeof input.folderId === 'string') {
    filters.push(eq(schema.resources.folderId, input.folderId));
  }
  const rows = await deps.db
    .select({
      id: schema.resources.id,
      name: schema.resources.name,
      folderId: schema.resources.folderId,
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

export async function removeWorkspaceResource(
  deps: { db: Db; objectStore: ObjectStore; logger: Logger },
  input: { workspaceId: string; resourceId: string; actorUserId: string },
): Promise<void> {
  const rows = await deps.db
    .select({ id: schema.resources.id, name: schema.resources.name })
    .from(schema.resources)
    .where(
      and(
        eq(schema.resources.id, input.resourceId),
        eq(schema.resources.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.resourceId);

  const prefix = `workspace/${input.workspaceId}/resources/${input.resourceId}/`;
  await deps.objectStore.deletePrefix(prefix).catch(() => 0);

  await deps.db
    .delete(schema.resources)
    .where(eq(schema.resources.id, input.resourceId));

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
      action: 'resource.deleted',
      targetType: 'resource',
      targetId: input.resourceId,
      metadata: { name: row.name, workspaceId: input.workspaceId },
    },
  );
}

export interface WorkspaceReplaceInput {
  workspaceId: string;
  uploaderId: string;
  resourceId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface WorkspaceReplaceResult {
  resourceId: string;
  versionId: string;
  versionNumber: number;
  upload: PresignedPut;
}

export async function initiateWorkspaceResourceReplace(
  deps: { db: Db; objectStore: ObjectStore },
  input: WorkspaceReplaceInput,
): Promise<WorkspaceReplaceResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_RESOURCE_BYTES) {
    throw new FileTooLarge(
      `File must be between 1 byte and ${MAX_RESOURCE_BYTES} bytes`,
    );
  }
  if (!ALLOWED_RESOURCE_MIME.has(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const rows = await deps.db
    .select({
      id: schema.resources.id,
      workspaceId: schema.resources.workspaceId,
      currentVersionId: schema.resources.currentVersionId,
      currentVersionNumber: schema.resourceVersions.versionNumber,
    })
    .from(schema.resources)
    .leftJoin(
      schema.resourceVersions,
      eq(schema.resourceVersions.id, schema.resources.currentVersionId),
    )
    .where(eq(schema.resources.id, input.resourceId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.resourceId);
  if (row.workspaceId !== input.workspaceId) {
    throw new Forbidden('Resource belongs to a different workspace');
  }

  const versionNumber = (row.currentVersionNumber ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const s3Key = resourceS3Key({
    workspaceId: input.workspaceId,
    resourceId: input.resourceId,
    versionNumber,
    ext,
  });

  await deps.db.insert(schema.resourceVersions).values({
    id: versionId,
    resourceId: input.resourceId,
    versionNumber,
    sha256: '',
    s3Key,
    mimeType: input.contentType,
    fileSize: input.contentLength,
    uploaderId: input.uploaderId,
    ingestStatus: 'PENDING_UPLOAD',
  });

  const upload = await deps.objectStore.presignPut({
    key: s3Key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return { resourceId: input.resourceId, versionId, versionNumber, upload };
}

export async function confirmWorkspaceResourceReplace(
  deps: { db: Db; queue: Queue; logger: Logger },
  input: { workspaceId: string; versionId: string; actorUserId: string },
): Promise<void> {
  const rows = await deps.db
    .select({
      id: schema.resourceVersions.id,
      resourceId: schema.resourceVersions.resourceId,
      status: schema.resourceVersions.ingestStatus,
      resourceWorkspaceId: schema.resources.workspaceId,
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
  if (row.resourceWorkspaceId !== input.workspaceId) {
    throw new Forbidden('Version belongs to a different workspace');
  }
  if (row.status !== 'PENDING_UPLOAD') return;

  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.resourceVersions)
      .set({ ingestStatus: 'PENDING' })
      .where(eq(schema.resourceVersions.id, input.versionId));
    await tx
      .update(schema.resources)
      .set({ currentVersionId: input.versionId, lastReplacedAt: new Date() })
      .where(eq(schema.resources.id, row.resourceId));
  });

  await deps.queue.emit({
    name: 'resource.uploaded',
    data: {
      versionId: input.versionId,
      resourceId: row.resourceId,
      scope: { kind: 'workspace' as const, workspaceId: input.workspaceId },
    },
  });

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
      action: 'resource.replaced',
      targetType: 'resource',
      targetId: row.resourceId,
      metadata: { versionId: input.versionId, workspaceId: input.workspaceId },
    },
  );
}

export async function moveWorkspaceResource(
  deps: { db: Db },
  input: { workspaceId: string; resourceId: string; folderId: string | null },
): Promise<void> {
  if (input.folderId) {
    const folder = await deps.db
      .select({ id: schema.fileFolders.id })
      .from(schema.fileFolders)
      .where(
        and(
          eq(schema.fileFolders.id, input.folderId),
          eq(schema.fileFolders.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!folder[0]) {
      throw new Forbidden('Folder does not belong to this workspace');
    }
  }
  const res = await deps.db
    .update(schema.resources)
    .set({ folderId: input.folderId })
    .where(
      and(
        eq(schema.resources.id, input.resourceId),
        eq(schema.resources.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.resources.id });
  if (res.length === 0) throw new ResourceNotFound(input.resourceId);
}

function resourceS3Key(p: {
  workspaceId: string;
  resourceId: string;
  versionNumber: number;
  ext: string;
}): string {
  return `workspace/${p.workspaceId}/resources/${p.resourceId}/v${p.versionNumber}/original${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
