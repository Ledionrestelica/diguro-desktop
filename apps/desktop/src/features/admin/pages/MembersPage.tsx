import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import { PiCopyDefaultStroke } from '@/components/icons/pika/PiCopyDefaultStroke';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { PiDeleteDustbin02Stroke } from '@/components/icons/pika/PiDeleteDustbin02Stroke';
import { PiUserPlusStroke } from '@/components/icons/pika/PiUserPlusStroke';
import { PiMultipleCrossCancelDefaultStroke } from '@/components/icons/pika/PiMultipleCrossCancelDefaultStroke';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { TextField } from '@/components/ui/text-field';
import { AdminPageBody } from '../AdminPageBody';

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
    acceptUrl: string;
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
        acceptUrl: res.acceptUrl,
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

  async function copyInviteLink(token: string, link: string) {
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
      <section className="mb-7 flex flex-col gap-2.5">
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-label-14 font-semibold">Members</h2>
            <p className="text-label-13 text-text-secondary">
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
            className={primaryButton}
          >
            <PiUserPlusStroke className="size-4" />
            Invite member
          </button>
        </div>

        <div className="overflow-hidden rounded-[16px] border border-border-default">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px] text-label-14">
              <thead className="text-label-12 text-text-placeholder">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.isLoading && (
                  <tr>
                    <td
                      colSpan={4}
                      className="border-t border-border-default px-5 py-6 text-center text-text-secondary"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!usersQuery.isLoading && users.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="border-t border-border-default px-5 py-10 text-center text-text-secondary"
                    >
                      No members yet.
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const isSelf = u.id === myUserId;
                  const locked = isSelf || u.role === 'superadmin';
                  return (
                    <tr key={u.id} className="border-t border-border-default">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gray-4 text-label-12 font-semibold text-text">
                            {initials(u.name)}
                          </span>
                          <span className="truncate font-medium">{u.name}</span>
                          {isSelf && (
                            <span className="rounded-[6px] bg-bg-subtle px-2 py-0.5 text-label-12 font-medium text-text-secondary">
                              You
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td muted>{u.email}</Td>
                      <Td>
                        <select
                          value={u.role}
                          disabled={locked || setRole.isPending}
                          onChange={(e) =>
                            handleChangeRole(u.id, e.target.value as 'user' | 'organization_admin')
                          }
                          className={selectClass}
                        >
                          <option value="user">User</option>
                          <option value="organization_admin">Organization admin</option>
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
                          className={cn(secondaryButton, 'text-danger-text')}
                        >
                          <PiDeleteDustbin02Stroke className="size-3.5" />
                          Remove
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {invites.length > 0 && (
        <section className="mb-7 flex flex-col gap-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-label-14 font-semibold">Pending invitations</h2>
            <p className="text-label-13 text-text-secondary">
              Copy the invite link and send it to the recipient. Links expire in 14
              days.
            </p>
          </div>
          <div className="overflow-hidden rounded-[16px] border border-border-default">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[720px] text-label-14">
                <thead className="text-label-12 text-text-placeholder">
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Expires</Th>
                    <Th align="right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((i) => (
                    <tr key={i.id} className="border-t border-border-default">
                      <Td>
                        <span className="font-medium">{i.email}</span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center rounded-[6px] bg-bg-subtle px-2 py-0.5 text-label-12 font-medium text-text-secondary">
                          {i.role === 'organization_admin' ? 'Organization admin' : 'User'}
                        </span>
                      </Td>
                      <Td muted>{formatRelativeFuture(new Date(i.expiresAt))}</Td>
                      <Td align="right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyInviteLink(i.token, i.acceptUrl)}
                            className={secondaryButton}
                          >
                            {copied === i.token ? (
                              <>
                                <PiCheckTickSingleStroke className="size-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <PiCopyDefaultStroke className="size-3.5" />
                                Copy link
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevoke(i.id)}
                            disabled={inviteRevoke.isPending}
                            className={cn(secondaryButton, 'text-danger-text')}
                          >
                            <PiMultipleCrossCancelDefaultStroke className="size-3.5" />
                            Revoke
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {showDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-6">
          <div className="w-full max-w-md rounded-[16px] border border-border-default bg-bg-panel p-6 shadow-xl">
            {!createdInvite ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-subtle text-text-secondary">
                    <PiEnvelopeDefaultStroke className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-label-14 font-semibold text-text">Invite a new member</p>
                    <p className="text-label-13 text-text-secondary">
                      We’ll create a link you can send to them. It expires in 14 days.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-4">
                  <TextField
                    label="Email address"
                    autoFocus
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                    error={error}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="invite-role" className="text-label-14 font-medium text-text">
                      Role
                    </label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as 'user' | 'organization_admin')
                      }
                      className={cn(selectClass, 'h-9 w-full px-3 text-copy-14')}
                    >
                      <option value="user">User</option>
                      <option value="organization_admin">Organization admin</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDialog(false)}
                    className={secondaryButton}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInvite()}
                    disabled={inviteCreate.isPending || !inviteEmail.trim()}
                    className={primaryButton}
                  >
                    {inviteCreate.isPending && (
                      <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                    )}
                    Create invitation
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full bg-bg-subtle',
                      createdInvite.emailSent ? 'text-success-text' : 'text-warning-text',
                    )}
                  >
                    <PiCheckTickSingleStroke className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-label-14 font-semibold text-text">
                      {createdInvite.emailSent ? 'Invitation sent' : 'Invitation ready'}
                    </p>
                    <p className="text-label-13 text-text-secondary">
                      {createdInvite.emailSent ? (
                        <>
                          We emailed the invite to{' '}
                          <span className="font-medium text-text">{createdInvite.email}</span>. You
                          can also copy the link below. It expires in 14 days.
                        </>
                      ) : (
                        <>
                          {createdInvite.emailError ?? 'Email not sent.'} Copy the
                          link below and send it to{' '}
                          <span className="font-medium text-text">{createdInvite.email}</span>. It
                          expires in 14 days.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-[10px] border border-border-default bg-bg-subtle px-3 py-2.5">
                  <p className="font-mono text-label-12 break-all text-text-secondary">
                    {createdInvite.acceptUrl}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDialog(false);
                      setCreatedInvite(null);
                    }}
                    className={secondaryButton}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyInviteLink(createdInvite.token, createdInvite.acceptUrl)
                    }
                    className={primaryButton}
                  >
                    {copied === createdInvite.token ? (
                      <>
                        <PiCheckTickSingleStroke className="size-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <PiCopyDefaultStroke className="size-3.5" />
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

const primaryButton =
  'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] bg-primary px-3 py-[7px] text-label-13 font-medium text-text-on-solid outline-none transition-opacity hover:opacity-90 focus-visible:shadow-[0_0_0_2px_var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-40';

const secondaryButton =
  'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border-default bg-bg-panel px-3 py-[7px] text-label-13 font-medium text-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-40';

const selectClass =
  'h-8 cursor-pointer rounded-[10px] border border-border-input bg-bg-panel px-2.5 text-label-13 text-text outline-none transition-[border-color,box-shadow] hover:border-border-hover focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_3px_var(--color-selection)] disabled:cursor-not-allowed disabled:border-border-default disabled:bg-bg-subtle disabled:text-text-secondary';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
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
    <th className={cn('px-5 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  muted,
}: {
  children: React.ReactNode;
  align?: 'right';
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-5 py-3',
        align === 'right' && 'text-right',
        muted ? 'text-text-secondary' : 'text-text',
      )}
    >
      {children}
    </td>
  );
}
