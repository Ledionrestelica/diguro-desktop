import type { EmailProvider } from '../../ports/emailProvider.ts';

/**
 * Builds + sends the "Reset your password" email. Same bare, single-column
 * template as the invitation mail — no remote images or external CSS so it
 * renders consistently across Gmail / Outlook / Apple Mail.
 *
 * The link points at the web app's `/reset-password?token=…` page (built
 * from `APP_BASE_URL`), never `window.location.origin`: a desktop user's
 * origin is `app://`/`file://`, which can't be opened from an email client.
 */

export interface SendPasswordResetEmailInput {
  to: string;
  resetUrl: string;
  /** Reset-token lifetime in hours, for the body copy. */
  expiresInHours: number;
}

export async function sendPasswordResetEmail(
  deps: { email: EmailProvider },
  input: SendPasswordResetEmailInput,
): Promise<{ messageId: string | null }> {
  const { subject, html, text } = buildResetEmail(input);
  const res = await deps.email.send({ to: input.to, subject, html, text });
  return { messageId: res.messageId };
}

function buildResetEmail(input: SendPasswordResetEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Reset your Diguro password';

  const text = [
    'We received a request to reset your Diguro password.',
    '',
    'Reset it here:',
    input.resetUrl,
    '',
    `This link expires in ${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}.`,
    "If you didn't request this, you can safely ignore this email — your password won't change.",
  ].join('\n');

  const safeUrl = escapeHtml(input.resetUrl);

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <h1 style="font-size:20px;font-weight:600;color:#18181b;margin:0 0 12px;">
            Reset your password
          </h1>
          <p style="font-size:14px;line-height:22px;color:#3f3f46;margin:0 0 20px;">
            We received a request to reset the password for your Diguro account.
            Click the button below to choose a new one.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}"
               style="display:inline-block;background:#000000;color:#ffffff;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none;">
              Reset password
            </a>
          </p>
          <p style="font-size:12px;line-height:18px;color:#71717a;margin:0 0 8px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="font-size:12px;line-height:18px;color:#71717a;margin:0 0 24px;word-break:break-all;">
            <a href="${safeUrl}" style="color:#52525b;">${safeUrl}</a>
          </p>
          <p style="font-size:12px;line-height:18px;color:#a1a1aa;margin:0;">
            This link expires in ${input.expiresInHours} hour${input.expiresInHours === 1 ? '' : 's'}.
            If you didn't request this, you can safely ignore this email — your password won't change.
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
