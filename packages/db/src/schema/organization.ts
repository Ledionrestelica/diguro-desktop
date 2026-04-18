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
     * SMB. Sized for the real customer shape: 1-2K total docs, 10-15 staff,
     * low chat volume. Override per-customer via platform admin when they
     * upgrade.
     *   maxUsers: 15 (clerk + planning + PW + admin for a small town).
     *   maxWorkspaces: 3 (small orgs consolidate — Clerk, Planning, PW).
     *   maxResourcesPerWorkspace: 1_000 (x3 = 3K total with 50% headroom
     *     over the 1-2K real-world ceiling).
     *   maxMonthlySpendMicrodollars: $75 (75_000_000 microdollars) — covers
     *     steady-state ($24/mo) with 3x spike buffer. Phase 10 enforcement
     *     blocks new chat turns once this is hit.
     */
    maxUsers: integer('max_users').notNull().default(15),
    maxWorkspaces: integer('max_workspaces').notNull().default(3),
    maxResourcesPerWorkspace: integer('max_resources_per_workspace')
      .notNull()
      .default(1000),
    maxMonthlySpendMicrodollars: bigint('max_monthly_spend_microdollars', {
      mode: 'bigint',
    })
      .notNull()
      .default(sql`75000000`),

    suspended: text('suspended'), // null = active, else reason

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('organizations_slug_idx').on(t.slug)],
);
