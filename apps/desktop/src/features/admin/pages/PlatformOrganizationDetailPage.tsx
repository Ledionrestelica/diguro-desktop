import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldOff, Trash2, Users as UsersIcon, Layers } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useAdminSave } from '../admin-save-context';
import { AdminPageBody } from '../PlatformAdminLayout';
import { OrgGlyph } from './PlatformDashboardPage';

/**
 * Per-organization settings, accessed by superadmins to manage any tenant
 * on the platform. Three sections: identity (name/slug/branding), caps
 * (limits), and a clearly-marked danger zone (suspend, delete). The save
 * bar in the top header registers via AdminSaveContext.
 */
export function PlatformOrganizationDetailPage() {
  const params = useParams<{ id: string }>();
  // Stable empty fallback so every hook below runs in the same order
  // on every render, even on the (rare) missing-id path. The actual
  // redirect happens in JSX after all hooks have been called.
  const id = params.id ?? '';

  const utils = trpc.useUtils();
  const orgQuery = trpc.adminPlatform.organizationGet.useQuery(
    { id },
    {
      enabled: id !== '',
      // userCount + workspaceCount are computed server-side and become
      // stale whenever a user is created/reassigned/role-changed from
      // the Users page. Refetch on focus so the detail page reflects
      // those changes when the operator switches back to this tab.
      refetchOnWindowFocus: true,
      staleTime: 5_000,
    },
  );
  const update = trpc.adminPlatform.organizationUpdate.useMutation();

  // form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [maxUsers, setMaxUsers] = useState(50);
  const [maxWorkspaces, setMaxWorkspaces] = useState(20);
  const [maxResourcesPerWorkspace, setMaxResourcesPerWorkspace] = useState(500);

  useEffect(() => {
    if (!orgQuery.data) return;
    setName(orgQuery.data.name);
    setSlug(orgQuery.data.slug);
    setPrimaryColor(orgQuery.data.primaryColor);
    setMaxUsers(orgQuery.data.maxUsers);
    setMaxWorkspaces(orgQuery.data.maxWorkspaces);
    setMaxResourcesPerWorkspace(orgQuery.data.maxResourcesPerWorkspace);
  }, [orgQuery.data]);

  const dirty = useMemo(() => {
    if (!orgQuery.data) return false;
    return (
      name !== orgQuery.data.name ||
      slug !== orgQuery.data.slug ||
      primaryColor !== orgQuery.data.primaryColor ||
      maxUsers !== orgQuery.data.maxUsers ||
      maxWorkspaces !== orgQuery.data.maxWorkspaces ||
      maxResourcesPerWorkspace !== orgQuery.data.maxResourcesPerWorkspace
    );
  }, [orgQuery.data, name, slug, primaryColor, maxUsers, maxWorkspaces, maxResourcesPerWorkspace]);

  const saveAction = useMemo(
    () => ({
      label: 'Save changes',
      disabled: !dirty,
      pending: update.isPending,
      onSave: () => {
        if (!orgQuery.data) return;
        update.mutate(
          {
            id,
            ...(name !== orgQuery.data.name ? { name } : {}),
            ...(slug !== orgQuery.data.slug ? { slug } : {}),
            ...(primaryColor !== orgQuery.data.primaryColor
              ? { primaryColor }
              : {}),
            ...(maxUsers !== orgQuery.data.maxUsers ? { maxUsers } : {}),
            ...(maxWorkspaces !== orgQuery.data.maxWorkspaces
              ? { maxWorkspaces }
              : {}),
            ...(maxResourcesPerWorkspace !== orgQuery.data.maxResourcesPerWorkspace
              ? { maxResourcesPerWorkspace }
              : {}),
          },
          {
            onSuccess: () => {
              void utils.adminPlatform.organizationGet.invalidate({ id });
              void utils.adminPlatform.organizationsList.invalidate();
            },
          },
        );
      },
    }),
    [
      orgQuery.data,
      id,
      name,
      slug,
      primaryColor,
      maxUsers,
      maxWorkspaces,
      maxResourcesPerWorkspace,
      dirty,
      update,
      utils,
    ],
  );
  useAdminSave(saveAction);

  // Post-hooks early returns (safe — every hook above ran).
  if (!params.id) return <Navigate to="/admin/platform/organizations" replace />;

  if (orgQuery.isLoading) {
    return (
      <AdminPageBody>
        <div className="rounded-[12px] border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
          Loading…
        </div>
      </AdminPageBody>
    );
  }
  if (orgQuery.error || !orgQuery.data) {
    return (
      <AdminPageBody>
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">
          {orgQuery.error?.message ?? 'Organization not found.'}
        </div>
      </AdminPageBody>
    );
  }

  const org = orgQuery.data;

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
        {/* Back link + header card */}
        <div>
          <Link
            to="/admin/platform/organizations"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-black"
          >
            <ArrowLeft className="size-3.5" />
            All organizations
          </Link>
        </div>

        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center gap-5 p-6">
            <OrgGlyph
              seed={org.id}
              primaryColor={org.primaryColor}
              logoUrl={org.logoUrl}
              size={56}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-semibold leading-7 tracking-[-0.4px] text-black">
                  {org.name}
                </h2>
                {org.suspended ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Suspended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm text-zinc-500">/{org.slug}</p>
            </div>
            <div className="flex gap-2">
              <StatBlock icon={UsersIcon} label="Users" value={`${org.userCount} / ${org.maxUsers}`} />
              <StatBlock icon={Layers} label="Workspaces" value={`${org.workspaceCount} / ${org.maxWorkspaces}`} />
            </div>
          </div>

          {org.suspended && (
            <div className="border-t border-amber-100 bg-amber-50 px-6 py-3">
              <p className="text-xs font-medium text-amber-800">
                <strong>Suspension reason:</strong> {org.suspended}
              </p>
            </div>
          )}
        </section>

        {/* Identity */}
        <SettingsSection
          title="Identity"
          description="Name, slug, and brand color shown across the org's UI."
        >
          <div className="grid gap-5 p-6 md:grid-cols-2">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Slug" hint="URL-safe handle. Lowercase letters, digits, dashes.">
              <div className="flex items-stretch overflow-hidden rounded-[10px] border border-zinc-200 bg-white focus-within:border-zinc-400">
                <span className="grid place-items-center bg-zinc-50 px-3 text-xs text-zinc-500">/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  className="w-full px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </Field>
            <Field
              label="Brand color"
              hint="Used for the org glyph + accents. Click to clear."
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrimaryColor(null)}
                  className={cn(
                    'size-7 rounded-full border-2 bg-white text-[10px] font-semibold text-zinc-500',
                    primaryColor === null
                      ? 'border-zinc-900'
                      : 'border-zinc-200 hover:border-zinc-300',
                  )}
                  aria-label="No color"
                >
                  ×
                </button>
                {[
                  '#0F172A',
                  '#1D4ED8',
                  '#7C3AED',
                  '#DB2777',
                  '#DC2626',
                  '#EA580C',
                  '#16A34A',
                  '#0891B2',
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrimaryColor(c)}
                    className={cn(
                      'size-7 rounded-full border-2',
                      primaryColor === c
                        ? 'border-zinc-900'
                        : 'border-transparent hover:border-zinc-300',
                    )}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
        </SettingsSection>

        {/* Caps */}
        <SettingsSection
          title="Caps"
          description="Hard limits enforced server-side. Bumping these takes effect immediately."
        >
          <div className="grid gap-5 p-6 md:grid-cols-3">
            <Field label="Max users" hint={`${org.userCount} currently in use.`}>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxUsers}
                onChange={(e) => setMaxUsers(parseIntSafe(e.target.value, 1, 10000, org.maxUsers))}
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 tabular-nums"
              />
            </Field>
            <Field
              label="Max workspaces"
              hint={`${org.workspaceCount} currently in use.`}
            >
              <input
                type="number"
                min={1}
                max={1000}
                value={maxWorkspaces}
                onChange={(e) =>
                  setMaxWorkspaces(parseIntSafe(e.target.value, 1, 1000, org.maxWorkspaces))
                }
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 tabular-nums"
              />
            </Field>
            <Field label="Max resources per workspace">
              <input
                type="number"
                min={1}
                max={100000}
                value={maxResourcesPerWorkspace}
                onChange={(e) =>
                  setMaxResourcesPerWorkspace(
                    parseIntSafe(e.target.value, 1, 100000, org.maxResourcesPerWorkspace),
                  )
                }
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 tabular-nums"
              />
            </Field>
          </div>
        </SettingsSection>

        {/* AI usage */}
        <UsageSection organizationId={org.id} />

        {/* Danger zone */}
        <DangerZone org={org} />
      </div>
    </AdminPageBody>
  );
}

/* ─────────────── AI usage ─────────────── */

function UsageSection({ organizationId }: { organizationId: string }) {
  const summaryQuery = trpc.adminPlatform.organizationUsageSummary.useQuery({
    organizationId,
  });
  const perUserQuery = trpc.adminPlatform.organizationUsagePerUser.useQuery({
    organizationId,
  });
  const recentQuery = trpc.adminPlatform.organizationUsageRecent.useQuery({
    organizationId,
    limit: 25,
  });

  const summary = summaryQuery.data;
  const perUser = perUserQuery.data ?? [];
  const recent = recentQuery.data ?? [];

  const monthLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  return (
    <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-6 py-4">
        <p className="text-sm font-medium text-black">AI usage</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Month-to-date spend across every user in this organization.{' '}
          {monthLabel} · UTC.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
        <UsageStat
          label="Total cost"
          value={formatUsd(summary?.totalCostMicrodollars ?? 0)}
          highlight
        />
        <UsageStat
          label="Calls"
          value={(summary?.totalCalls ?? 0).toLocaleString()}
        />
        <UsageStat
          label="Input tokens"
          value={(summary?.totalPromptTokens ?? 0).toLocaleString()}
        />
        <UsageStat
          label="Output tokens"
          value={(summary?.totalCompletionTokens ?? 0).toLocaleString()}
        />
      </div>

      {/* Breakdown by model */}
      <div className="border-t border-zinc-100">
        <p className="px-6 pt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          By model
        </p>
        <div className="scrollbar-thin overflow-x-auto px-6 pb-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <UTh>Type</UTh>
                <UTh>Model</UTh>
                <UTh align="right">Calls</UTh>
                <UTh align="right">Input</UTh>
                <UTh align="right">Output</UTh>
                <UTh align="right">Cost</UTh>
              </tr>
            </thead>
            <tbody>
              {summaryQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!summaryQuery.isLoading && summary?.breakdown.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No usage yet this month.
                  </td>
                </tr>
              )}
              {summary?.breakdown.map((row, i) => (
                <tr
                  key={`${row.type}-${row.provider}-${row.model}-${i}`}
                  className="border-t border-zinc-100"
                >
                  <UTd>
                    <UsageTypeBadge type={row.type} />
                  </UTd>
                  <UTd mono>
                    {row.provider}/{row.model}
                  </UTd>
                  <UTd align="right">{row.calls.toLocaleString()}</UTd>
                  <UTd align="right">{row.promptTokens.toLocaleString()}</UTd>
                  <UTd align="right">
                    {row.completionTokens.toLocaleString()}
                  </UTd>
                  <UTd align="right" bold>
                    {formatUsd(row.costMicrodollars)}
                  </UTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-seat spend */}
      <div className="border-t border-zinc-100">
        <p className="px-6 pt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Per seat
        </p>
        <div className="scrollbar-thin overflow-x-auto px-6 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <UTh>User</UTh>
                <UTh align="right">Used</UTh>
                <UTh align="right">Cap</UTh>
                <UTh align="right">Remaining</UTh>
              </tr>
            </thead>
            <tbody>
              {perUserQuery.isLoading && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!perUserQuery.isLoading && perUser.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-zinc-500">
                    No members yet.
                  </td>
                </tr>
              )}
              {perUser.map((u) => (
                <tr key={u.userId} className="border-t border-zinc-100">
                  <UTd>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900">
                        {u.userName ?? u.userEmail ?? '—'}
                      </span>
                      {u.userName && u.userEmail && (
                        <span className="text-xs text-zinc-500">
                          {u.userEmail}
                        </span>
                      )}
                    </div>
                  </UTd>
                  <UTd align="right" bold>
                    {formatUsd(u.usedMicrodollars)}
                  </UTd>
                  <UTd align="right">{formatUsd(u.capMicrodollars)}</UTd>
                  <UTd align="right">
                    {formatUsd(
                      Math.max(0, u.capMicrodollars - u.usedMicrodollars),
                    )}
                  </UTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity */}
      <div className="border-t border-zinc-100">
        <p className="px-6 pt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Recent activity
        </p>
        <div className="scrollbar-thin overflow-x-auto px-6 pb-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <UTh>When</UTh>
                <UTh>User</UTh>
                <UTh>Type</UTh>
                <UTh>Model</UTh>
                <UTh align="right">Cost</UTh>
              </tr>
            </thead>
            <tbody>
              {recentQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!recentQuery.isLoading && recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No recent activity.
                  </td>
                </tr>
              )}
              {recent.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100">
                  <UTd>{formatRelativeTime(new Date(row.createdAt))}</UTd>
                  <UTd>{row.userName ?? row.userEmail ?? '—'}</UTd>
                  <UTd>
                    <UsageTypeBadge type={row.type} />
                  </UTd>
                  <UTd mono>
                    {row.provider}/{row.model}
                  </UTd>
                  <UTd align="right" bold>
                    {formatUsd(row.costMicrodollars)}
                  </UTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UsageStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[10px] border p-4',
        highlight ? 'border-black/10 bg-zinc-50' : 'border-zinc-200',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
    </div>
  );
}

function UTh({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      className={cn(
        'py-2.5 pr-4 font-medium',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function UTd({
  children,
  align,
  mono,
  bold,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      className={cn(
        'py-2.5 pr-4 text-zinc-700',
        align === 'right' && 'text-right tabular-nums',
        mono && 'font-mono text-[13px]',
        bold && 'font-semibold text-zinc-900',
      )}
    >
      {children}
    </td>
  );
}

function UsageTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        usageTypeColor(type),
      )}
    >
      {type}
    </span>
  );
}

function usageTypeColor(type: string): string {
  switch (type) {
    case 'CHAT':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'EMBED':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'RERANK':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'OCR':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'CONTEXTUALIZE':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'TITLE':
      return 'border-zinc-200 bg-zinc-50 text-zinc-600';
    default:
      return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  }
}

function formatUsd(microdollars: number): string {
  const usd = microdollars / 1_000_000;
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

function formatRelativeTime(date: Date): string {
  const delta = (Date.now() - date.getTime()) / 1000;
  if (delta < 60) return `${Math.floor(delta)}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)}d ago`;
  return date.toLocaleDateString();
}

/* ─────────────── danger zone ─────────────── */

function DangerZone({
  org,
}: {
  org: {
    id: string;
    name: string;
    slug: string;
    suspended: string | null;
    userCount: number;
    workspaceCount: number;
  };
}) {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const update = trpc.adminPlatform.organizationUpdate.useMutation();
  const del = trpc.adminPlatform.organizationDelete.useMutation();

  const [showSuspend, setShowSuspend] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');

  function handleSuspend(toggle: 'on' | 'off') {
    if (toggle === 'off') {
      update.mutate(
        { id: org.id, suspended: null },
        {
          onSuccess: () => {
            void utils.adminPlatform.organizationGet.invalidate({ id: org.id });
            void utils.adminPlatform.organizationsList.invalidate();
          },
        },
      );
    } else {
      const r = reason.trim();
      if (!r) return;
      update.mutate(
        { id: org.id, suspended: r },
        {
          onSuccess: () => {
            setShowSuspend(false);
            setReason('');
            void utils.adminPlatform.organizationGet.invalidate({ id: org.id });
            void utils.adminPlatform.organizationsList.invalidate();
          },
        },
      );
    }
  }

  function handleDelete() {
    if (confirm !== org.slug) return;
    del.mutate(
      { id: org.id },
      {
        onSuccess: () => {
          void utils.adminPlatform.organizationsList.invalidate();
          void navigate('/admin/platform/organizations');
        },
      },
    );
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-red-200 bg-white">
      <div className="border-b border-red-100 bg-red-50/40 px-6 py-4">
        <p className="text-sm font-semibold text-red-700">Danger zone</p>
        <p className="mt-0.5 text-xs text-red-600/80">
          Suspending freezes access immediately. Deleting cascades to every member,
          file, chat, and audit row owned by this organization.
        </p>
      </div>

      <div className="divide-y divide-red-100">
        <DangerRow
          icon={ShieldOff}
          title={org.suspended ? 'Unsuspend organization' : 'Suspend organization'}
          description={
            org.suspended
              ? 'Restore access for all members of this organization.'
              : 'Freeze access for all members. They will see a maintenance message.'
          }
          actionLabel={org.suspended ? 'Unsuspend' : 'Suspend'}
          onClick={() => (org.suspended ? handleSuspend('off') : setShowSuspend(true))}
          pending={update.isPending}
          variant={org.suspended ? 'subtle' : 'warn'}
        />
        <DangerRow
          icon={Trash2}
          title="Delete organization"
          description={`${org.userCount} ${pluralize(org.userCount, 'user')} and ${org.workspaceCount} ${pluralize(org.workspaceCount, 'workspace')} will be permanently removed.`}
          actionLabel="Delete…"
          onClick={() => setShowDelete(true)}
          variant="danger"
        />
      </div>

      {/* Suspend dialog */}
      {showSuspend && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6"
          onClick={() => setShowSuspend(false)}
        >
          <div
            className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-zinc-900">
              Suspend {org.name}?
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              All members will be locked out until you unsuspend. The reason is
              shown to them on the maintenance screen.
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Billing past due — payment failed 30 days running"
              className="mt-4 w-full resize-none rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSuspend(false)}
                className="rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSuspend('on')}
                disabled={!reason.trim() || update.isPending}
                className="rounded-[10px] bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {update.isPending ? 'Suspending…' : 'Suspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      {showDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6"
          onClick={() => setShowDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-red-700">
              Delete {org.name}?
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              This is irreversible. To confirm, type the slug{' '}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-800">
                {org.slug}
              </code>{' '}
              below.
            </p>
            <input
              autoFocus
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={org.slug}
              className="mt-4 w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={confirm !== org.slug || del.isPending}
                className="rounded-[10px] bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {del.isPending ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────── small components ─────────────── */

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-6 py-4">
        <p className="text-sm font-medium text-black">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatBlock({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-4 text-zinc-500">{hint}</span>}
    </label>
  );
}

function DangerRow({
  icon: Icon,
  title,
  description,
  actionLabel,
  onClick,
  pending,
  variant,
}: {
  icon: typeof Trash2;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  pending?: boolean;
  variant: 'warn' | 'danger' | 'subtle';
}) {
  const btn =
    variant === 'danger'
      ? 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
      : variant === 'warn'
        ? 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50'
        : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50';
  const iconBg =
    variant === 'danger'
      ? 'bg-red-50 text-red-600'
      : variant === 'warn'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-zinc-100 text-zinc-700';
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-[8px]', iconBg)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          'shrink-0 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          btn,
        )}
      >
        {pending ? 'Working…' : actionLabel}
      </button>
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

function parseIntSafe(s: string, min: number, max: number, fallback: number) {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function pluralize(n: number, word: string) {
  return n === 1 ? word : `${word}s`;
}
