import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { messageRoleEnum, retrievalScope } from './enums.ts';
import { workspaces } from './workspace.ts';
import { users } from './auth.ts';
import { chunks } from './chunk.ts';

/**
 * Conversations are always owned by a user. workspaceId null => personal chat
 * over the user's personal files. No cross-scope retrieval in v1.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    folderId: text('folder_id'),
    title: text('title').notNull(),
    modelId: text('model_id'),
    /**
     * Which file corpus this chat's retrieval tool queries. Stamped on
     * conversation create from the composer toggle; cannot be changed
     * mid-conversation (the user can always start a new chat in the other
     * scope). Retrieval never crosses scopes.
     */
    retrievalScope: retrievalScope('retrieval_scope').notNull().default('organization'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('conversations_user_created_idx').on(t.userId, t.createdAt),
    index('conversations_workspace_created_idx').on(t.workspaceId, t.createdAt),
  ],
);

export const chatFolders = pgTable(
  'chat_folders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('chat_folders_user_idx').on(t.userId),
    index('chat_folders_workspace_idx').on(t.workspaceId),
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
