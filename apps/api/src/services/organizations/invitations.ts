import { randomBytes } from 'node:crypto';
import { and, desc, eq, schema, sql, type Db } from '@diguro/db';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';
import type { EmailProvider } from '../../ports/emailProvider.ts';
import type { Logger } from '../../lib/logger.ts';
import { sendInvitationEmail } from '../email/invitations.ts';
import { recordAudit } from '../audit/record.ts';

/**
 * Organization-level invite lifecycle. Admins create an invite for an
 * email + role; the recipient clicks the signed link to accept, which
 * either attaches their existing account to the organization or prompts
 * them to sign up first.
 *
 * Token is 32 random bytes, base64url. Rotated on every create; revoked
 * invites are kept as a paper trail (status flipped, not deleted) so the
 * audit log can reference them.
 */

/** 14 days is enough for municipality IT procurement pace. */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type OrgInviteRole = 'user' | 'organization_admin';

export interface OrgInvitationRow {
  id: string;
  email: string;
  role: OrgInviteRole;
  status: string;
  token: string;
  /** Pre-computed accept URL (uses server's APP_BASE_URL). The client
   *  shouldn't try to build this from `window.location.origin` — that's
   *  `app://` / `file://` when the admin is on desktop, which can't be
   *  opened in a browser. */
  acceptUrl: string;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  inviterName: string | null;
  inviterEmail: string | null;
}

export interface CreateInviteInput {
  organizationId: string;
  inviterUserId: string;
  email: string;
  role: OrgInviteRole;
}

export interface CreateInviteResult {
  id: string;
  token: string;
  /** Full accept URL the recipient should open. Generated server-side
   *  from `APP_BASE_URL` (the web app) so the link works regardless of
   *  whether the admin who created it is using the desktop or the web
   *  client — `window.location.origin` on desktop is `app://`/`file://`
   *  which can't be opened in a browser. */
  acceptUrl: string;
  expiresAt: Date;
  /** True when the invitation email was successfully dispatched. False
   *  means the row is persisted but delivery failed — the admin can still
   *  copy the link from the Members page. */
  emailSent: boolean;
  /** Non-null when email send failed, for surfacing to the admin. */
  emailError: string | null;
}

export async function createOrgInvitation(
  deps: { db: Db; email: EmailProvider | null; logger: Logger; appBaseUrl: string },
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const email = input.email.trim().toLowerCase();

  // Refuse to invite an email that already belongs to any user of this
  // organization — they're already in.
  const existing = await deps.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, email),
        eq(schema.users.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new Forbidden('That user is already a member of this organization');
  }

  // Revoke any outstanding pending invites for this email on this org —
  // we only keep one live token per (org, email) at a time.
  await deps.db
    .update(schema.organizationInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(schema.organizationInvitations.organizationId, input.organizationId),
        eq(schema.organizationInvitations.email, email),
        eq(schema.organizationInvitations.status, 'pending'),
      ),
    );

  const id = crypto.randomUUID();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await deps.db.insert(schema.organizationInvitations).values({
    id,
    organizationId: input.organizationId,
    email,
    role: input.role,
    token,
    status: 'pending',
    inviterId: input.inviterUserId,
    expiresAt,
  });

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.inviterUserId,
      workspaceId: null,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: id,
      metadata: { email, role: input.role, organizationId: input.organizationId },
    },
  );

  // Look up org + inviter for the email body.
  let emailSent = false;
  let emailError: string | null = null;
  if (deps.email) {
    try {
      const [contextRows] = await Promise.all([
        deps.db
          .select({
            orgName: schema.organizations.name,
            inviterName: schema.users.name,
            inviterEmail: schema.users.email,
          })
          .from(schema.organizations)
          .leftJoin(
            schema.users,
            eq(schema.users.id, input.inviterUserId),
          )
          .where(eq(schema.organizations.id, input.organizationId))
          .limit(1),
      ]);
      const ctx = contextRows[0];
      if (!ctx) throw new Error('Organization not found after invite insert');
      await sendInvitationEmail(
        { email: deps.email },
        {
          to: email,
          organizationName: ctx.orgName,
          inviterName: ctx.inviterName,
          inviterEmail: ctx.inviterEmail,
          role: input.role,
          acceptUrl: buildAcceptUrl(deps.appBaseUrl, token),
        },
      );
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      deps.logger.warn('invitation email send failed — invite still usable via copy link', {
        invitationId: id,
        email,
        error: emailError,
      });
    }
  } else {
    emailError = 'Email provider not configured (RESEND_API_KEY missing) — copy the invite link manually.';
  }

  return { id, token, acceptUrl: buildAcceptUrl(deps.appBaseUrl, token), expiresAt, emailSent, emailError };
}

function buildAcceptUrl(appBaseUrl: string, token: string): string {
  // Browser-router path. The web app uses createBrowserRouter so a
  // `/#/accept-invite/...` URL ends up matching `/` (the hash is
  // discarded) which redirects to /workspaces — invitee gets stuck.
  // The desktop's HashRouter still handles `/accept-invite/<token>`
  // correctly because it interprets the URL fragment, but invite
  // links are always opened in a browser anyway, so we target web.
  const trimmed = appBaseUrl.replace(/\/+$/, '');
  return `${trimmed}/accept-invite/${token}`;
}

export async function listOrgInvitations(
  deps: { db: Db; appBaseUrl: string },
  input: { organizationId: string },
): Promise<OrgInvitationRow[]> {
  const rows = await deps.db
    .select({
      id: schema.organizationInvitations.id,
      email: schema.organizationInvitations.email,
      role: schema.organizationInvitations.role,
      status: schema.organizationInvitations.status,
      token: schema.organizationInvitations.token,
      expiresAt: schema.organizationInvitations.expiresAt,
      createdAt: schema.organizationInvitations.createdAt,
      acceptedAt: schema.organizationInvitations.acceptedAt,
      inviterName: schema.users.name,
      inviterEmail: schema.users.email,
    })
    .from(schema.organizationInvitations)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.organizationInvitations.inviterId),
    )
    .where(eq(schema.organizationInvitations.organizationId, input.organizationId))
    .orderBy(desc(schema.organizationInvitations.createdAt));

  // Auto-mark stale pending invites as expired on read. Cheaper than a
  // cron; the set is small and this path is admin-only.
  const now = Date.now();
  const staleIds = rows
    .filter((r) => r.status === 'pending' && r.expiresAt.getTime() < now)
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await deps.db
      .update(schema.organizationInvitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(schema.organizationInvitations.organizationId, input.organizationId),
          sql`${schema.organizationInvitations.id} = ANY(${staleIds})`,
        ),
      );
  }

  return rows.map((r) => ({
    ...r,
    role: r.role as OrgInviteRole,
    status: staleIds.includes(r.id) ? 'expired' : r.status,
    acceptUrl: buildAcceptUrl(deps.appBaseUrl, r.token),
  }));
}

export async function revokeOrgInvitation(
  deps: { db: Db; logger: Logger },
  input: { organizationId: string; invitationId: string; actorUserId: string },
): Promise<void> {
  const res = await deps.db
    .update(schema.organizationInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(schema.organizationInvitations.id, input.invitationId),
        eq(schema.organizationInvitations.organizationId, input.organizationId),
        eq(schema.organizationInvitations.status, 'pending'),
      ),
    )
    .returning({ id: schema.organizationInvitations.id });
  if (res.length === 0) throw new ResourceNotFound(input.invitationId);

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.actorUserId,
      workspaceId: null,
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: input.invitationId,
      metadata: { organizationId: input.organizationId },
    },
  );
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: OrgInviteRole;
  organizationId: string;
  organizationName: string;
  expiresAt: Date;
  status: string;
}

/**
 * Look up an invitation by its token for the accept landing page. Returns
 * organization name for display so the accept screen can show
 * "You're invited to join {OrgName}". Safe for unauthenticated callers.
 */
export async function getOrgInvitationByToken(
  deps: { db: Db },
  input: { token: string },
): Promise<InvitationSummary | null> {
  const rows = await deps.db
    .select({
      id: schema.organizationInvitations.id,
      email: schema.organizationInvitations.email,
      role: schema.organizationInvitations.role,
      status: schema.organizationInvitations.status,
      expiresAt: schema.organizationInvitations.expiresAt,
      organizationId: schema.organizationInvitations.organizationId,
      organizationName: schema.organizations.name,
    })
    .from(schema.organizationInvitations)
    .innerJoin(
      schema.organizations,
      eq(schema.organizations.id, schema.organizationInvitations.organizationId),
    )
    .where(eq(schema.organizationInvitations.token, input.token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role as OrgInviteRole,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    expiresAt: row.expiresAt,
    status: row.status,
  };
}

/**
 * Accept an invitation as a logged-in user. The user's email must match
 * the invite email (case-insensitive); we won't silently attach a
 * stranger. On success, the user's `organizationId` + `role` are set, the
 * invite is marked accepted, and subsequent `health.me` returns the new
 * organization.
 */
export async function acceptOrgInvitation(
  deps: { db: Db; logger: Logger },
  input: { token: string; actingUserId: string },
): Promise<{ organizationId: string }> {
  const invitationRows = await deps.db
    .select({
      id: schema.organizationInvitations.id,
      email: schema.organizationInvitations.email,
      role: schema.organizationInvitations.role,
      status: schema.organizationInvitations.status,
      organizationId: schema.organizationInvitations.organizationId,
      expiresAt: schema.organizationInvitations.expiresAt,
    })
    .from(schema.organizationInvitations)
    .where(eq(schema.organizationInvitations.token, input.token))
    .limit(1);
  const invitation = invitationRows[0];
  if (!invitation) throw new ResourceNotFound(input.token);
  if (invitation.status !== 'pending') {
    throw new Forbidden(`Invitation is ${invitation.status}`);
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await deps.db
      .update(schema.organizationInvitations)
      .set({ status: 'expired' })
      .where(eq(schema.organizationInvitations.id, invitation.id));
    throw new Forbidden('Invitation has expired');
  }

  const userRows = await deps.db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      organizationId: schema.users.organizationId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, input.actingUserId))
    .limit(1);
  const user = userRows[0];
  if (!user) throw new ResourceNotFound(input.actingUserId);

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Forbidden(
      `Invitation is for ${invitation.email}; you are signed in as ${user.email}`,
    );
  }
  if (user.organizationId && user.organizationId !== invitation.organizationId) {
    throw new Forbidden(
      'You already belong to a different organization. Leave it before joining a new one.',
    );
  }

  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({
        organizationId: invitation.organizationId,
        role: invitation.role as 'user' | 'organization_admin',
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, input.actingUserId));

    await tx
      .update(schema.organizationInvitations)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: input.actingUserId,
      })
      .where(eq(schema.organizationInvitations.id, invitation.id));
  });

  await recordAudit(
    { db: deps.db, logger: deps.logger },
    {
      userId: input.actingUserId,
      workspaceId: null,
      action: 'invitation.accepted',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: {
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    },
  );

  return { organizationId: invitation.organizationId };
}
