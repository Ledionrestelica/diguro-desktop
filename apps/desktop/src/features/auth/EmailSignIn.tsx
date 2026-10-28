import { useState, type FormEvent } from 'react';
import { apiAuth } from '@/lib/api-auth';
import { isEmailNotVerified } from '@/lib/auth-error';
import { TextField } from '@/components/ui/text-field';
import { DsButton } from '@/components/ui/ds-button';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { AuthCenteredLayout, AuthLink } from './AuthCenteredLayout';

type EmailSignInProps = {
  onBack: () => void;
  onSignedIn: () => void;
  onNeedsVerification: (email: string) => void;
  onForgot: () => void;
};

export function EmailSignIn({
  onBack,
  onSignedIn,
  onNeedsVerification,
  onForgot,
}: EmailSignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiAuth.signIn(normalized, password);
      onSignedIn();
    } catch (err) {
      if (isEmailNotVerified(err)) {
        onNeedsVerification(normalized);
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <AuthCenteredLayout
      title="Sign in with email"
      footer={
        <>
          <p>
            <AuthLink onClick={onBack}>All sign-in options</AuthLink>
          </p>
          <p>
            Trouble signing in? <AuthLink onClick={onForgot}>Reset password.</AuthLink>
          </p>
        </>
      }
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
        />
        <TextField
          label="Password"
          size="lg"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <DsButton
          type="submit"
          loading={loading}
          variant="primary"
          size="lg"
          className="mt-2 w-full"
        >
          Sign in
        </DsButton>
      </form>
    </AuthCenteredLayout>
  );
}
