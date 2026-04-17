import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer, organization } from 'better-auth/plugins';
import type { Db } from '@diguro/db';
import * as schema from '@diguro/db/schema';
import type { Config } from '../config.ts';

/**
 * Better-Auth instance. Dual auth from day 1:
 *   - Cookie sessions (for future web client).
 *   - Bearer tokens via the `bearer` plugin (for the Electron desktop).
 *
 * Plugins enabled:
 *   - organization: multi-tenant orgs, members, invitations.
 *   - admin: RBAC for system roles (admin, superadmin).
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
        organization: schema.organizations,
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

    trustedOrigins: config.ALLOWED_ORIGINS,

    plugins: [
      organization({
        allowUserToCreateOrganization: true,
      }),
      admin({
        defaultRole: 'user',
      }),
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
