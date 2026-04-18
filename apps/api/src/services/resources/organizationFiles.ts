import { and, desc, eq, schema, sql, type Db } from '@diguro/db';
import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import type { Queue } from '../../ports/queue.ts';
import {
  FileTooLarge,
  Forbidden,
  ResourceNotFound,
  UnsupportedMimeType,
} from '@diguro/shared/errors';

/**
 * Organization-scoped resources (RAG-indexable files). Pre-ingestion v1 —
 * records + S3 bytes only; the ingestion pipeline picks up ResourceVersion
 * rows with status PENDING via an Inngest event (not wired here yet).
 *
 * S3 layout:
 *   organization/<organizationId>/resources/<resourceId>/v<n>/original<.ext>
 *
 * Org-scoped resources are visible to every workspace inside the
 * organization. No per-workspace ACL — scope is the tenant boundary.
 */

export const MAX_RESOURCE_BYTES = 100 * 1024 * 1024; // 100 MB

export const ALLOWED_RESOURCE_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/html',
]);

export interface PresignInput {
  organizationId: string;
  uploaderId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface PresignResult {
  resourceId: string;
  versionId: string;
  upload: PresignedPut;
}

/**
 * Reserve a Resource + ResourceVersion row and hand back a presigned PUT so
 * the desktop can upload the bytes directly to S3. Version starts in
 * PENDING_UPLOAD; confirmOrganizationResourceUpload flips it to PENDING.
 */
export async function initiateOrganizationResourceUpload(
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
    organizationId: input.organizationId,
    resourceId,
    versionNumber: 1,
    ext,
  });

  await deps.db.transaction(async (tx) => {
    await tx.insert(schema.resources).values({
      id: resourceId,
      organizationId: input.organizationId,
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

/**
 * Called after the client finishes the S3 PUT. Moves the version from
 * PENDING_UPLOAD → PENDING and emits `resource.uploaded` so the ingestion
 * pipeline picks it up. Guards against confirming a version that belongs to
 * a different organization.
 */
export async function confirmOrganizationResourceUpload(
  deps: { db: Db; queue: Queue },
  input: { organizationId: string; versionId: string },
): Promise<void> {
  const rows = await deps.db
    .select({
      id: schema.resourceVersions.id,
      resourceId: schema.resourceVersions.resourceId,
      status: schema.resourceVersions.ingestStatus,
      resourceOrgId: schema.resources.organizationId,
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
  if (row.resourceOrgId !== input.organizationId) {
    throw new Forbidden('Version belongs to a different organization');
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
      scope: { kind: 'organization' as const, organizationId: input.organizationId },
    },
  });
}

export interface OrganizationResourceRow {
  id: string;
  name: string;
  versionId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  ingestStatus: typeof schema.ingestStatus.enumValues[number] | null;
  createdAt: Date;
}

export async function listOrganizationResources(
  deps: { db: Db },
  input: { organizationId: string; limit?: number; search?: string },
): Promise<OrganizationResourceRow[]> {
  const limit = input.limit ?? 200;
  const filters = [eq(schema.resources.organizationId, input.organizationId)];
  if (input.search && input.search.trim()) {
    filters.push(sql`${schema.resources.name} ILIKE ${'%' + input.search.trim() + '%'}`);
  }
  const rows = await deps.db
    .select({
      id: schema.resources.id,
      name: schema.resources.name,
      createdAt: schema.resources.createdAt,
      versionId: schema.resourceVersions.id,
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

export async function removeOrganizationResource(
  deps: { db: Db; objectStore: ObjectStore },
  input: { organizationId: string; resourceId: string },
): Promise<void> {
  const rows = await deps.db
    .select({ id: schema.resources.id })
    .from(schema.resources)
    .where(
      and(
        eq(schema.resources.id, input.resourceId),
        eq(schema.resources.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new ResourceNotFound(input.resourceId);

  const prefix = `organization/${input.organizationId}/resources/${input.resourceId}/`;
  await deps.objectStore.deletePrefix(prefix).catch(() => 0);

  await deps.db
    .delete(schema.resources)
    .where(eq(schema.resources.id, input.resourceId));
}

function resourceS3Key(p: {
  organizationId: string;
  resourceId: string;
  versionNumber: number;
  ext: string;
}): string {
  return `organization/${p.organizationId}/resources/${p.resourceId}/v${p.versionNumber}/original${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
