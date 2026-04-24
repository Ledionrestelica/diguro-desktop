import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthCard } from '../components/AuthCard';
import { apiAuth } from '@/lib/api-auth';
import { cn } from '@/lib/utils';

export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/home';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await apiAuth.signIn(email, password);
      void navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Sign in to Diguro"
      subtitle="Use the email + password you created with."
      footer={
        <span>
          Need an account?{' '}
          <Link
            to={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
            className="font-medium text-zinc-900 hover:underline"
          >
            Sign up
          </Link>
        </span>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        {error && (
          <p className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !email || !password}
          className={cn(
            'flex items-center justify-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors',
            pending ? 'cursor-not-allowed opacity-70' : 'hover:bg-zinc-800',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </button>
      </form>
    </AuthCard>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  readOnly,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
        className="rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 read-only:bg-zinc-50 read-only:text-zinc-700"
      />
    </label>
  );
}

export { Field };
