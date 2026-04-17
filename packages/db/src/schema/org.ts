import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { memberRole } from './enums.ts';
import { users } from './auth.ts';

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),

  backgroundColor: text('background_color'),
  buttonColor: text('button_color'),
  logoUrl: text('logo_url'),

  systemPrompt: text('system_prompt'),
  tone: text('tone'),

  defaultChatModelId: text('default_chat_model_id'),
  defaultRewriteModelId: text('default_rewrite_model_id'),
  allowedModelIds: text('allowed_model_ids')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),

  maxMembers: integer('max_members').notNull().default(10),
  maxResources: integer('max_resources').notNull().default(500),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_org_user_uniq').on(t.organizationId, t.userId),
    index('members_user_idx').on(t.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull(),
    status: text('status').notNull().default('pending'),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('invitations_org_idx').on(t.organizationId)],
);
