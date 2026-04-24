import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Accept-invite landing page. Public route — the user may or may not
 * already be signed in. Three states:
 *   1. Not signed in → "Sign in to accept". Send them through auth; they
 *      come back here with a session and see state 2.
 *   2. Signed in AND email matches → "Join <OrgName>" button.
 *   3. Signed in but email mismatch → error panel.
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

  // Auto-redirect to the app once the invite is accepted. Beat them to it
  // so they don't sit staring at a success toast.
  useEffect(() => {
    if (!accepted) return;
    const t = window.setTimeout(() => void navigate('/workspaces'), 800);
    return () => window.clearTimeout(t);
  }, [accepted, navigate]);

  if (!token) return <Shell title="Invalid invite" body="This link is missing a token." />;

  if (inviteQuery.isLoading || me.isLoading) {
    return <Shell title="Loading invitation…" body={<Loader2 className="size-5 animate-spin text-zinc-400" />} />;
  }

  const invitation = inviteQuery.data ?? null;

  if (!invitation) {
    return <Shell title="Invite not found" body="This link is invalid or has been revoked." danger />;
  }

  if (invitation.status !== 'pending') {
    const reasons: Record<string, string> = {
      accepted: 'This invitation has already been accepted.',
      revoked: 'This invitation was revoked by an admin.',
      expired: 'This invitation has expired. Ask your admin for a new one.',
    };
    return (
      <Shell
        title="Invitation unavailable"
        body={reasons[invitation.status] ?? `Status: ${invitation.status}`}
        danger
      />
    );
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    return (
      <Shell
        title="Invitation expired"
        body="This invitation has expired. Ask your admin for a new one."
        danger
      />
    );
  }

  const user = me.data;

  if (!user) {
    // Not signed in — route them to the sign-in page with a return URL.
    const returnTo = `/#/accept-invite/${token}`;
    return (
      <Shell
        title={`Join ${invitation.organizationName}`}
        body={
          <>
            <p className="text-sm text-zinc-600">
              You've been invited to join{' '}
              <span className="font-medium text-zinc-900">{invitation.organizationName}</span>{' '}
              as{' '}
              <span className="font-medium text-zinc-900">{invitation.email}</span>.
            </p>
            <p className="text-sm text-zinc-500">
              Sign in with that email to accept. If you don't have an account yet,
              create one with the same email.
            </p>
            <a
              href={returnTo}
              onClick={() => void navigate('/sign-in', { state: { returnTo } })}
              className="inline-block rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Sign in to continue
            </a>
          </>
        }
      />
    );
  }

  const emailMatches = user.email.toLowerCase() === invitation.email.toLowerCase();

  if (!emailMatches) {
    return (
      <Shell
        title="Email mismatch"
        body={
          <>
            <p className="text-sm text-zinc-600">
              This invitation is for{' '}
              <span className="font-medium text-zinc-900">{invitation.email}</span>, but
              you're signed in as{' '}
              <span className="font-medium text-zinc-900">{user.email}</span>.
            </p>
            <p className="text-sm text-zinc-500">
              Sign out and back in with the invited email to accept.
            </p>
          </>
        }
        danger
      />
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
      <Shell
        title="Welcome"
        body={
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check className="size-4" /> Joined {invitation.organizationName}. Redirecting…
          </div>
        }
      />
    );
  }

  return (
    <Shell
      title={`Join ${invitation.organizationName}`}
      body={
        <>
          <p className="text-sm text-zinc-600">
            You're signed in as{' '}
            <span className="font-medium text-zinc-900">{user.email}</span>. Accepting
            will add you to{' '}
            <span className="font-medium text-zinc-900">{invitation.organizationName}</span>{' '}
            as{' '}
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
              'flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white transition-colors',
              accept.isPending ? 'cursor-not-allowed opacity-70' : 'hover:bg-zinc-800',
            )}
          >
            {accept.isPending && <Loader2 className="size-4 animate-spin" />}
            Accept and join
          </button>
        </>
      }
    />
  );
}

function Shell({
  title,
  body,
  danger,
}: {
  title: string;
  body: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#fafafa] px-6">
      <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'grid size-10 place-items-center rounded-full',
              danger ? 'bg-red-50 text-red-600' : 'bg-zinc-100 text-zinc-600',
            )}
          >
            {danger ? <ShieldAlert className="size-5" /> : <Check className="size-5" />}
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-zinc-900">{title}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          {typeof body === 'string' ? (
            <p className="text-sm text-zinc-600">{body}</p>
          ) : (
            body
          )}
        </div>
      </div>
    </div>
  );
}
