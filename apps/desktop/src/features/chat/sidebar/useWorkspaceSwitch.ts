import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

/** The user's workspaces and switching between them (sidebar + rail). */
export function useWorkspaceSwitch() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const me = trpc.health.me.useQuery();
  const workspaces = trpc.workspaces.myList.useQuery();
  const setActive = trpc.workspaces.setActive.useMutation();
  const activeId = me.data?.activeWorkspaceId ?? null;

  async function pick(workspaceId: string) {
    if (workspaceId === activeId || setActive.isPending) return;
    await setActive.mutateAsync({ workspaceId });
    await utils.health.me.invalidate();
    void utils.conversations.list.invalidate();
    void navigate('/chat');
  }

  return {
    workspaces: workspaces.data ?? [],
    activeId,
    pendingId: setActive.isPending ? (setActive.variables?.workspaceId ?? null) : null,
    switching: setActive.isPending,
    pick,
  };
}
