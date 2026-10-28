import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PiChevronRightStroke } from '@/components/icons/pika/PiChevronRightStroke';
import { PiPlusDefaultStroke } from '@/components/icons/pika/PiPlusDefaultStroke';
import { PiDeleteDustbin02Stroke } from '@/components/icons/pika/PiDeleteDustbin02Stroke';
import { PiUserPlusStroke } from '@/components/icons/pika/PiUserPlusStroke';
import { PiUserTwoStroke } from '@/components/icons/pika/PiUserTwoStroke';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { TextField } from '@/components/ui/text-field';
import { AdminPageBody } from '../AdminPageBody';
import { Collapsible } from '@/features/chat/trace/Collapsible';
import { dsButtonClass } from '@/components/ui/ds-button';

type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

/** Derive a URL-safe slug from a freeform workspace name. Server has its
 *  own SlugShape validator on `workspaceCreate` — this keeps the live
 *  preview in sync so the admin doesn't get rejected on submit. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Org-admin Workspaces page. Lists every workspace in the organization,
 * with an expandable per-workspace member panel for adding/removing
 * members and changing roles. This is the primary surface an org admin
 * uses to wire newly-invited users into a workspace — without it,
 * accepted invites land in an empty `myList` and the user is stuck on
 * the picker.
 */
export function OrganizationWorkspacesPage() {
  const utils = trpc.useUtils();
  const workspacesQuery = trpc.adminOrganization.workspacesList.useQuery();
  const workspaceCreate = trpc.adminOrganization.workspaceCreate.useMutation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Panels stay mounted once opened, so closing one animates too.
  const [openedIds, setOpenedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  // Track whether the admin has manually edited the slug — if so, stop
  // auto-deriving it from the name so we don't clobber their override.
  const [slugTouched, setSlugTouched] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const workspaces = workspacesQuery.data ?? [];

  function resetCreateForm() {
    setDraftName('');
    setDraftSlug('');
    setSlugTouched(false);
    setCreateError(null);
  }

  async function handleCreate() {
    const name = draftName.trim();
    const slug = draftSlug.trim() || slugify(draftName);
    if (!name || !slug) return;
    setCreateError(null);
    try {
      const res = await workspaceCreate.mutateAsync({ name, slug });
      await utils.adminOrganization.workspacesList.invalidate();
      setCreateOpen(false);
      resetCreateForm();
      // Expand the new workspace so the admin can immediately add members.
      setExpandedId(res.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <AdminPageBody>
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-label-13 text-text-secondary">
          Open a workspace to manage who has access to it.
        </p>
        <button
          type="button"
          onClick={() => {
            if (createOpen) {
              setCreateOpen(false);
              resetCreateForm();
            } else {
              setCreateOpen(true);
            }
          }}
          className={dsButtonClass({ variant: createOpen ? 'secondary' : 'primary' })}
        >
          <PiPlusDefaultStroke className="size-4" />
          New workspace
        </button>
      </div>

      <section className="divide-y divide-border-default overflow-hidden rounded-[16px] border border-border-default">
        {createOpen && (
          <div className="flex flex-col gap-3 bg-bg-subtle px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextField
                label="Name"
                size="sm"
                autoFocus
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (!slugTouched) setDraftSlug(slugify(e.target.value));
                }}
                placeholder="e.g. Marketing"
                className="flex-1"
              />
              <TextField
                label="Slug"
                size="sm"
                value={draftSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setDraftSlug(e.target.value);
                }}
                placeholder="marketing"
                className="flex-1"
                inputClassName="font-mono text-label-13"
              />
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={
                    !draftName.trim() ||
                    !(draftSlug.trim() || slugify(draftName)) ||
                    workspaceCreate.isPending
                  }
                  className={dsButtonClass({ variant: 'primary' })}
                >
                  {workspaceCreate.isPending && (
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
                  )}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                  }}
                  className={dsButtonClass()}
                >
                  Cancel
                </button>
              </div>
            </div>
            {createError && <p className="text-label-12 text-danger-text">{createError}</p>}
            <p className="text-label-12 text-text-placeholder">
              You’ll be added as the workspace owner. You can add the rest of the team after it’s
              created.
            </p>
          </div>
        )}

        {workspacesQuery.isLoading && (
          <p className="px-5 py-6 text-center text-label-14 text-text-secondary">Loading…</p>
        )}

        {!workspacesQuery.isLoading && workspaces.length === 0 && (
          <p className="px-5 py-10 text-center text-label-14 text-text-secondary">
            No workspaces yet.
          </p>
        )}

        {workspaces.length > 0 && (
          <ul className="flex flex-col divide-y divide-border-default">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  type="button"
                  aria-expanded={expandedId === ws.id}
                  onClick={() => {
                    setOpenedIds((prev) => new Set(prev).add(ws.id));
                    setExpandedId((prev) => (prev === ws.id ? null : ws.id));
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 py-3 pr-4 pl-5 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
                >
                  <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-gray-4 text-text-secondary">
                    {ws.logoUrl ? (
                      <img src={ws.logoUrl} alt="" className="size-9 object-cover" />
                    ) : (
                      <PiUserTwoStroke className="size-4" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-label-14 font-medium text-text">{ws.name}</p>
                    <p className="truncate text-label-13 text-text-secondary">
                      {ws.memberCount} member{ws.memberCount === 1 ? '' : 's'} · {ws.slug}
                    </p>
                  </div>
                  <PiChevronRightStroke
                    className={cn(
                      'size-4 shrink-0 text-text-placeholder transition-transform duration-200 ease-(--motion-ease-out)',
                      expandedId === ws.id && 'rotate-90',
                    )}
                  />
                </button>

                <Collapsible open={expandedId === ws.id} fast>
                  {(expandedId === ws.id || openedIds.has(ws.id)) && (
                    <WorkspaceMembersPanel workspaceId={ws.id} />
                  )}
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPageBody>
  );
}

function WorkspaceMembersPanel({ workspaceId }: { workspaceId: string }) {
  const utils = trpc.useUtils();
  const me = trpc.health.me.useQuery();
  const membersQuery = trpc.adminOrganization.workspaceMembersList.useQuery({
    workspaceId,
  });
  const addableQuery = trpc.adminOrganization.workspaceAddableUsers.useQuery({
    workspaceId,
  });
  const addMember = trpc.adminOrganization.workspaceMemberAdd.useMutation();
  const removeMember = trpc.adminOrganization.workspaceMemberRemove.useMutation();
  const setRole = trpc.adminOrganization.workspaceMemberSetRole.useMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('MEMBER');
  const [error, setError] = useState<string | null>(null);

  // Hide the current user's own row — managing your own membership from
  // here adds zero value (you can't reasonably remove yourself or change
  // your own role from this surface) and just clutters the list.
  const myUserId = me.data?.id ?? null;
  const members = (membersQuery.data ?? []).filter((m) => m.userId !== myUserId);
  const addable = addableQuery.data ?? [];

  function refresh() {
    void utils.adminOrganization.workspaceMembersList.invalidate({ workspaceId });
    void utils.adminOrganization.workspaceAddableUsers.invalidate({ workspaceId });
    void utils.adminOrganization.workspacesList.invalidate();
  }

  async function handleAdd() {
    if (!selectedUserId) return;
    setError(null);
    try {
      await addMember.mutateAsync({
        workspaceId,
        userId: selectedUserId,
        role: selectedRole,
      });
      setSelectedUserId('');
      setSelectedRole('MEMBER');
      setShowAdd(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  function handleRoleChange(memberId: string, role: Role) {
    setRole.mutate(
      { workspaceId, memberId, role },
      {
        onSuccess: () => refresh(),
        onError: (err) => setError(err.message),
      },
    );
  }

  function handleRemove(memberId: string) {
    removeMember.mutate(
      { workspaceId, memberId },
      {
        onSuccess: () => refresh(),
        onError: (err) => setError(err.message),
      },
    );
  }

  const selectClass =
    'h-8 cursor-pointer rounded-[10px] border border-border-default bg-bg-panel px-2.5 text-label-13 text-text outline-none transition-[border-color,box-shadow] hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="border-t border-border-default bg-bg-subtle py-4 pr-4 pl-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-label-14 font-semibold text-text">Members</p>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setError(null);
          }}
          className={dsButtonClass()}
        >
          <PiUserPlusStroke className="size-4" />
          Add member
        </button>
      </div>

      {showAdd && (
        <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-border-default bg-bg-panel p-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-label-13 font-medium text-text">User</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={addableQuery.isLoading || addable.length === 0}
              className={cn(selectClass, 'w-full')}
            >
              <option value="">
                {addableQuery.isLoading
                  ? 'Loading…'
                  : addable.length === 0
                    ? 'Everyone in this org is already a member'
                    : 'Pick a user…'}
              </option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} — ${u.email}` : u.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex shrink-0 flex-col gap-1.5">
            <span className="text-label-13 font-medium text-text">Role</span>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              className={selectClass}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!selectedUserId || addMember.isPending}
              className={dsButtonClass({ variant: 'primary' })}
            >
              {addMember.isPending && (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              )}
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setSelectedUserId('');
                setError(null);
              }}
              className={dsButtonClass()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-label-12 text-danger-text">{error}</p>}

      <div className="mt-3 overflow-hidden rounded-[12px] border border-border-default bg-bg-panel">
        {membersQuery.isLoading && (
          <p className="px-4 py-6 text-center text-label-14 text-text-secondary">Loading…</p>
        )}
        {!membersQuery.isLoading && members.length === 0 && (
          <p className="px-4 py-6 text-center text-label-14 text-text-secondary">No members yet.</p>
        )}
        <ul className="flex flex-col divide-y divide-border-default">
          {members.map((m) => (
            <li key={m.memberId} className="flex items-center gap-3 px-4 py-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-4 text-label-12 font-medium text-text">
                {initials(m.email, m.name)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-label-14 font-medium text-text">{m.name || m.email}</p>
                {m.name && <p className="truncate text-label-13 text-text-secondary">{m.email}</p>}
              </div>
              <select
                value={m.role}
                onChange={(e) => handleRoleChange(m.memberId, e.target.value as Role)}
                disabled={setRole.isPending}
                className={cn(selectClass, 'shrink-0')}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemove(m.memberId)}
                disabled={removeMember.isPending}
                className={dsButtonClass({ variant: 'danger' })}
              >
                <PiDeleteDustbin02Stroke className="size-4" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function initials(email: string, name: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
    }
    return (parts[0]?.slice(0, 2) ?? '·').toUpperCase();
  }
  const handle = email.split('@')[0] ?? email;
  return (handle.slice(0, 2) || '·').toUpperCase();
}
