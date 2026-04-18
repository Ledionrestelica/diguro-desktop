import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer, organization } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import type { Db } from '@diguro/db';
import * as schema from '@diguro/db/schema';
import type { Config } from '../config.ts';

/**
 * Better-Auth instance. Dual auth from day 1:
 *   - Cookie sessions (for future web client).
 *   - Bearer tokens via the `bearer` plugin (for the Electron desktop).
 *
 * Naming note: Better-Auth's `organization` plugin uses the word
 * "organization" for its multi-tenant entity. In our product vocabulary
 * that concept is a **Workspace** (HR, Accounting, etc., nested inside an
 * Organization). We remap the plugin's schema to our `workspaces` table —
 * BA's internal naming never leaks to users.
 *
 * Plugins enabled:
 *   - organization: provides member/invitation schema for workspaces.
 *   - admin: RBAC for system roles (superadmin, organization_admin, user).
 *   - bearer: issues a bearer token alongside session cookies for the desktop.
 */
export function createAuth(db: Db, config: Config) {
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        // BA's "organization" = our "workspace"
        organization: schema.workspaces,
        member: schema.members,
        invitation: schema.invitations,
      },
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
    },

    // Custom columns on `users` that Better-Auth must include on the
    // session.user object. Without declaring these, `ctx.user.organizationId`
    // is always undefined even when the DB row has it set.
    user: {
      additionalFields: {
        organizationId: {
          type: 'string',
          required: false,
          input: false,
        },
        preferredChatModelId: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },

    trustedOrigins: config.ALLOWED_ORIGINS,

    plugins: [
      organization({
        // Workspaces are created from our own admin UI via tRPC; we don't
        // want regular members triggering Better-Auth's built-in flow.
        allowUserToCreateOrganization: false,
      }),
      admin({
        defaultRole: 'user',
        roles: {
          superadmin: adminAc,
          organization_admin: userAc,
          user: userAc,
        },
        // Only superadmins get Better-Auth's built-in admin privileges
        // (listUsers, ban, impersonate).
        adminRoles: ['superadmin'],
      }),
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
