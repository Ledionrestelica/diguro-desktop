import { useState, type FormEvent } from 'react';
import { apiAuth } from '@/lib/api-auth';
import { TextField } from '@/components/ui/text-field';
import { DsButton } from '@/components/ui/ds-button';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { AuthCenteredLayout, AuthLink } from './AuthCenteredLayout';

export function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Enter your email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiAuth.requestPasswordReset(normalized);
      setSentTo(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <p>
      <AuthLink onClick={onBack}>Back to sign in</AuthLink>
    </p>
  );

  if (sentTo) {
    return (
      <AuthCenteredLayout title="Check your inbox" footer={footer}>
        <p className="text-center text-copy-16 text-text-secondary">
          If an account exists for <span className="text-text">{sentTo}</span>, we’ve sent a link to
          reset your password. It expires in 1 hour.
        </p>
      </AuthCenteredLayout>
    );
  }

  return (
    <AuthCenteredLayout
      title="Reset your password"
      subtitle="We’ll email you a link to choose a new one."
      footer={footer}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email address"
          size="lg"
          type="email"
          icon={<PiEnvelopeDefaultStroke />}
          placeholder="Enter your email address"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <DsButton
          type="submit"
          loading={loading}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          Send reset link
        </DsButton>
      </form>
    </AuthCenteredLayout>
  );
}
