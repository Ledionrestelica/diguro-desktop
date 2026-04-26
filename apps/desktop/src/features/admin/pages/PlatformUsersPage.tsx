import { useMemo, useState } from 'react';
import { Search, Users as UsersIcon, ChevronDown } from 'lucide-react';
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

  const orgsQuery = trpc.adminPlatform.organizationsList.useQuery();
  const usersQuery = trpc.adminPlatform.usersList.useQuery(
    orgFilter === 'all' ? undefined : { organizationId: orgFilter },
  );
  const setRole = trpc.adminPlatform.userSetRole.useMutation();
  const assignOrg = trpc.adminPlatform.userAssignOrganization.useMutation();

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
                <option value="__unassigned__" disabled>
                  ─────
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <Th>User</Th>
              <Th>Organization</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
            {!usersQuery.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </AdminPageBody>
  );
}

/* ─────────────── components ─────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-6 py-3 text-left font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-6 py-4 align-middle">{children}</td>;
}
