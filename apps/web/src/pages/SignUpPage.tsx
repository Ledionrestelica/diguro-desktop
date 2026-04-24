import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '../components/AuthCard';
import { apiAuth } from '@/lib/api-auth';
import { cn } from '@/lib/utils';
import { Field } from './SignInPage';

export function SignUpPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/home';
  // Accept-invite pages pre-fill the email so users can't mis-sign-up
  // under a different address than the invitation was issued to.
  const prefillEmail = params.get('email') ?? '';

  const [email, setEmail] = useState(prefillEmail);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiAuth.signUp(email, password, name);
      void navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle={prefillEmail ? `Sign up as ${prefillEmail}` : 'It takes about ten seconds.'}
      footer={
        <span>
          Already have an account?{' '}
          <Link
            to={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
            className="font-medium text-zinc-900 hover:underline"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
        <Field label="Name" type="text" value={name} onChange={setName} autoComplete="name" required />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
          readOnly={Boolean(prefillEmail)}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
        />
        {error && (
          <p className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !email || !password || !name}
          className={cn(
            'flex items-center justify-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors',
            pending ? 'cursor-not-allowed opacity-70' : 'hover:bg-zinc-800',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create account
        </button>
      </form>
    </AuthCard>
  );
}
