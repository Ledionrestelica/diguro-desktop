import { useState } from 'react';
import { Loader2, Monitor, Smartphone, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MIN_PASSWORD_LEN = 8;

/**
 * Security settings tab — change password + active-session management.
 * Sessions are backed by `me.sessionsList` / `me.revokeSession` /
 * `me.revokeOtherSessions`; the password change goes through Better-Auth's
 * `/change-password` endpoint via `apiAuth` (same path as sign-in/out).
 */
export function SecuritySettings() {
  return (
    <div className="flex flex-col gap-8">
      <ChangePasswordSection />
      <div className="h-px bg-zinc-100" />
      <SessionsSection />
    </div>
  );
}

function ChangePasswordSection() {
  const utils = trpc.useUtils();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LEN;
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LEN &&
    next === confirm &&
    !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      await apiAuth.changePassword(current, next, revokeOthers);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password updated');
      if (revokeOthers) void utils.me.sessionsList.invalidate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not change password.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-black">Change password</p>
        <p className="text-sm text-zinc-500">
          Use at least {MIN_PASSWORD_LEN} characters.
        </p>
      </div>

      <div className="flex max-w-[420px] flex-col gap-3">
        <Field label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-invalid={tooShort}
          />
          {tooShort && (
            <p className="text-xs text-red-600">
              Must be at least {MIN_PASSWORD_LEN} characters.
            </p>
          )}
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch}
          />
          {mismatch && (
            <p className="text-xs text-red-600">Passwords don’t match.</p>
          )}
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={revokeOthers}
            onChange={(e) => setRevokeOthers(e.target.checked)}
            className="size-4 rounded border-zinc-300"
          />
          Sign out other devices
        </label>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {pending ? 'Updating…' : 'Update password'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function SessionsSection() {
  const sessions = trpc.me.sessionsList.useQuery();
  const revoke = trpc.me.revokeSession.useMutation();
  const revokeOthers = trpc.me.revokeOtherSessions.useMutation();
  const utils = trpc.useUtils();

  const [pendingId, setPendingId] = useState<string | null>(null);

  function refresh() {
    void utils.me.sessionsList.invalidate();
  }

  if (sessions.isLoading) {
    return <p className="text-sm text-zinc-500">Loading sessions…</p>;
  }
  if (sessions.error || !sessions.data) {
    return (
      <p className="text-sm text-red-600">
        {sessions.error?.message ?? 'Could not load your sessions.'}
      </p>
    );
  }

  const list = sessions.data;
  const otherCount = list.filter((s) => !s.isCurrent).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-black">Active sessions</p>
          <p className="text-sm text-zinc-500">
            Devices and browsers currently signed in to your account.
          </p>
        </div>
        {otherCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={revokeOthers.isPending}
            onClick={() =>
              revokeOthers.mutate(undefined, { onSuccess: refresh })
            }
          >
            {revokeOthers.isPending ? 'Signing out…' : 'Sign out others'}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {list.map((s) => {
          const Icon = deviceIcon(s.userAgent);
          const busy = pendingId === s.id && revoke.isPending;
          return (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-[10px] border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {describeUserAgent(s.userAgent)}
                  </p>
                  {s.isCurrent && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      This device
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {s.ipAddress || 'Unknown IP'} · Signed in {formatDate(s.createdAt)}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPendingId(s.id);
                    revoke.mutate(
                      { sessionId: s.id },
                      { onSuccess: refresh, onSettled: () => setPendingId(null) },
                    );
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors',
                    busy ? 'opacity-60' : 'hover:bg-zinc-100 hover:text-red-600',
                  )}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {busy ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(revoke.isError || revokeOthers.isError) && (
        <p className="text-sm text-red-600">Couldn’t revoke — please try again.</p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm text-zinc-700">{label}</Label>
      {children}
    </div>
  );
}

function deviceIcon(ua: string | null): LucideIcon {
  if (!ua) return Globe;
  if (/electron|diguro/i.test(ua)) return Monitor;
  if (/mobile|iphone|android|ipad/i.test(ua)) return Smartphone;
  return Globe;
}

function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/electron|diguro/i.test(ua)) return 'Diguro desktop app';

  const browser =
    /edg\//i.test(ua) ? 'Edge'
    : /opr\//i.test(ua) ? 'Opera'
    : /chrome/i.test(ua) ? 'Chrome'
    : /firefox/i.test(ua) ? 'Firefox'
    : /safari/i.test(ua) ? 'Safari'
    : 'Browser';

  const os =
    /windows/i.test(ua) ? 'Windows'
    : /mac os|macintosh/i.test(ua) ? 'macOS'
    : /android/i.test(ua) ? 'Android'
    : /iphone|ipad|ios/i.test(ua) ? 'iOS'
    : /linux/i.test(ua) ? 'Linux'
    : null;

  return os ? `${browser} on ${os}` : browser;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
