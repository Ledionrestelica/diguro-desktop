import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, bearer, organization } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import type { Db } from '@diguro/db';
import * as schema from '@diguro/db/schema';
import type { Config } from '../config.ts';
import type { Logger } from '../lib/logger.ts';
import type { EmailProvider } from '../ports/emailProvider.ts';
import { sendPasswordResetEmail } from '../services/email/passwordReset.ts';

/** Reset-token lifetime. Better-Auth defaults to 1h; we keep it explicit so
 *  the email copy and the server agree. */
const RESET_TOKEN_EXPIRES_IN_SEC = 60 * 60;

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
export function createAuth(
  db: Db,
  config: Config,
  deps: { emailProvider: EmailProvider | null; logger: Logger },
) {
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
      resetPasswordTokenExpiresIn: RESET_TOKEN_EXPIRES_IN_SEC,
      // We build our own reset URL pointing at the web app's
      // `/reset-password` page (APP_BASE_URL) rather than using BA's `url`,
      // whose base is the API origin. The desktop client can't open
      // app://-scheme links from an email, so reset always happens on web.
      sendResetPassword: async ({ user, token }) => {
        if (!deps.emailProvider) {
          deps.logger.warn('password reset requested but email not configured', {
            email: user.email,
          });
          return;
        }
        const base = config.APP_BASE_URL.replace(/\/+$/, '');
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        try {
          await sendPasswordResetEmail(
            { email: deps.emailProvider },
            {
              to: user.email,
              resetUrl,
              expiresInHours: Math.round(RESET_TOKEN_EXPIRES_IN_SEC / 3600),
            },
          );
        } catch (err) {
          deps.logger.warn('failed to send password reset email', {
            email: user.email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
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

    // Cookie session attributes. Cross-origin browser calls (web app on
    // 5174 → API on 3000 in dev; app.diguro.se → api.diguro.se in prod)
    // only receive cookies when SameSite=None + Secure. Chrome treats
    // `localhost` as a secure context so Secure works in dev without
    // HTTPS; prod is genuine HTTPS either way. Desktop is bearer-auth
    // via the Electron keychain so these attributes never apply there.
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
      },
    },

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
