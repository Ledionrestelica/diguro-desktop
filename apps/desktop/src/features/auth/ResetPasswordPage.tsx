import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isStrongPassword, PASSWORD_RULE_MESSAGE } from '@diguro/shared/password';
import { apiAuth } from '@/lib/api-auth';
import { TextField } from '@/components/ui/text-field';
import { ActionButton } from '@/components/ui/action-button';
import { AuthCenteredLayout, AuthLink } from './AuthCenteredLayout';

/**
 * Public reset-password page. Reached from the link in the password-reset
 * email: `${APP_BASE_URL}/reset-password?token=…`. Consumes the token via
 * Better-Auth's `/reset-password` endpoint, then sends the user to sign in.
 * Must live OUTSIDE the AuthGate wrapper — the user is logged out by
 * definition here.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordError = isStrongPassword(password) ? null : PASSWORD_RULE_MESSAGE;
  const confirmError = password === confirm ? null : 'Passwords don’t match.';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (!token || passwordError || confirmError) return;
    setError(null);
    setLoading(true);
    try {
      await apiAuth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reset your password. The link may have expired.',
      );
    } finally {
      setLoading(false);
    }
  }

  const backToSignIn = (
    <p>
      <AuthLink onClick={() => void navigate('/')}>Back to sign in</AuthLink>
    </p>
  );

  if (!token) {
    return (
      <AuthCenteredLayout title="Invalid reset link" footer={backToSignIn}>
        <p className="text-center text-copy-16 text-text-secondary">
          This link is invalid or incomplete. Request a new one from the sign-in screen.
        </p>
      </AuthCenteredLayout>
    );
  }

  if (done) {
    return (
      <AuthCenteredLayout title="Password updated">
        <p className="text-center text-copy-16 text-text-secondary">
          You can now sign in with your new password.
        </p>
        <ActionButton
          onClick={() => void navigate('/')}
          className="mt-2 h-12 w-full rounded-[12px]"
        >
          Go to sign in
        </ActionButton>
      </AuthCenteredLayout>
    );
  }

  return (
    <AuthCenteredLayout title="Choose a new password" footer={backToSignIn}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <TextField
          label="New password"
          size="lg"
          type="password"
          autoComplete="new-password"
          placeholder="Enter a new password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper={PASSWORD_RULE_MESSAGE}
          error={showErrors ? passwordError : null}
        />
        <TextField
          label="Confirm new password"
          size="lg"
          type="password"
          autoComplete="new-password"
          placeholder="Enter it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={showErrors ? (confirmError ?? error) : error}
        />
        <ActionButton type="submit" loading={loading} className="mt-2 h-12 w-full rounded-[12px]">
          Reset password
        </ActionButton>
      </form>
    </AuthCenteredLayout>
  );
}
