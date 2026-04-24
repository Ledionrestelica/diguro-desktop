import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { systemRole } from './enums.ts';
import { organizations } from './organization.ts';
import { users } from './auth.ts';

/**
 * Organization-level invitations — what an org admin sends to bring a new
 * user into their tenant. Distinct from Better-Auth's `invitations` table
 * which models workspace (intra-org) membership invites.
 *
 * Lifecycle: `pending` → `accepted` | `revoked` | `expired`
 *   - `pending`    — created, awaiting click
 *   - `accepted`   — user signed up / linked their account, now a member
 *   - `revoked`    — admin cancelled it before acceptance
 *   - `expired`    — past `expiresAt` without acceptance (marked on read)
 *
 * `token` is cryptographically random (crypto.randomBytes(32) base64url).
 * It lives in the query string of the invite link; keep it out of logs.
 */
export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: systemRole('role').notNull(),
    token: text('token').notNull().unique(),
    status: text('status').notNull().default('pending'),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    acceptedByUserId: text('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // One pending invite per (org, email) — accepting or revoking frees
    // the slot. We enforce at the service layer rather than a partial
    // unique index to keep migrations simple.
    uniqueIndex('org_invitations_token_uniq').on(t.token),
    index('org_invitations_org_idx').on(t.organizationId),
    index('org_invitations_email_idx').on(t.email),
  ],
);
