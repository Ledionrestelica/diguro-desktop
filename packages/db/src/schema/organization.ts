import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * An Organization is the top-level tenant we sell to. Each customer gets one
 * Organization; inside it they create any number of Workspaces (chat scopes).
 *
 * Superadmins (the platform operators) create Organizations. Organization
 * admins manage users + workspaces within their organization only.
 * Per-organization caps are enforced at the application layer; the row
 * stores the limits.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),

    logoUrl: text('logo_url'),
    primaryColor: text('primary_color'),

    /**
     * Defaults aimed at the "Town" tier — small municipality / records-heavy
     * SMB. Override per-customer via platform admin when they upgrade.
     *   maxUsers: 25 staff (clerk + planning + public works + admin).
     *   maxWorkspaces: 5 (one per department — Clerk, Planning, PW, Legal, HR).
     *   maxResourcesPerWorkspace: 2_000 (x5 workspaces = 10k docs total,
     *     enough for ~5 years of typical small-town volume).
     *   maxMonthlySpendMicrodollars: $300 (300_000_000 microdollars) — covers
     *     steady-state AI usage for the Town tier. Phase 10 enforcement
     *     blocks new chat turns once this is hit.
     */
    maxUsers: integer('max_users').notNull().default(25),
    maxWorkspaces: integer('max_workspaces').notNull().default(5),
    maxResourcesPerWorkspace: integer('max_resources_per_workspace')
      .notNull()
      .default(2000),
    maxMonthlySpendMicrodollars: bigint('max_monthly_spend_microdollars', {
      mode: 'bigint',
    })
      .notNull()
      .default(sql`300000000`),

    suspended: text('suspended'), // null = active, else reason

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('organizations_slug_idx').on(t.slug)],
);
