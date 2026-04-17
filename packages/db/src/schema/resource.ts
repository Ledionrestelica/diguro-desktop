import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ingestStatus, ocrStatus } from './enums.ts';
import { organizations } from './org.ts';
import { users } from './auth.ts';

/**
 * Resource = the logical file (stable id, user's label, pointer to current version).
 * Scope: exactly one of organizationId / userId is set (CHECK constraint).
 * currentVersionId is nullable only briefly between row creation and first confirmUpload.
 */
export const resources = pgTable(
  'resources',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    folderId: text('folder_id'),
    name: text('name').notNull(),
    currentVersionId: text('current_version_id').unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastReplacedAt: timestamp('last_replaced_at'),
  },
  (t) => [
    check(
      'resources_scope_exclusive',
      sql`(${t.organizationId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`,
    ),
    index('resources_org_created_idx').on(t.organizationId, t.createdAt),
    index('resources_user_created_idx').on(t.userId, t.createdAt),
    index('resources_folder_idx').on(t.folderId),
  ],
);

/**
 * ResourceVersion = one immutable uploaded binary. Per-version state (sha256, s3Key,
 * fileSize, ingest status, summary) lives here, NOT on Resource. Chunks and Entities
 * FK to ResourceVersion so citations remain stable across replaces.
 */
export const resourceVersions = pgTable(
  'resource_versions',
  {
    id: text('id').primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    sha256: text('sha256').notNull(),
    s3Key: text('s3_key').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    pageCount: integer('page_count'),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ocrStatus: ocrStatus('ocr_status').notNull().default('NONE'),
    ingestStatus: ingestStatus('ingest_status').notNull().default('PENDING_UPLOAD'),
    summary: text('summary'),
    keyPoints: text('key_points')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    s3Deleted: boolean('s3_deleted').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('resource_versions_resource_version_uniq').on(t.resourceId, t.versionNumber),
    index('resource_versions_resource_created_idx').on(t.resourceId, t.createdAt),
  ],
);

export const fileFolders = pgTable(
  'file_folders',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'file_folders_scope_exclusive',
      sql`(${t.organizationId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`,
    ),
    index('file_folders_org_idx').on(t.organizationId),
    index('file_folders_user_idx').on(t.userId),
  ],
);
