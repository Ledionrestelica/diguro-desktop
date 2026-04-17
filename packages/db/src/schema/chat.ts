import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { messageRoleEnum } from './enums.ts';
import { organizations } from './org.ts';
import { users } from './auth.ts';
import { chunks } from './chunk.ts';

/**
 * Conversations are always owned by a user. organizationId null => personal chat
 * over the user's personal files. No cross-scope retrieval in v1.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    folderId: text('folder_id'),
    title: text('title').notNull(),
    modelId: text('model_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('conversations_user_created_idx').on(t.userId, t.createdAt),
    index('conversations_org_created_idx').on(t.organizationId, t.createdAt),
  ],
);

export const chatFolders = pgTable(
  'chat_folders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('chat_folders_user_idx').on(t.userId),
    index('chat_folders_org_idx').on(t.organizationId),
  ],
);

/**
 * parts is a Zod-validated discriminated union (see @diguro/shared/message).
 * Always parse on read and validate on write — never trust raw JSON from DB.
 */
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    parts: jsonb('parts').notNull(),
    modelId: text('model_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('messages_conv_created_idx').on(t.conversationId, t.createdAt)],
);

/**
 * Citations as first-class rows. FK to chunks with onDelete restrict —
 * a chunk referenced by a citation cannot be hard-deleted (archived versions stay).
 */
export const citations = pgTable(
  'citations',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'restrict' }),
    rank: integer('rank').notNull(),
    snippet: text('snippet').notNull(),
  },
  (t) => [index('citations_message_idx').on(t.messageId)],
);
