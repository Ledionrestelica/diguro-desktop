/**
 * Transactional email provider port. Deliberately minimal — we only need
 * to send preformatted transactional mails (invitations today, password
 * reset later). Marketing / bulk delivery is out of scope.
 *
 * Implementations: Resend (v1). Could swap to Postmark, SES, or an SMTP
 * relay without touching callers.
 */
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export interface SendEmailInput {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text: string;
  /** Optional Reply-To — useful so recipients hit a human, not the from-alias. */
  replyTo?: string;
  /** Thread identifier the provider may use for grouping. */
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  /** Provider's own message id; useful for support correlation. */
  messageId: string | null;
}
