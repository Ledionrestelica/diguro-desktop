import type { EmailProvider } from '../../ports/emailProvider.ts';

/**
 * Builds + sends the "You've been invited" email. The template is
 * intentionally bare — a short sentence, the org name, the invite link,
 * and a fallback URL. No marketing, no analytics pixels. Email clients
 * vary wildly; every line we don't write is one we don't have to
 * cross-test in Outlook.
 */

export interface SendInviteEmailInput {
  to: string;
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string | null;
  role: 'user' | 'organization_admin';
  acceptUrl: string;
}

export async function sendInvitationEmail(
  deps: { email: EmailProvider },
  input: SendInviteEmailInput,
): Promise<{ messageId: string | null }> {
  const { subject, html, text } = buildInviteEmail(input);
  const res = await deps.email.send({
    to: input.to,
    subject,
    html,
    text,
    ...(input.inviterEmail ? { replyTo: input.inviterEmail } : {}),
  });
  return { messageId: res.messageId };
}

function buildInviteEmail(input: SendInviteEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const roleLabel =
    input.role === 'organization_admin' ? 'Organization Admin' : 'User';
  const inviterLine = input.inviterName
    ? `${input.inviterName}${input.inviterEmail ? ` (${input.inviterEmail})` : ''}`
    : 'Your team';

  const subject = `${inviterLine} invited you to ${input.organizationName} on Diguro`;

  const text = [
    `${inviterLine} invited you to join "${input.organizationName}" on Diguro as a ${roleLabel}.`,
    '',
    'Accept the invitation:',
    input.acceptUrl,
    '',
    "If you weren't expecting this email, you can safely ignore it.",
    'The link expires in 14 days.',
  ].join('\n');

  const safeOrg = escapeHtml(input.organizationName);
  const safeInviter = escapeHtml(inviterLine);
  const safeUrl = escapeHtml(input.acceptUrl);

  // Single-column, system-font, ~600px wide. No remote images, no
  // external CSS — renders the same across Gmail, Outlook, Apple Mail.
  const html = `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <h1 style="font-size:20px;font-weight:600;color:#18181b;margin:0 0 12px;">
            You're invited to ${safeOrg}
          </h1>
          <p style="font-size:14px;line-height:22px;color:#3f3f46;margin:0 0 20px;">
            <strong>${safeInviter}</strong> has invited you to join
            <strong>${safeOrg}</strong> on Diguro as a <strong>${roleLabel}</strong>.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}"
               style="display:inline-block;background:#000000;color:#ffffff;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none;">
              Accept invitation
            </a>
          </p>
          <p style="font-size:12px;line-height:18px;color:#71717a;margin:0 0 8px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;line-height:18px;color:#71717a;margin:0 0 24px;word-break:break-all;">
            <a href="${safeUrl}" style="color:#52525b;">${safeUrl}</a>
          </p>
          <p style="font-size:12px;line-height:18px;color:#a1a1aa;margin:0;">
            This invitation expires in 14 days. If you weren't expecting it, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
