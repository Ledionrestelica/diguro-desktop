import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Settings } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { WorkspaceGlyph } from './WorkspaceGlyph';

/**
 * Full-screen "Choose your workspace" picker. Shown when a user wants
 * to pick which workspace to enter for chat. Organization admins can also
 * create a new workspace from here.
 *
 * Flow:
 *   - Click "Open Workspace" → setActive → navigate to /chat
 *   - Click "Create a new workspace +" → wizard → workspace created
 *     (you're OWNER + active) → navigate to /chat
 */
export function WorkspacePickerPage() {
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery();
  const workspacesQuery = trpc.workspaces.myList.useQuery();
  const utils = trpc.useUtils();
  const setActive = trpc.workspaces.setActive.useMutation();

  const canCreate =
    me.data?.role === 'superadmin' || me.data?.role === 'organization_admin';

  async function openWorkspace(workspaceId: string) {
    await setActive.mutateAsync({ workspaceId });
    await utils.health.me.invalidate();
    void navigate('/chat');
  }

  const organizationName = me.data?.organization?.name;

  return (
    <div className="min-h-screen bg-[#f9fafb] px-6 py-24">
      <div className="mx-auto w-full max-w-[607px]">
        <div className="flex flex-col items-center gap-3.5">
          <h1 className="w-[320px] text-center text-[24px] font-bold leading-8 tracking-[-0.48px] text-zinc-800">
            Choose your workspace
          </h1>
          <p className="text-sm leading-4 text-neutral-500">
            {organizationName ? (
              <>
                Workspaces in{' '}
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => void navigate('/admin/organization/general')}
                    title="Manage organization"
                    className="group inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    {organizationName}
                    <Settings className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ) : (
                  <span className="font-medium text-zinc-700">{organizationName}</span>
                )}
              </>
            ) : (
              'Sign in to your workspace'
            )}
          </p>
        </div>

        <div className="mt-[58px] flex flex-col gap-3">
          {workspacesQuery.isLoading && <WorkspaceCardSkeleton />}
          {workspacesQuery.data?.length === 0 && !workspacesQuery.isLoading && (
            <EmptyState isAdmin={canCreate} />
          )}
          {workspacesQuery.data?.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              busy={setActive.isPending}
              onOpen={() => void openWorkspace(workspace.id)}
            />
          ))}

          {canCreate && (
            <button
              type="button"
              onClick={() => void navigate('/workspaces/new')}
              className="mt-1 flex h-[66px] cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-zinc-200 bg-white text-base font-medium text-black shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors hover:bg-zinc-50"
            >
              Create a new workspace
              <Plus className="size-4" />
            </button>
          )}
        </div>

        {setActive.error && (
          <p className="mt-4 text-center text-sm text-red-600">
            {(setActive.error as { message: string }).message}
          </p>
        )}
      </div>
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: {
    id: string;
    name: string;
    memberCount: number;
    logoUrl: string | null;
  };
  busy: boolean;
  onOpen: () => void;
}

function WorkspaceCard({ workspace, busy, onOpen }: WorkspaceCardProps) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onOpen}
      className="group relative flex h-[102px] w-full items-center justify-between rounded-[12px] border border-zinc-100 bg-white px-5 text-left transition-colors hover:border-zinc-200 hover:bg-zinc-50/50 disabled:opacity-60"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center p-0.5">
            {workspace.logoUrl ? (
              <img
                src={workspace.logoUrl}
                alt=""
                className="size-[30px] rounded-full object-cover"
              />
            ) : (
              <WorkspaceGlyph seed={workspace.id} size={30} />
            )}
          </div>
          <p className="text-base font-medium leading-6 text-black">{workspace.name}</p>
        </div>
        <p className="text-base font-medium leading-6 text-zinc-500">
          {workspace.memberCount} Active user{workspace.memberCount === 1 ? '' : 's'}
        </p>
      </div>
      <div className="flex items-center gap-1 text-base font-medium leading-6 text-cyan-600">
        Open Workspace
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function WorkspaceCardSkeleton() {
  return (
    <div className="flex h-[102px] animate-pulse items-center justify-between rounded-[12px] border border-zinc-100 bg-white px-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="size-[30px] rounded-full bg-zinc-100" />
          <div className="h-4 w-24 rounded bg-zinc-100" />
        </div>
        <div className="h-4 w-32 rounded bg-zinc-100" />
      </div>
      <div className="h-4 w-36 rounded bg-zinc-100" />
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-zinc-200 bg-white/60 p-8 text-center">
      <p className="text-sm font-medium text-zinc-800">
        You're not a member of any workspace yet.
      </p>
      <p className="text-sm text-zinc-500">
        {isAdmin
          ? 'Create your first workspace below to start chatting.'
          : 'Ask your organization admin to add you to a workspace.'}
      </p>
    </div>
  );
}
