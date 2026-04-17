import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { reconciliationFinding } from './enums.ts';
import { organizations } from './org.ts';
import { users } from './auth.ts';

/**
 * Append-only report of drift found by the daily reconciliation job.
 * Findings are never auto-mutated — operator resolves via admin UI.
 */
export const reconciliationReports = pgTable(
  'reconciliation_reports',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    finding: reconciliationFinding('finding').notNull(),
    resourceId: text('resource_id'),
    resourceVersionId: text('resource_version_id'),
    s3Key: text('s3_key'),
    details: jsonb('details').notNull(),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('recon_org_created_idx').on(t.organizationId, t.createdAt),
    index('recon_user_created_idx').on(t.userId, t.createdAt),
    index('recon_unresolved_idx').on(t.createdAt, t.resolvedAt),
  ],
);
