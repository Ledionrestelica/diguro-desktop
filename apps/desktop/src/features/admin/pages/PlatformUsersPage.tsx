import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../PlatformAdminLayout';
import { Avatar, OrgGlyph } from './PlatformDashboardPage';

/**
 * Platform → Users. Single global table of every account on the platform.
 * Filterable by org and free-text. Per-row controls: change role, reassign
 * organization, ban (banned users keep their row but can't sign in — the
 * banned column lives on auth.users in Better-Auth's schema). Mutations
 * use systemAdminProcedure on the server.
 */

type Role = 'superadmin' | 'organization_admin' | 'user';

export function PlatformUsersPage() {
  const utils = trpc.useUtils();
  const [orgFilter, setOrgFilter] = useState<string | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const me = trpc.health.me.useQuery();
  const orgsQuery = trpc.adminPlatform.organizationsList.useQuery();
  const usersQuery = trpc.adminPlatform.usersList.useQuery(
    orgFilter === 'all' ? undefined : { organizationId: orgFilter },
  );
  const setRole = trpc.adminPlatform.userSetRole.useMutation();
  const assignOrg = trpc.adminPlatform.userAssignOrganization.useMutation();
  const deleteUser = trpc.adminPlatform.userDelete.useMutation();
  const myUserId = me.data?.id ?? null;

  function handleDelete(userId: string, label: string) {
    if (!window.confirm(
      `Delete ${label}? This permanently removes the account, their personal files, conversations, workspace memberships, and audit history. This cannot be undone.`,
    )) {
      return;
    }
    setDeleteError(null);
    deleteUser.mutate(
      { userId },
      {
        onSuccess: () => {
          void utils.adminPlatform.usersList.invalidate();
          void utils.adminPlatform.organizationsList.invalidate();
          void utils.adminPlatform.organizationGet.invalidate();
        },
        onError: (err) => setDeleteError(err.message),
      },
    );
  }

  const orgs = orgsQuery.data ?? [];
  const orgsById = useMemo(
    () => new Map(orgs.map((o) => [o.id, o])),
    [orgs],
  );

  const users = usersQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name?.toLowerCase().includes(q) ?? false),
    );
  }, [users, query]);

  function handleRoleChange(userId: string, role: Role) {
    setRole.mutate(
      { userId, role },
      {
        onSuccess: () => {
          void utils.adminPlatform.usersList.invalidate();
          // organizationGet returns counts grouped by org; invalidate so an
          // org detail page open in another tab reflects the new role.
          void utils.adminPlatform.organizationGet.invalidate();
          void utils.adminPlatform.organizationsList.invalidate();
          void utils.health.me.invalidate();
        },
      },
    );
  }

  function handleAssignOrg(userId: string, organizationId: string | null) {
    assignOrg.mutate(
      { userId, organizationId },
      {
        onSuccess: () => {
          void utils.adminPlatform.usersList.invalidate();
          void utils.adminPlatform.organizationsList.invalidate();
          // userCount on the org detail page is stale once we move a user
          // in or out — invalidate so it refetches on next mount/focus.
          void utils.adminPlatform.organizationGet.invalidate();
        },
      },
    );
  }

  return (
    <AdminPageBody>
      <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[8px] bg-zinc-100 text-zinc-700">
              <UsersIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium leading-5 text-black">All users</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {users.length === 0
                  ? 'No accounts yet.'
                  : `${users.length} ${users.length === 1 ? 'account' : 'accounts'}${
                      orgFilter !== 'all' ? ' in this org' : ' across all orgs'
                    }.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email"
                className="w-64 rounded-[10px] border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
              />
            </div>

            <div className="relative">
              <select
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                className="appearance-none rounded-[10px] border border-zinc-200 bg-white py-2 pl-3 pr-9 text-sm outline-none focus:border-zinc-400"
              >
                <option value="all">All organizations</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <UserPlus className="size-4" />
              New user
            </button>
          </div>
        </div>

        {deleteError && (
          <div className="border-b border-zinc-100 bg-red-50 px-6 py-2 text-sm text-red-700">
            {deleteError}
          </div>
        )}

        <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <Th>User</Th>
              <Th>Organization</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!usersQuery.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <p className="text-sm font-medium text-zinc-700">
                    {query ? 'No matches' : 'No users yet'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {query
                      ? 'Try a different search term.'
                      : 'Users appear here as soon as they sign up.'}
                  </p>
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const org = u.organizationId ? orgsById.get(u.organizationId) : null;
              return (
                <tr key={u.id} className="border-t border-zinc-100">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name ?? u.email} email={u.email} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {u.name || u.email.split('@')[0]}
                        </p>
                        <p className="truncate text-xs text-zinc-500">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {org ? (
                        <>
                          <OrgGlyph
                            seed={org.id}
                            primaryColor={org.primaryColor}
                            logoUrl={org.logoUrl}
                            size={20}
                          />
                          <span className="truncate text-sm text-zinc-700">
                            {org.name}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Unassigned
                        </span>
                      )}
                      {/* Reassign menu — simple select */}
                      <select
                        value={u.organizationId ?? ''}
                        disabled={assignOrg.isPending}
                        onChange={(e) =>
                          handleAssignOrg(u.id, e.target.value || null)
                        }
                        className="ml-1 rounded-[8px] border border-zinc-200 bg-white px-2 py-1 text-xs outline-none disabled:opacity-60"
                        aria-label="Reassign organization"
                      >
                        <option value="">— Unassigned —</option>
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Td>
                  <Td>
                    <select
                      value={u.role}
                      disabled={setRole.isPending}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                      className={cn(
                        'rounded-[8px] border bg-white px-2 py-1 text-xs font-semibold outline-none disabled:opacity-60',
                        u.role === 'superadmin'
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : u.role === 'organization_admin'
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-zinc-200 text-zinc-700',
                      )}
                    >
                      <option value="user">User</option>
                      <option value="organization_admin">Org Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </Td>
                  <Td>
                    {u.banned ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        Banned
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
                      {new Date(u.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => handleDelete(u.id, u.name || u.email)}
                      // Self-delete is blocked server-side too. Hiding the
                      // button here is just to keep the UI honest — an admin
                      // can't remove themselves and there's no use case for
                      // even attempting it from this surface.
                      disabled={
                        u.id === myUserId ||
                        deleteUser.isPending
                      }
                      title={
                        u.id === myUserId
                          ? 'You cannot delete your own account'
                          : 'Delete user'
                      }
                      className="inline-flex items-center gap-1.5 rounded-[8px] bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-50"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      {showCreate && (
        <CreateUserDialog
          orgs={orgs}
          defaultOrgId={orgFilter !== 'all' ? orgFilter : null}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void utils.adminPlatform.usersList.invalidate();
            void utils.adminPlatform.organizationsList.invalidate();
            // The newly-created user counts toward their org's userCount —
            // refetch the detail page if it's loaded.
            void utils.adminPlatform.organizationGet.invalidate();
          }}
        />
      )}
    </AdminPageBody>
  );
}

/* ─────────────── create user dialog ─────────────── */

function CreateUserDialog({
  orgs,
  defaultOrgId,
  onClose,
  onCreated,
}: {
  orgs: Array<{
    id: string;
    name: string;
    slug: string;
    primaryColor: string | null;
    logoUrl: string | null;
  }>;
  defaultOrgId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const create = trpc.adminPlatform.userCreate.useMutation();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPwd, setCopiedPwd] = useState(false);
  const [role, setRole] = useState<Role>('user');
  const [organizationId, setOrganizationId] = useState<string | ''>(
    defaultOrgId ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setError('Enter a valid email address');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await create.mutateAsync({
        email: e,
        name: name.trim(),
        password,
        role,
        organizationId: organizationId || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    }
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(password);
    setCopiedPwd(true);
    window.setTimeout(() => setCopiedPwd(false), 1500);
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
              <UserPlus className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-zinc-900">New user</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                Create an account directly. The user can sign in immediately
                with the password below — share it through a secure channel.
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

        <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Erika Karlsson"
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="erika@example.com"
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              />
            </Field>
          </div>

          <Field
            label="Temporary password"
            hint="Share through a secure channel. The user can change it after signing in."
          >
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 items-stretch overflow-hidden rounded-[10px] border border-zinc-200 bg-white focus-within:border-zinc-400">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 font-mono text-sm tracking-tight outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="grid w-9 shrink-0 place-items-center border-l border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                  aria-label={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                title="Regenerate"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void copyPassword()}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                title="Copy password"
              >
                {copiedPwd ? (
                  <>
                    <Check className="size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              >
                <option value="user">User</option>
                <option value="organization_admin">Organization Admin</option>
                <option value="superadmin">Superadmin (platform)</option>
              </select>
            </Field>
            <Field label="Organization">
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              >
                <option value="">— Unassigned —</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {role === 'superadmin' && (
            <div className="rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Superadmins operate at the platform tier and won't have access
              to chat or workspace surfaces. The Organization field is just
              for billing/reporting context — it doesn't grant access.
            </div>
          )}

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
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── helpers ─────────────── */

const PWD_ALPHABET =
  'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/l/I

function generatePassword(): string {
  const len = 14;
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += PWD_ALPHABET[arr[i]! % PWD_ALPHABET.length];
  }
  // Sprinkle a couple of disambiguating symbols so password meets common
  // policies even if a downstream validator is strict.
  return out.slice(0, len - 2) + '#' + out.slice(-1);
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

/* ─────────────── components ─────────────── */

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      className={`px-6 py-3 ${align === 'right' ? 'text-right' : 'text-left'} font-medium`}
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
  align?: 'right';
}) {
  return (
    <td
      className={`px-6 py-4 align-middle ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </td>
  );
}
