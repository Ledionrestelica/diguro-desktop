import { Resend } from 'resend';
import type {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from '../../ports/emailProvider.ts';
import type { Logger } from '../../lib/logger.ts';

/**
 * Resend adapter. Thin wrapper around the Resend REST client — validates
 * the response and logs failures without exposing API-key-bearing errors
 * to callers. Failures are logged + rethrown: mail delivery should not
 * silently succeed, but the invitation row it relates to is already
 * persisted, so the admin can retry by copying the invite link.
 */
export interface ResendDeps {
  apiKey: string;
  defaultFrom: string;
  logger: Logger;
}

export function createResendEmailProvider(deps: ResendDeps): EmailProvider {
  const client = new Resend(deps.apiKey);

  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const from = input.from ?? deps.defaultFrom;
      const res = await client.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      });

      if (res.error) {
        deps.logger.warn('resend send failed', {
          to: input.to,
          subject: input.subject,
          errorName: res.error.name,
          errorMessage: res.error.message,
        });
        throw new Error(`Resend: ${res.error.message}`);
      }

      return { messageId: res.data?.id ?? null };
    },
  };
}
