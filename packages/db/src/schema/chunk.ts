import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
import { entityType } from './enums.ts';
import { resourceVersions } from './resource.ts';

/**
 * Chunk FKs ResourceVersion (not Resource) — every chunk belongs to a specific
 * uploaded version so citations remain stable when a file is replaced.
 *
 * A GIN tsvector index on (to_tsvector('english', text)) is added via a
 * raw-SQL step in the first migration (drizzle-kit can't model it yet).
 */
export const chunks = pgTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    resourceVersionId: text('resource_version_id')
      .notNull()
      .references(() => resourceVersions.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    text: text('text').notNull(),
    contextualPrefix: text('contextual_prefix'),
    startOffset: integer('start_offset').notNull(),
    endOffset: integer('end_offset').notNull(),
    pageNumber: integer('page_number'),
    parentSectionId: text('parent_section_id'),
  },
  (t) => [index('chunks_rv_idx').on(t.resourceVersionId, t.chunkIndex)],
);

/**
 * 1:1 with Chunk. Split from Chunk so we can re-embed with a new model later
 * without touching chunk offsets. Voyage-3-large is locked at 1024 dimensions.
 * Index is HNSW with cosine distance ops.
 */
export const embeddings = pgTable(
  'embeddings',
  {
    chunkId: text('chunk_id')
      .primaryKey()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    vector: vector('vector', { dimensions: 1024 }).notNull(),
  },
  (t) => [
    index('embeddings_vector_hnsw')
      .using('hnsw', t.vector.op('vector_cosine_ops')),
  ],
);

export const entities = pgTable(
  'entities',
  {
    id: text('id').primaryKey(),
    resourceVersionId: text('resource_version_id')
      .notNull()
      .references(() => resourceVersions.id, { onDelete: 'cascade' }),
    type: entityType('type').notNull(),
    value: text('value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    mentions: jsonb('mentions').notNull(),
  },
  (t) => [
    index('entities_rv_type_idx').on(t.resourceVersionId, t.type),
    index('entities_normalized_idx').on(t.normalizedValue),
  ],
);
