import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PiLaptopStroke } from '@/components/icons/pika/PiLaptopStroke';
import { PiIphoneStroke } from '@/components/icons/pika/PiIphoneStroke';
import { PiGlobeStroke } from '@/components/icons/pika/PiGlobeStroke';
import type { ComponentType } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { TextField } from '@/components/ui/text-field';
import { SettingsRow, SettingsSection } from '@/features/admin/SettingsSection';

const MIN_PASSWORD_LEN = 8;

/**
 * Settings · Account · Security — change password + active-session management.
 * Sessions are backed by `me.sessionsList` / `me.revokeSession` /
 * `me.revokeOtherSessions`; the password change goes through Better-Auth's
 * `/change-password` endpoint via `apiAuth` (same path as sign-in/out).
 */
export function SecuritySettings() {
  return (
    <>
      <ChangePasswordSection />
      <SessionsSection />
    </>
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
    current.length > 0 && next.length >= MIN_PASSWORD_LEN && next === confirm && !pending;

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
      setError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection title="Password">
        <SettingsRow
          label="Change password"
          hint={`Use at least ${MIN_PASSWORD_LEN} characters.`}
          stacked
        >
          <div className="flex max-w-[360px] flex-col gap-3">
            <TextField
              label="Current password"
              size="sm"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <TextField
              label="New password"
              size="sm"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={tooShort ? `Must be at least ${MIN_PASSWORD_LEN} characters.` : null}
            />
            <TextField
              label="Confirm new password"
              size="sm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? 'Passwords don’t match.' : null}
            />
            <label className="flex cursor-pointer items-center gap-2 text-label-13 text-text-secondary">
              <input
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
                className="size-4 rounded border-border-input accent-[var(--color-primary)]"
              />
              Sign out my other devices
            </label>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={!canSubmit}
                className="press-scale cursor-pointer rounded-[10px] bg-primary px-3 py-[7px] text-label-13 font-medium text-text-on-solid outline-none transition-opacity hover:opacity-90 focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Updating…' : 'Update password'}
              </button>
              {error && <p className="text-label-13 text-danger-text">{error}</p>}
            </div>
          </div>
        </SettingsRow>
      </SettingsSection>
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
    return <p className="text-label-13 text-text-secondary">Loading sessions…</p>;
  }
  if (sessions.error || !sessions.data) {
    return (
      <p className="text-label-13 text-danger-text">
        {sessions.error?.message ?? 'Could not load your sessions.'}
      </p>
    );
  }

  const list = sessions.data;
  const otherCount = list.filter((s) => !s.isCurrent).length;

  return (
    <>
      <SettingsSection
        title="Active sessions"
        note={
          revoke.isError || revokeOthers.isError
            ? 'Couldn’t sign that device out. Please try again.'
            : 'Devices and browsers signed in to your account.'
        }
        className="mb-3"
      >
        {list.map((s) => {
          const Icon = deviceIcon(s.userAgent);
          const busy = pendingId === s.id && revoke.isPending;
          return (
            <div key={s.id} className="flex items-center gap-3 py-3 pr-4 pl-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-bg-subtle text-text-secondary">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-label-14 font-medium">
                  {describeUserAgent(s.userAgent)}
                </p>
                <p className="truncate text-label-13 text-text-secondary">
                  {s.ipAddress || 'Unknown IP'} · Signed in {formatDate(s.createdAt)}
                </p>
              </div>
              {s.isCurrent ? (
                <span className="rounded-[6px] bg-bg-subtle px-2 py-0.5 text-label-12 font-medium text-success-text">
                  This device
                </span>
              ) : (
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
                  className="press-scale flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-border-default bg-bg-panel px-3 py-[7px] text-label-13 font-medium text-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <Loader2 className="size-3.5 animate-spin" />}
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
              )}
            </div>
          );
        })}
      </SettingsSection>
      {otherCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate(undefined, { onSuccess: refresh })}
            className="press-scale cursor-pointer rounded-[10px] border border-border-default bg-bg-panel px-3 py-[7px] text-label-13 font-medium text-danger-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {revokeOthers.isPending ? 'Signing out…' : 'Sign out of all other sessions'}
          </button>
        </div>
      )}
    </>
  );
}

function deviceIcon(ua: string | null): ComponentType<{ size?: number; className?: string }> {
  if (!ua) return PiGlobeStroke;
  if (/electron|diguro/i.test(ua)) return PiLaptopStroke;
  if (/mobile|iphone|android|ipad/i.test(ua)) return PiIphoneStroke;
  return PiGlobeStroke;
}

function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  if (/electron|diguro/i.test(ua)) return 'Diguro desktop app';

  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\//i.test(ua)
      ? 'Opera'
      : /chrome/i.test(ua)
        ? 'Chrome'
        : /firefox/i.test(ua)
          ? 'Firefox'
          : /safari/i.test(ua)
            ? 'Safari'
            : 'Browser';

  const os = /windows/i.test(ua)
    ? 'Windows'
    : /mac os|macintosh/i.test(ua)
      ? 'macOS'
      : /android/i.test(ua)
        ? 'Android'
        : /iphone|ipad|ios/i.test(ua)
          ? 'iOS'
          : /linux/i.test(ua)
            ? 'Linux'
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
