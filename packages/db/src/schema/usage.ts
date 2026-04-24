import { bigint, check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usageType } from './enums.ts';
import { workspaces } from './workspace.ts';
import { users } from './auth.ts';

/**
 * Append-only usage event log. workspaceId null = usage billed to user directly
 * (personal scope). userId is always set (we track who incurred the cost).
 *
 * Column guide:
 *   promptTokens          — all input tokens charged at the standard rate.
 *   cachedInputTokens     — input tokens served from a prompt cache (Anthropic
 *                           explicit cache, OpenAI Responses auto-cache).
 *                           Priced ~10% of standard input. Null when unknown.
 *   completionTokens      — output tokens charged at the standard rate.
 *   reasoningTokens       — output tokens spent on reasoning (o1/gpt-5).
 *                           Already included in completionTokens on some
 *                           providers; stored separately for visibility.
 *   units                 — semantic unit count for per-unit billing: pages
 *                           for OCR, documents for rerank, requests for
 *                           per-request tools. Null when pure-token billing.
 *   costMicrodollars      — computed at write time from the pricing module.
 *                           Captures cached/reasoning/per-unit pricing tiers.
 *   pricingVersion        — ISO date the pricing snapshot was valid on. Lets
 *                           us explain (or recompute) historical costs when
 *                           provider pricing drifts.
 *   providerRequestId     — the provider's own request ID (OpenAI `response.id`,
 *                           Anthropic `message.id`, Cohere `response_id`).
 *                           Needed to reconcile our ledger against provider
 *                           invoices. Also serves as an idempotency key if we
 *                           ever retry a write.
 *   latencyMs             — wall-clock time of the provider call. Optional,
 *                           useful for ops dashboards.
 *   conversationId        — when `type = CHAT`, the conversation this call
 *                           was part of. Lets the UI group spend by chat.
 *   resourceVersionId     — when the call was made during ingestion, the
 *                           version being processed. Lets the UI attribute
 *                           cost to a specific document.
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
    promptTokens: integer('prompt_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens'),
    completionTokens: integer('completion_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens'),
    units: integer('units'),
    costMicrodollars: integer('cost_microdollars').notNull().default(0),
    pricingVersion: text('pricing_version'),
    providerRequestId: text('provider_request_id'),
    latencyMs: integer('latency_ms'),
    conversationId: text('conversation_id'),
    resourceVersionId: text('resource_version_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('token_usage_workspace_created_idx').on(t.workspaceId, t.createdAt),
    index('token_usage_user_created_idx').on(t.userId, t.createdAt),
    index('token_usage_conversation_idx').on(t.conversationId),
    index('token_usage_resource_version_idx').on(t.resourceVersionId),
    index('token_usage_provider_req_idx').on(t.providerRequestId),
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
