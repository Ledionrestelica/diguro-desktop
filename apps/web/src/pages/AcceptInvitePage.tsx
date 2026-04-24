import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { AuthCard } from '../components/AuthCard';
import { cn } from '@/lib/utils';

/**
 * Web accept-invite landing page. Mirrors the desktop version but drives
 * the not-signed-in flow through the web's /sign-in + /sign-up routes
 * instead of the Electron AuthGate. The server contract is identical —
 * `invitations.getByToken` + `invitations.accept`.
 */
export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const inviteQuery = trpc.invitations.getByToken.useQuery(
    { token: token ?? '' },
    { enabled: !!token, retry: false },
  );
  const accept = trpc.invitations.accept.useMutation();
  const utils = trpc.useUtils();

  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!accepted) return;
    const t = window.setTimeout(() => void navigate('/home'), 800);
    return () => window.clearTimeout(t);
  }, [accepted, navigate]);

  if (!token) {
    return <ErrorCard title="Invalid invite" body="This link is missing a token." />;
  }

  if (inviteQuery.isLoading || me.isLoading) {
    return (
      <AuthCard title="Loading invitation…">
        <Loader2 className="size-5 animate-spin text-zinc-400" />
      </AuthCard>
    );
  }

  const invitation = inviteQuery.data ?? null;
  if (!invitation) {
    return (
      <ErrorCard
        title="Invite not found"
        body="This link is invalid or has been revoked."
      />
    );
  }

  if (invitation.status !== 'pending') {
    const reasons: Record<string, string> = {
      accepted: 'This invitation has already been accepted.',
      revoked: 'This invitation was revoked by an admin.',
      expired: 'This invitation has expired. Ask your admin for a new one.',
    };
    return (
      <ErrorCard
        title="Invitation unavailable"
        body={reasons[invitation.status] ?? `Status: ${invitation.status}`}
      />
    );
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    return (
      <ErrorCard
        title="Invitation expired"
        body="This invitation has expired. Ask your admin for a new one."
      />
    );
  }

  const user = me.data;
  const returnTo = `/accept-invite/${token}`;

  if (!user) {
    return (
      <AuthCard
        title={`Join ${invitation.organizationName}`}
        subtitle={`You've been invited as ${invitation.email}.`}
      >
        <p className="text-sm text-zinc-600">
          Sign in with that email to accept. New to Diguro? Create an account
          — we've pre-filled the right email.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              void navigate(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
            }
            className="flex-1 rounded-[10px] border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() =>
              void navigate(
                `/sign-up?email=${encodeURIComponent(invitation.email)}&returnTo=${encodeURIComponent(returnTo)}`,
              )
            }
            className="flex-1 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create account
          </button>
        </div>
      </AuthCard>
    );
  }

  const emailMatches =
    user.email.toLowerCase() === invitation.email.toLowerCase();

  if (!emailMatches) {
    async function switchAccount() {
      await apiAuth.signOut();
      await utils.health.me.invalidate();
    }
    return (
      <AuthCard
        title="Email mismatch"
        subtitle="We can't attach this invitation to a different account."
      >
        <p className="text-sm text-zinc-600">
          This invitation is for{' '}
          <span className="font-medium text-zinc-900">{invitation.email}</span>,
          but you're signed in as{' '}
          <span className="font-medium text-zinc-900">{user.email}</span>.
        </p>
        <button
          type="button"
          onClick={() => void switchAccount()}
          className="rounded-[10px] border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Sign out and try again
        </button>
      </AuthCard>
    );
  }

  async function onAccept() {
    setError(null);
    try {
      await accept.mutateAsync({ token: token! });
      setAccepted(true);
      await utils.health.me.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept invitation');
    }
  }

  if (accepted) {
    return (
      <AuthCard title="Welcome">
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <Check className="size-4" /> Joined {invitation.organizationName}.
          Redirecting…
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invitation.organizationName}`}
      subtitle={`Signed in as ${user.email}.`}
    >
      <p className="text-sm text-zinc-600">
        Accepting adds you to{' '}
        <span className="font-medium text-zinc-900">
          {invitation.organizationName}
        </span>{' '}
        as a{' '}
        <span className="font-medium text-zinc-900">
          {invitation.role === 'organization_admin' ? 'Organization Admin' : 'User'}
        </span>
        .
      </p>
      {error && (
        <p className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onAccept()}
        disabled={accept.isPending}
        className={cn(
          'flex items-center justify-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors',
          accept.isPending ? 'cursor-not-allowed opacity-70' : 'hover:bg-zinc-800',
        )}
      >
        {accept.isPending && <Loader2 className="size-4 animate-spin" />}
        Accept and join
      </button>
    </AuthCard>
  );
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
            <ShieldAlert className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-zinc-900">{title}</p>
            <p className="mt-1 text-sm text-zinc-600">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
