import { useState } from 'react';
import { apiAuth } from '@/lib/api-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon } from '@/components/ui/google-icon';

interface Props {
  onSignedIn: () => void;
}

export function SignIn({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) {
        await apiAuth.signUp(email, password, name);
      } else {
        await apiAuth.signIn(email, password);
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f9fafb] p-6">
      <div className="flex w-full max-w-[380px] flex-col items-stretch gap-8">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <h1 className="text-2xl font-bold leading-8 tracking-[-0.02em] text-zinc-800">
            {isSignUp ? 'Create your Diguro account' : 'Sign in to Diguro'}
          </h1>
          <p className="text-sm leading-4 text-neutral-500">
            {isSignUp
              ? 'Get started with your organization account'
              : 'Sign in to your organization account'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled
          className="h-12 gap-3.5 rounded-full border-zinc-100 bg-white text-base font-medium text-zinc-600 shadow-xs hover:bg-white disabled:opacity-100 disabled:cursor-not-allowed"
          title="Google sign-in is coming in v1.1"
        >
          <GoogleIcon className="size-4" />
          Sign in with Google
        </Button>

        <form onSubmit={submit} className="flex flex-col gap-[30px]">
          {isSignUp && (
            <AuthField
              id="name"
              type="text"
              autoComplete="name"
              label="Name"
              placeholder="Enter your name"
              value={name}
              onChange={setName}
              required
            />
          )}

          <AuthField
            id="email"
            type="email"
            autoComplete="email"
            label="Email address"
            placeholder="Enter your email address"
            value={email}
            onChange={setEmail}
            required
          />

          <AuthField
            id="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={setPassword}
            minLength={8}
            required
            trailingLabel={
              !isSignUp && (
                <button
                  type="button"
                  onClick={() =>
                    setError('Password reset is coming in v1.1.')
                  }
                  className="text-base font-normal text-zinc-400 underline underline-offset-2 hover:text-zinc-500"
                >
                  Forgot password?
                </button>
              )
            }
          />

          {error && (
            <p role="alert" className="-mt-4 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-12 rounded-full bg-[#111827] text-base font-medium text-white shadow-xs hover:bg-[#111827]/90"
          >
            {loading ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-base leading-6 text-zinc-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={toggleMode}
            className="font-medium text-zinc-900 hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}

interface AuthFieldProps {
  id: string;
  type: string;
  autoComplete: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  trailingLabel?: React.ReactNode;
}

function AuthField({
  id,
  type,
  autoComplete,
  label,
  placeholder,
  value,
  onChange,
  required,
  minLength,
  trailingLabel,
}: AuthFieldProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-base font-medium text-zinc-800">
          {label}
        </Label>
        {trailingLabel}
      </div>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...(minLength !== undefined ? { minLength } : {})}
        className="h-12 rounded-xl border-zinc-100 bg-white px-5 py-3 text-base shadow-xs placeholder:text-zinc-400 focus-visible:border-zinc-200 focus-visible:ring-zinc-200/50 focus-visible:ring-[3px] md:text-base"
      />
    </div>
  );
}
