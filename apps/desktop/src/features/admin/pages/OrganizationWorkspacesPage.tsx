import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../AdminLayout';

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
      <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 p-6">
          <div>
            <p className="text-sm font-medium leading-5 text-black">
              All workspaces
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Click a workspace to manage who has access to it.
            </p>
          </div>
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
            className="flex items-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <Plus className="size-4" />
            New workspace
          </button>
        </div>

        {createOpen && (
          <div className="border-b border-zinc-100 bg-zinc-50/60 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-600">Name</label>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    if (!slugTouched) setDraftSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. Marketing"
                  className="mt-1 w-full rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-zinc-600">
                  Slug
                </label>
                <input
                  value={draftSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraftSlug(e.target.value);
                  }}
                  placeholder="marketing"
                  className="mt-1 w-full rounded-[8px] border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={
                    !draftName.trim() ||
                    !(draftSlug.trim() || slugify(draftName)) ||
                    workspaceCreate.isPending
                  }
                  className={cn(
                    'flex h-10 items-center gap-2 rounded-[8px] bg-black px-4 text-sm font-medium text-white transition-colors',
                    !draftName.trim() || workspaceCreate.isPending
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:bg-zinc-800',
                  )}
                >
                  {workspaceCreate.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen(false);
                    resetCreateForm();
                  }}
                  className="h-10 rounded-[8px] border border-zinc-200 bg-white px-4 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
            {createError && (
              <p className="mt-2 rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
                {createError}
              </p>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              You'll be added as the workspace OWNER. You can invite the
              rest of the team after it's created.
            </p>
          </div>
        )}

        {workspacesQuery.isLoading && (
          <p className="px-6 py-8 text-center text-sm text-zinc-500">Loading…</p>
        )}

        {!workspacesQuery.isLoading && workspaces.length === 0 && (
          <p className="px-6 py-14 text-center text-sm text-zinc-500">
            No workspaces yet.
          </p>
        )}

        <ul className="flex flex-col">
          {workspaces.map((ws) => (
            <li key={ws.id} className="border-t border-zinc-100">
              <button
                type="button"
                onClick={() =>
                  setExpandedId((prev) => (prev === ws.id ? null : ws.id))
                }
                className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-zinc-50"
              >
                {expandedId === ws.id ? (
                  <ChevronDown className="size-4 text-zinc-400" />
                ) : (
                  <ChevronRight className="size-4 text-zinc-400" />
                )}
                <div className="grid size-10 place-items-center rounded-[8px] bg-zinc-100">
                  {ws.logoUrl ? (
                    <img
                      src={ws.logoUrl}
                      alt=""
                      className="size-10 rounded-[8px] object-cover"
                    />
                  ) : (
                    <Users className="size-4 text-zinc-500" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {ws.name}
                  </p>
                  <p className="text-xs text-zinc-500">{ws.slug}</p>
                </div>
                <span className="ml-auto text-xs text-zinc-500">
                  {ws.memberCount} member{ws.memberCount === 1 ? '' : 's'}
                </span>
              </button>

              {expandedId === ws.id && <WorkspaceMembersPanel workspaceId={ws.id} />}
            </li>
          ))}
        </ul>
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

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/60 px-6 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Members
        </p>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        >
          <UserPlus className="size-3.5" />
          Add member
        </button>
      </div>

      {showAdd && (
        <div className="mt-3 flex items-end gap-2 rounded-[10px] border border-zinc-200 bg-white p-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-zinc-600">User</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={addableQuery.isLoading || addable.length === 0}
              className="mt-1 w-full rounded-[8px] border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none disabled:opacity-60"
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
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role)}
              className="mt-1 rounded-[8px] border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!selectedUserId || addMember.isPending}
            className={cn(
              'flex h-8 items-center gap-2 rounded-[8px] bg-black px-3 text-sm font-medium text-white transition-colors',
              !selectedUserId || addMember.isPending
                ? 'cursor-not-allowed opacity-60'
                : 'hover:bg-zinc-800',
            )}
          >
            {addMember.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAdd(false);
              setSelectedUserId('');
              setError(null);
            }}
            className="h-8 rounded-[8px] border border-zinc-200 bg-white px-3 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-[10px] border border-zinc-200 bg-white">
        {membersQuery.isLoading && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</p>
        )}
        {!membersQuery.isLoading && members.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            No members yet.
          </p>
        )}
        <ul className="flex flex-col">
          {members.map((m) => (
            <li
              key={m.memberId}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0"
            >
              <div className="grid size-8 place-items-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-700">
                {initials(m.email, m.name)}
              </div>
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-medium text-zinc-800">
                  {m.name || m.email}
                </p>
                {m.name && (
                  <p className="truncate text-xs text-zinc-500">{m.email}</p>
                )}
              </div>
              <select
                value={m.role}
                onChange={(e) =>
                  handleRoleChange(m.memberId, e.target.value as Role)
                }
                disabled={setRole.isPending}
                className="ml-auto rounded-[8px] border border-zinc-200 bg-white px-2 py-1 text-xs outline-none disabled:opacity-60"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
                <option value="OWNER">Owner</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemove(m.memberId)}
                disabled={removeMember.isPending}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-3" />
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
