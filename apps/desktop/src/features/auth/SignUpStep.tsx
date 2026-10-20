import { useState } from 'react';
import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@diguro/shared/password';
import { apiAuth } from '@/lib/api-auth';
import { TextField } from '@/components/ui/text-field';
import { PiUserUser03Stroke } from '@/components/icons/pika/PiUserUser03Stroke';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';

type SignUpStepProps = {
  onBack: () => void;
  onCreated: (email: string) => void;
};

export function SignUpStep({ onBack, onCreated }: SignUpStepProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmedEmail = email.trim().toLowerCase();
  const nameError = name.trim() ? null : 'Enter your full name.';
  const emailError = /^\S+@\S+\.\S+$/.test(trimmedEmail) ? null : 'Enter a valid email address.';
  const passwordError = isStrongPassword(password) ? null : PASSWORD_RULE_MESSAGE;

  async function submit() {
    setShowErrors(true);
    if (nameError || emailError || passwordError) return;
    setError(null);
    setLoading(true);
    try {
      await apiAuth.signUp(trimmedEmail, password, name.trim());
      onCreated(trimmedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <OnboardingShell
      segment={0}
      title="Let’s get you signed up"
      subtitle="This will take a minute or two."
      onBack={onBack}
      onContinue={() => void submit()}
      loading={loading}
      error={error}
    >
      <div className="flex flex-col gap-6">
        <TextField
          label="Full name"
          size="lg"
          icon={<PiUserUser03Stroke />}
          placeholder="Enter your full name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={showErrors ? nameError : null}
        />
        <TextField
          label="Email address"
          size="lg"
          type="email"
          icon={<PiEnvelopeDefaultStroke />}
          placeholder="Enter your email address"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={showErrors ? emailError : null}
        />
        <TextField
          label="Password"
          size="lg"
          type="password"
          placeholder="Enter a password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper={PASSWORD_RULE_MESSAGE}
          error={showErrors && passwordError ? passwordError : null}
        />
      </div>
    </OnboardingShell>
  );
}
