import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { WorkspaceGlyph } from '@/features/workspaces/WorkspaceGlyph';

/**
 * Slack-style vertical rail of workspaces the user belongs to. Sits to the
 * left of the chat sidebar. Each icon switches the active workspace and
 * reloads the chat pane. Admins get a "+" at the bottom to create a new
 * workspace via the wizard.
 */
export function WorkspaceRail() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const me = trpc.health.me.useQuery();
  const workspacesQuery = trpc.workspaces.myList.useQuery();
  const setActive = trpc.workspaces.setActive.useMutation();

  const activeId = me.data?.activeWorkspaceId ?? null;
  const canCreate =
    me.data?.role === 'superadmin' || me.data?.role === 'organization_admin';

  const onPick = async (workspaceId: string) => {
    if (workspaceId === activeId || setActive.isPending) return;
    await setActive.mutateAsync({ workspaceId });
    await utils.health.me.invalidate();
    void utils.conversations.list.invalidate();
    void navigate('/chat');
  };

  const pendingId = setActive.isPending ? setActive.variables?.workspaceId : null;

  return (
    <nav
      aria-label="Workspaces"
      className="flex h-full w-[60px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-zinc-200 bg-zinc-100 py-3"
    >
      {workspacesQuery.isLoading && (
        <div className="flex size-10 items-center justify-center">
          <Loader2 className="size-4 animate-spin text-zinc-400" />
        </div>
      )}

      {workspacesQuery.data?.map((ws) => {
        const isActive = ws.id === activeId;
        const isSwitching = pendingId === ws.id;
        return (
          <button
            key={ws.id}
            type="button"
            onClick={() => void onPick(ws.id)}
            disabled={setActive.isPending}
            title={ws.name}
            aria-label={ws.name}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'group relative flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-all',
              'hover:rounded-[12px] hover:shadow-md',
              isActive && 'ring-1 ring-zinc-300 ring-offset-2 ring-offset-zinc-100',
              setActive.isPending && !isSwitching && 'opacity-60',
            )}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-zinc-400"
              />
            )}
            {ws.logoUrl ? (
              <img
                src={ws.logoUrl}
                alt=""
                className="size-10 rounded-[10px] object-cover"
              />
            ) : (
              <WorkspaceGlyph seed={ws.id} size={28} />
            )}
            {isSwitching && (
              <span className="absolute inset-0 grid place-items-center rounded-[10px] bg-white/70 backdrop-blur-sm">
                <Loader2 className="size-4 animate-spin text-zinc-500" />
              </span>
            )}
          </button>
        );
      })}

      {canCreate && (
        <button
          type="button"
          onClick={() => void navigate('/workspaces/new')}
          title="Create workspace"
          aria-label="Create workspace"
          className="mt-1 grid size-10 shrink-0 place-items-center rounded-[10px] border border-dashed border-zinc-300 bg-transparent text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-white hover:text-zinc-800"
        >
          <Plus className="size-4" />
        </button>
      )}
    </nav>
  );
}
