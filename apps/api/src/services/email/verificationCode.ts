import type { EmailProvider } from '../../ports/emailProvider.ts';

/**
 * Builds + sends the 6-digit email verification code used during sign-up
 * (and on sign-in for accounts that never confirmed). Same bare template as
 * the password-reset mail so it renders consistently across clients.
 */

export interface SendVerificationCodeEmailInput {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export async function sendVerificationCodeEmail(
  deps: { email: EmailProvider },
  input: SendVerificationCodeEmailInput,
): Promise<{ messageId: string | null }> {
  const { subject, html, text } = buildVerificationEmail(input);
  const res = await deps.email.send({ to: input.to, subject, html, text });
  return { messageId: res.messageId };
}

function buildVerificationEmail(input: SendVerificationCodeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${input.code} is your Iserana verification code`;

  const text = [
    'Confirm your email to start using Iserana.',
    '',
    `Your code: ${input.code}`,
    '',
    `It expires in ${input.expiresInMinutes} minutes.`,
    "If you didn't create an Iserana account, you can ignore this email.",
  ].join('\n');

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafafa;margin:0;padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <h1 style="font-size:20px;font-weight:600;color:#18181b;margin:0 0 12px;">
            Confirm your email
          </h1>
          <p style="font-size:14px;line-height:22px;color:#3f3f46;margin:0 0 20px;">
            Enter this code in Iserana to finish creating your account.
          </p>
          <p style="font-size:32px;line-height:40px;font-weight:600;letter-spacing:8px;color:#18181b;margin:0 0 24px;">
            ${input.code}
          </p>
          <p style="font-size:12px;line-height:18px;color:#a1a1aa;margin:0;">
            This code expires in ${input.expiresInMinutes} minutes.
            If you didn't create an Iserana account, you can ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
