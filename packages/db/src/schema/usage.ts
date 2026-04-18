import { bigint, check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usageType } from './enums.ts';
import { workspaces } from './workspace.ts';
import { users } from './auth.ts';

/**
 * Append-only usage event log. workspaceId null = usage billed to user directly
 * (personal scope). userId is always set (we track who incurred the cost).
 */
export const tokenUsage = pgTable(
  'token_usage',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: usageType('type').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    costMicrodollars: integer('cost_microdollars').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('token_usage_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('token_usage_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export const spendingLimits = pgTable(
  'spending_limits',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .unique()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    monthlyCapMicrodollars: bigint('monthly_cap_microdollars', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'spending_limits_scope_exclusive',
      sql`(${t.workspaceId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`,
    ),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('audit_user_created_idx').on(t.userId, t.createdAt),
    index('audit_action_idx').on(t.action),
  ],
);
