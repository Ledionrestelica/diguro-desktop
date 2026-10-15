import { useEffect, useState } from 'react';
import { apiAuth } from '@/lib/api-auth';
import { TextField } from '@/components/ui/text-field';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 30;

type VerifyEmailStepProps = {
  email: string;
  onBack: () => void;
  onVerified: () => void;
};

export function VerifyEmailStep({ email, onBack, onVerified }: VerifyEmailStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify() {
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiAuth.verifyEmail(email, code);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code didn’t work. Try again.');
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setResent(false);
    setCooldown(RESEND_COOLDOWN_SEC);
    try {
      await apiAuth.sendVerificationCode(email);
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send a new code.');
    }
  }

  return (
    <OnboardingShell
      segment={0}
      title="Check your inbox"
      subtitle={
        <div className="flex flex-col gap-7">
          <p>
            A verification email has been sent to <span className="break-words">{email}</span>
          </p>
          <p>Confirm your email and start using Iserana.</p>
        </div>
      }
      onBack={onBack}
      onContinue={() => void verify()}
      loading={loading}
    >
      <div className="flex flex-col gap-2">
        <TextField
          label="Code"
          size="lg"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          placeholder={'0'.repeat(CODE_LENGTH)}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          controlClassName="h-[52px]"
          inputClassName="text-center text-label-18"
          error={error}
        />
        <p className="text-label-12 text-text-secondary">
          {resent ? 'We sent a new code. ' : 'Didn’t get it? '}
          {cooldown > 0 ? (
            <span className="text-text-placeholder">Resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={() => void resend()}
              className="cursor-pointer text-text-link hover:underline"
            >
              Resend code
            </button>
          )}
        </p>
      </div>
    </OnboardingShell>
  );
}
