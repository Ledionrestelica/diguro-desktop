import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { systemRole } from './enums.ts';
import { organizations } from './organization.ts';

/**
 * Better-Auth managed tables. Column shapes follow the
 * `better-auth/drizzle-adapter` conventions. Custom columns added below:
 *   - organizationId: the organization (tenant) this user belongs to.
 *     Nullable because superadmins may be organizationless (and fresh
 *     signups before invite).
 *   - role: narrowed to our systemRole enum.
 *   - preferredChatModelId / maxPersonalResources: user-scoped preferences.
 */

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: systemRole('role').notNull().default('user'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),

    preferredChatModelId: text('preferred_chat_model_id'),
    maxPersonalResources: integer('max_personal_resources').notNull().default(100),
  },
  (t) => [index('users_organization_idx').on(t.organizationId)],
);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  /** The workspace the user is currently acting inside. Flipped by
   *  `workspaces.setActive`. The DB column is named `active_organization_id`
   *  for Better-Auth organization-plugin compat (it expects that literal
   *  name); we expose it to our code under the new vocabulary. */
  activeWorkspaceId: text('active_organization_id'),
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
