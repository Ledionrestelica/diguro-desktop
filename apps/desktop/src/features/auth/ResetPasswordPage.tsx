import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiAuth } from '@/lib/api-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_PASSWORD_LEN = 8;

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LEN;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    !!token &&
    password.length >= MIN_PASSWORD_LEN &&
    password === confirm &&
    !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9fafb] p-6">
      <div className="flex w-full max-w-[380px] flex-col items-stretch gap-8">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.02em] text-zinc-800">
            {!token
              ? 'Invalid reset link'
              : done
                ? 'Password updated'
                : 'Choose a new password'}
          </h1>
          {token && !done && (
            <p className="text-sm leading-4 text-neutral-500">
              Enter a new password for your Diguro account.
            </p>
          )}
        </div>

        {!token ? (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-zinc-100 bg-white p-5 text-sm leading-6 text-zinc-600 shadow-xs">
              This reset link is invalid or incomplete. Request a new one from
              the sign-in screen.
            </div>
            <button
              type="button"
              onClick={() => void navigate('/')}
              className="text-center text-base font-medium text-zinc-900 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : done ? (
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-zinc-100 bg-white p-5 text-sm leading-6 text-zinc-600 shadow-xs">
              Your password has been reset. You can now sign in with your new
              password.
            </div>
            <Button
              type="button"
              onClick={() => void navigate('/')}
              className="h-12 rounded-full bg-[#111827] text-base font-medium text-white shadow-xs hover:bg-[#111827]/90"
            >
              Go to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-[30px]">
            <Field
              id="new-password"
              label="New password"
              value={password}
              onChange={setPassword}
              invalid={tooShort}
              hint={tooShort ? `Must be at least ${MIN_PASSWORD_LEN} characters.` : undefined}
            />
            <Field
              id="confirm-password"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              invalid={mismatch}
              hint={mismatch ? 'Passwords don’t match.' : undefined}
            />

            {error && (
              <p role="alert" className="-mt-4 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="h-12 rounded-full bg-[#111827] text-base font-medium text-white shadow-xs hover:bg-[#111827]/90"
            >
              {loading ? '…' : 'Reset password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  invalid,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label htmlFor={id} className="text-base font-medium text-zinc-800">
        {label}
      </Label>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        placeholder="Enter your new password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className="h-12 rounded-xl border-zinc-100 bg-white px-5 py-3 text-base shadow-xs placeholder:text-zinc-400 focus-visible:border-zinc-200 focus-visible:ring-zinc-200/50 focus-visible:ring-[3px] md:text-base"
      />
      {hint && <p className="text-xs text-destructive">{hint}</p>}
    </div>
  );
}
