import { useState } from 'react';
import { Check, Copy, Loader2, Mail, Trash2, UserPlus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../AdminLayout';

/**
 * Members tab — current users + pending invitations. Admin can create new
 * invitations (email + role), copy the invite link (we don't ship email
 * sending in v1), revoke pending invites, change existing user roles, and
 * remove users from the organization.
 */
export function MembersPage() {
  const utils = trpc.useUtils();
  const meQuery = trpc.health.me.useQuery();
  const usersQuery = trpc.adminOrganization.usersList.useQuery();
  const invitesQuery = trpc.adminOrganization.invitesList.useQuery();
  const myUserId = meQuery.data?.id ?? null;

  const inviteCreate = trpc.adminOrganization.inviteCreate.useMutation();
  const inviteRevoke = trpc.adminOrganization.inviteRevoke.useMutation();
  const setRole = trpc.adminOrganization.userSetRole.useMutation();
  const removeUser = trpc.adminOrganization.userRemove.useMutation();

  const [showDialog, setShowDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'user' | 'organization_admin'>('user');
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    email: string;
    emailSent: boolean;
    emailError: string | null;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const users = usersQuery.data ?? [];
  const invites = (invitesQuery.data ?? []).filter((i) => i.status === 'pending');

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setError(null);
    try {
      const res = await inviteCreate.mutateAsync({ email, role: inviteRole });
      setCreatedInvite({
        token: res.token,
        email,
        emailSent: res.emailSent,
        emailError: res.emailError,
      });
      setInviteEmail('');
      await utils.adminOrganization.invitesList.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    }
  }

  async function copyInviteLink(token: string) {
    const link = buildInviteLink(token);
    await navigator.clipboard.writeText(link);
    setCopied(token);
    window.setTimeout(() => setCopied(null), 1500);
  }

  function handleRevoke(invitationId: string) {
    inviteRevoke.mutate(
      { invitationId },
      {
        onSuccess: () => {
          void utils.adminOrganization.invitesList.invalidate();
        },
      },
    );
  }

  function handleChangeRole(userId: string, role: 'user' | 'organization_admin') {
    setRole.mutate(
      { userId, role },
      {
        onSuccess: () => {
          void utils.adminOrganization.usersList.invalidate();
        },
      },
    );
  }

  function handleRemove(userId: string) {
    removeUser.mutate(
      { userId },
      {
        onSuccess: () => {
          void utils.adminOrganization.usersList.invalidate();
        },
      },
    );
  }

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
        {/* ─── Members list ─── */}
        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">Members</p>
              <p className="mt-1 text-sm text-zinc-500">
                Everyone with access to this organization.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowDialog(true);
                setCreatedInvite(null);
                setError(null);
              }}
              className="flex items-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <UserPlus className="size-4" />
              Invite member
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!usersQuery.isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                    No members yet.
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isSelf = u.id === myUserId;
                const locked = isSelf || u.role === 'superadmin';
                return (
                  <tr key={u.id} className="border-t border-zinc-100">
                    <Td bold>
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs font-normal text-zinc-500">(you)</span>
                      )}
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <select
                        value={u.role}
                        disabled={locked || setRole.isPending}
                        onChange={(e) =>
                          handleChangeRole(u.id, e.target.value as 'user' | 'organization_admin')
                        }
                        className="rounded-[8px] border border-zinc-200 bg-white px-2 py-1 text-xs outline-none disabled:opacity-60"
                      >
                        <option value="user">User</option>
                        <option value="organization_admin">Organization Admin</option>
                        {u.role === 'superadmin' && (
                          <option value="superadmin">Superadmin</option>
                        )}
                      </select>
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        disabled={locked || removeUser.isPending}
                        onClick={() => handleRemove(u.id)}
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="size-3" />
                        Remove
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ─── Pending invitations ─── */}
        {invites.length > 0 && (
          <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 p-6">
              <div>
                <p className="text-sm font-medium leading-5 text-black">
                  Pending invitations
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Copy the invite link and send it to the recipient. Expires in 14 days.
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-zinc-100">
                    <Td>{i.email}</Td>
                    <Td>{i.role === 'organization_admin' ? 'Organization Admin' : 'User'}</Td>
                    <Td>{formatRelativeFuture(new Date(i.expiresAt))}</Td>
                    <Td align="right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyInviteLink(i.token)}
                          className="inline-flex items-center gap-1.5 rounded-[8px] border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          {copied === i.token ? (
                            <>
                              <Check className="size-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              Copy link
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(i.id)}
                          disabled={inviteRevoke.isPending}
                          className="inline-flex items-center gap-1.5 rounded-[8px] bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                        >
                          <X className="size-3" />
                          Revoke
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* ─── Invite dialog ─── */}
      {showDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6">
          <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-6 shadow-xl">
            {!createdInvite ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-zinc-100 text-zinc-600">
                    <Mail className="size-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-semibold text-zinc-900">
                      Invite a new member
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      We'll generate a link you can send to them. Link expires in 14 days.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-600">
                      Email address
                    </label>
                    <input
                      autoFocus
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="mt-1 w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-600">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as 'user' | 'organization_admin')
                      }
                      className="mt-1 w-full rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                    >
                      <option value="user">User</option>
                      <option value="organization_admin">Organization Admin</option>
                    </select>
                  </div>
                  {error && (
                    <p className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDialog(false)}
                    className="rounded-[10px] border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInvite()}
                    disabled={inviteCreate.isPending || !inviteEmail.trim()}
                    className={cn(
                      'flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white transition-colors',
                      inviteCreate.isPending
                        ? 'cursor-not-allowed opacity-70'
                        : 'hover:bg-zinc-800',
                    )}
                  >
                    {inviteCreate.isPending && <Loader2 className="size-4 animate-spin" />}
                    Create invitation
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'grid size-10 place-items-center rounded-full',
                      createdInvite.emailSent
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    <Check className="size-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-semibold text-zinc-900">
                      {createdInvite.emailSent ? 'Invitation sent' : 'Invitation ready'}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {createdInvite.emailSent ? (
                        <>
                          We emailed the invite to{' '}
                          <span className="font-medium text-zinc-900">
                            {createdInvite.email}
                          </span>
                          . Link also copyable below (expires in 14 days).
                        </>
                      ) : (
                        <>
                          {createdInvite.emailError ?? 'Email not sent.'} Copy the link
                          below and send it to{' '}
                          <span className="font-medium text-zinc-900">
                            {createdInvite.email}
                          </span>{' '}
                          — it expires in 14 days.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                  <p className="break-all font-mono text-xs text-zinc-700">
                    {buildInviteLink(createdInvite.token)}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDialog(false);
                      setCreatedInvite(null);
                    }}
                    className="rounded-[10px] border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyInviteLink(createdInvite.token)}
                    className="flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    {copied === createdInvite.token ? (
                      <>
                        <Check className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        Copy link
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminPageBody>
  );
}

function buildInviteLink(token: string): string {
  // Both dev (Vite dev server) and packaged Electron ship a hash router, so
  // `#/accept-invite/<token>` resolves in either host. window.location.origin
  // handles localhost:5173, file://, app://.
  return `${window.location.origin}/#/accept-invite/${token}`;
}

function formatRelativeFuture(date: Date): string {
  const delta = (date.getTime() - Date.now()) / 1000;
  if (delta <= 0) return 'expired';
  if (delta < 3600) return `in ${Math.floor(delta / 60)}m`;
  if (delta < 86400) return `in ${Math.floor(delta / 3600)}h`;
  const days = Math.floor(delta / 86400);
  return `in ${days}d`;
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
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
  bold,
}: {
  children: React.ReactNode;
  align?: 'right';
  bold?: boolean;
}) {
  const cls = [
    'px-6 py-3 text-zinc-700',
    align === 'right' ? 'text-right' : '',
    bold ? 'font-medium text-zinc-900' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <td className={cls}>{children}</td>;
}
