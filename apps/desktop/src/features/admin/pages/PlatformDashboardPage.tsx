import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  Layers,
  Users,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../PlatformAdminLayout';

/**
 * Platform overview. Top: four KPI cards (orgs, users, workspaces,
 * suspended). Middle: recent organizations list. Right column: recent
 * users + system pulse (DB / queue / search-store). Pulse is heuristic
 * — green if the corresponding tRPC query resolved during this render.
 */
export function PlatformDashboardPage() {
  const orgsQuery = trpc.adminPlatform.organizationsList.useQuery();
  const usersQuery = trpc.adminPlatform.usersList.useQuery();

  const orgs = orgsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const totalOrgs = orgs.length;
  const totalUsers = users.length;
  const totalWorkspaces = orgs.reduce((sum, o) => sum + o.workspaceCount, 0);
  const suspendedOrgs = orgs.filter((o) => o.suspended).length;

  const recentOrgs = [...orgs].slice(0, 5);
  const recentUsers = [...users]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 5);

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Building2}
            label="Organizations"
            value={totalOrgs}
            hint={
              suspendedOrgs > 0
                ? `${suspendedOrgs} suspended`
                : 'All active'
            }
            tone={suspendedOrgs > 0 ? 'warn' : 'ok'}
            loading={orgsQuery.isLoading}
          />
          <KpiCard
            icon={Users}
            label="Users"
            value={totalUsers}
            hint={`${recentUsers.length > 0 ? formatRelative(new Date(recentUsers[0]!.createdAt)) : '—'} most recent`}
            loading={usersQuery.isLoading}
          />
          <KpiCard
            icon={Layers}
            label="Workspaces"
            value={totalWorkspaces}
            hint={
              totalOrgs > 0
                ? `${(totalWorkspaces / totalOrgs).toFixed(1)} avg per org`
                : 'No orgs yet'
            }
            loading={orgsQuery.isLoading}
          />
          <KpiCard
            icon={ShieldCheck}
            label="Superadmins"
            value={users.filter((u) => u.role === 'superadmin').length}
            hint="Across all orgs"
            loading={usersQuery.isLoading}
          />
        </div>

        {/* Two-column main */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent organizations — wide column */}
          <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white lg:col-span-2">
            <div className="flex items-center justify-between border-b border-zinc-100 p-6">
              <div>
                <p className="text-sm font-medium leading-5 text-black">
                  Recent organizations
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Newest tenants on the platform.
                </p>
              </div>
              <Link
                to="/admin/platform/organizations"
                className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black"
              >
                View all
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
            {orgsQuery.isLoading ? (
              <div className="flex flex-col gap-2 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            ) : recentOrgs.length === 0 ? (
              <EmptyState
                title="No organizations yet"
                hint="Create the first tenant from the Organizations tab."
                action={{
                  to: '/admin/platform/organizations',
                  label: 'Go to Organizations',
                }}
              />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recentOrgs.map((org) => (
                  <li key={org.id}>
                    <Link
                      to={`/admin/platform/organizations/${org.id}`}
                      className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-zinc-50/70"
                    >
                      <OrgGlyph
                        seed={org.id}
                        primaryColor={org.primaryColor}
                        logoUrl={org.logoUrl}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-zinc-900">
                            {org.name}
                          </p>
                          {org.suspended && <SuspendedPill />}
                        </div>
                        <p className="truncate text-xs text-zinc-500">
                          {org.slug} · {org.userCount} {pluralize(org.userCount, 'user')} ·{' '}
                          {org.workspaceCount} {pluralize(org.workspaceCount, 'workspace')}
                        </p>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {formatRelative(new Date(org.createdAt))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Right column: recent users + system pulse */}
          <div className="flex flex-col gap-6">
            <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-100 p-6">
                <div>
                  <p className="text-sm font-medium leading-5 text-black">
                    Recent users
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">Latest sign-ups.</p>
                </div>
                <Link
                  to="/admin/platform/users"
                  className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black"
                >
                  View all
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
              {usersQuery.isLoading ? (
                <div className="flex flex-col gap-2 p-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonRow key={i} compact />
                  ))}
                </div>
              ) : recentUsers.length === 0 ? (
                <EmptyState title="No users yet" hint="Wait for sign-ups." />
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {recentUsers.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 px-6 py-3.5"
                    >
                      <Avatar name={u.name ?? u.email} email={u.email} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {u.name ?? u.email.split('@')[0]}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{u.email}</p>
                      </div>
                      <RolePill role={u.role} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 p-6">
                <p className="text-sm font-medium leading-5 text-black">
                  System pulse
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Live status of platform components.
                </p>
              </div>
              <ul className="divide-y divide-zinc-100">
                <PulseRow
                  label="Database"
                  state={
                    orgsQuery.isLoading
                      ? 'pending'
                      : orgsQuery.error
                        ? 'down'
                        : 'ok'
                  }
                  detail={
                    orgsQuery.error?.message ?? `${totalOrgs + totalUsers} rows scanned`
                  }
                />
                <PulseRow
                  label="Auth"
                  state={
                    usersQuery.isLoading
                      ? 'pending'
                      : usersQuery.error
                        ? 'down'
                        : 'ok'
                  }
                  detail={
                    usersQuery.error?.message ?? `${totalUsers} accounts visible`
                  }
                />
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AdminPageBody>
  );
}

/* ─────────────── components ─────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'ok',
  loading,
}: {
  icon: typeof Zap;
  label: string;
  value: number;
  hint?: string;
  tone?: 'ok' | 'warn';
  loading?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        <span
          className={cn(
            'grid size-7 place-items-center rounded-[8px]',
            tone === 'warn'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-zinc-100 text-zinc-700',
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-12 animate-pulse rounded-md bg-zinc-100" />
      ) : (
        <p className="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.6px] text-black tabular-nums">
          {value.toLocaleString()}
        </p>
      )}
      {hint && (
        <p
          className={cn(
            'mt-1 text-xs',
            tone === 'warn' ? 'text-amber-700' : 'text-zinc-500',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function PulseRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: 'ok' | 'pending' | 'down';
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between px-6 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-2.5 place-items-center rounded-full',
            state === 'ok' && 'bg-emerald-500',
            state === 'pending' && 'animate-pulse bg-zinc-300',
            state === 'down' && 'bg-red-500',
          )}
        />
        <span className="text-sm font-medium text-zinc-900">{label}</span>
      </div>
      <span className="truncate text-xs text-zinc-500">{detail}</span>
    </li>
  );
}

function SkeletonRow({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex animate-pulse items-center gap-4',
        compact ? 'py-2' : 'py-3',
      )}
    >
      <div className={cn('rounded-full bg-zinc-100', compact ? 'size-7' : 'size-9')} />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-3 w-1/3 rounded bg-zinc-100" />
        <div className="h-2.5 w-2/3 rounded bg-zinc-100" />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {action && (
        <Link
          to={action.to}
          className="mt-2 inline-flex items-center gap-1 rounded-[8px] border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          {action.label}
          <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

function SuspendedPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
      Suspended
    </span>
  );
}

function RolePill({ role }: { role: string }) {
  const cfg = roleStyle(role);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        cfg.bg,
        cfg.fg,
      )}
    >
      {cfg.label}
    </span>
  );
}

function roleStyle(role: string) {
  switch (role) {
    case 'superadmin':
      return { bg: 'bg-black/90', fg: 'text-white', label: 'Super' };
    case 'organization_admin':
      return { bg: 'bg-violet-50', fg: 'text-violet-700', label: 'Org Admin' };
    default:
      return { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'User' };
  }
}

export function OrgGlyph({
  seed,
  primaryColor,
  logoUrl,
  size,
}: {
  seed: string;
  primaryColor: string | null;
  logoUrl: string | null;
  size: number;
}) {
  // Only render <img> for browser-renderable URLs. The server resolves
  // `organization://…` to presigned HTTPS on read; if a stale query
  // result still carries the raw scheme, fall back to initials instead
  // of letting the browser fail the request (and trip CSP).
  const isRenderable =
    typeof logoUrl === 'string' &&
    /^(https?:|data:|blob:)/.test(logoUrl);
  if (logoUrl && isRenderable) {
    return (
      <img
        src={logoUrl}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-[8px] object-cover"
      />
    );
  }
  // Stable hue from id; primaryColor wins if set.
  let hue = 0;
  for (let i = 0; i < seed.length; i++) hue = (hue * 31 + seed.charCodeAt(i)) % 360;
  const bg =
    primaryColor ?? `hsl(${hue} 60% 92%)`;
  const fg = primaryColor ? '#fff' : `hsl(${hue} 50% 32%)`;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[8px] text-xs font-semibold"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
      }}
    >
      {seed.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Avatar({ name, email }: { name: string; email: string }) {
  let hue = 0;
  for (let i = 0; i < email.length; i++) hue = (hue * 31 + email.charCodeAt(i)) % 360;
  const initial = (name || email).trim().charAt(0).toUpperCase();
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: `hsl(${hue} 55% 50%)` }}
    >
      {initial || '?'}
    </span>
  );
}

/* ─────────────── helpers ─────────────── */

function pluralize(n: number, word: string) {
  return n === 1 ? word : `${word}s`;
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.round(month / 12)}y ago`;
}
