import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../PlatformAdminLayout';
import { OrgGlyph } from './PlatformDashboardPage';

/**
 * Platform → Organizations list. Searchable, sortable-by-recent table
 * with cap fill bars for users + workspaces. Click a row to drill into
 * the per-org settings page. Top-right action opens the create dialog.
 */
export function PlatformOrganizationsPage() {
  const utils = trpc.useUtils();
  const orgsQuery = trpc.adminPlatform.organizationsList.useQuery();
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const orgs = orgsQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
    );
  }, [orgs, query]);

  return (
    <AdminPageBody>
      <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[8px] bg-zinc-100 text-zinc-700">
              <Building2 className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium leading-5 text-black">
                All organizations
              </p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {orgs.length === 0
                  ? 'No organizations yet.'
                  : `${orgs.length} ${orgs.length === 1 ? 'tenant' : 'tenants'} on the platform.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or slug"
                className="w-64 rounded-[10px] border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Plus className="size-4" />
              New organization
            </button>
          </div>
        </div>

        <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <Th>Organization</Th>
              <Th>Users</Th>
              <Th>Workspaces</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th align="right">{''}</Th>
            </tr>
          </thead>
          <tbody>
            {orgsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!orgsQuery.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <p className="text-sm font-medium text-zinc-700">
                      {query ? 'No matches' : 'No organizations yet'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {query
                        ? 'Try a different search term.'
                        : 'Create the first tenant to get started.'}
                    </p>
                    {!query && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] bg-black px-3 py-1.5 text-xs font-medium text-white"
                      >
                        <Plus className="size-3.5" />
                        New organization
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer border-t border-zinc-100 transition-colors hover:bg-zinc-50/70"
              >
                <Td>
                  <Link
                    to={`/admin/platform/organizations/${o.id}`}
                    className="flex items-center gap-3"
                  >
                    <OrgGlyph
                      seed={o.id}
                      primaryColor={o.primaryColor}
                      logoUrl={o.logoUrl}
                      size={32}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {o.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{o.slug}</p>
                    </div>
                  </Link>
                </Td>
                <Td>
                  <CapBar current={o.userCount} max={o.maxUsers} />
                </Td>
                <Td>
                  <CapBar current={o.workspaceCount} max={o.maxWorkspaces} />
                </Td>
                <Td>
                  {o.suspended ? (
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
                </Td>
                <Td>
                  <span className="text-xs text-zinc-500">
                    {new Date(o.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </Td>
                <Td align="right">
                  <Link
                    to={`/admin/platform/organizations/${o.id}`}
                    className="inline-flex items-center rounded-[8px] border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Manage
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {showCreate && (
        <CreateOrganizationDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void utils.adminPlatform.organizationsList.invalidate();
          }}
        />
      )}
    </AdminPageBody>
  );
}

/* ─────────────── create dialog ─────────────── */

const PRESET_COLORS = [
  '#0F172A',
  '#1D4ED8',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#16A34A',
  '#0891B2',
];

function CreateOrganizationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const create = trpc.adminPlatform.organizationCreate.useMutation();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugDirty, setSlugDirty] = useState(false);
  const [maxUsers, setMaxUsers] = useState(50);
  const [maxWorkspaces, setMaxWorkspaces] = useState(20);
  const [primaryColor, setPrimaryColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const computedSlug = slugDirty ? slug : slugify(name);

  async function handleCreate() {
    setError(null);
    const finalSlug = computedSlug;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!/^[a-z0-9-]{2,60}$/.test(finalSlug)) {
      setError('Slug must be 2–60 chars, lowercase letters, digits, dashes only');
      return;
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        slug: finalSlug,
        maxUsers,
        maxWorkspaces,
        ...(primaryColor ? { primaryColor } : {}),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[16px] border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-[10px] bg-zinc-100 text-zinc-700">
              <Building2 className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-zinc-900">
                New organization
              </p>
              <p className="mt-0.5 text-sm text-zinc-500">
                Tenants are isolated. Files, members, and chats never cross orgs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 pb-6 pt-4">
          {/* Name + Slug */}
          <Field label="Name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
            />
          </Field>

          <Field
            label="Slug"
            hint="URL-safe handle. Auto-generated from the name; click to edit."
          >
            <div className="flex items-stretch overflow-hidden rounded-[10px] border border-zinc-200 bg-white focus-within:border-zinc-400">
              <span className="grid place-items-center bg-zinc-50 px-3 text-xs text-zinc-500">
                /
              </span>
              <input
                value={computedSlug}
                onChange={(e) => {
                  setSlugDirty(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                onFocus={() => setSlugDirty(true)}
                placeholder="acme-corp"
                className="w-full px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </Field>

          {/* Caps */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max users">
              <input
                type="number"
                min={1}
                max={10000}
                value={maxUsers}
                onChange={(e) => setMaxUsers(parseIntSafe(e.target.value, 1, 10000, 50))}
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 tabular-nums"
              />
            </Field>
            <Field label="Max workspaces">
              <input
                type="number"
                min={1}
                max={1000}
                value={maxWorkspaces}
                onChange={(e) =>
                  setMaxWorkspaces(parseIntSafe(e.target.value, 1, 1000, 20))
                }
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 tabular-nums"
              />
            </Field>
          </div>

          {/* Primary color */}
          <Field
            label="Brand color"
            hint="Used for the org glyph and accent UI. Optional."
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
                title="No color"
              >
                ×
              </button>
              {PRESET_COLORS.map((c) => (
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

          {error && (
            <p className="rounded-[10px] bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={create.isPending}
            className="rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── small components ─────────────── */

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

function CapBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (current / max) * 100 : 0);
  const tone =
    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-zinc-700';
  return (
    <div className="flex w-32 flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs tabular-nums">
        <span className="font-medium text-zinc-700">{current}</span>
        <span className="text-zinc-400">/ {max}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn('h-full rounded-full transition-all', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right' | 'left';
}) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-left font-medium',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right' | 'left';
}) {
  return (
    <td className={cn('px-6 py-4 align-middle', align === 'right' && 'text-right')}>
      {children}
    </td>
  );
}

/* ─────────────── helpers ─────────────── */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

function parseIntSafe(s: string, min: number, max: number, fallback: number) {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
