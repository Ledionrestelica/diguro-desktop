import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { memberRole } from './enums.ts';
import { users } from './auth.ts';
import { organizations } from './organization.ts';

/**
 * A Workspace is a chat scope inside an Organization. An organization admin
 * can create many workspaces (e.g. HR, Accounting, Sales). Every workspace
 * belongs to exactly one Organization; deleting the Organization cascades.
 *
 * Slugs are unique PER ORGANIZATION (not globally) — two different
 * organizations can both have an "hr" workspace. Enforced by a composite
 * unique index.
 *
 * NOTE: Better-Auth's `organization` plugin is configured to point at this
 * table. In Better-Auth's internal vocabulary this is the "organization"
 * entity; in our product vocabulary it's a Workspace. Everywhere in our
 * code + UI we say "workspace".
 */
export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Short human description shown on the workspace picker + admin list. */
    description: text('description'),

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
  },
  (t) => [
    uniqueIndex('workspaces_organization_slug_uniq').on(t.organizationId, t.slug),
    index('workspaces_organization_idx').on(t.organizationId),
  ],
);

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('members_workspace_user_uniq').on(t.workspaceId, t.userId),
    index('members_user_idx').on(t.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull(),
    status: text('status').notNull().default('pending'),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('invitations_workspace_idx').on(t.workspaceId)],
);
