import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminSidebar } from './AdminSidebar';
import {
  AdminSaveContext,
  type AdminSaveAction,
  type AdminSaveContextValue,
} from './admin-save-context';

/**
 * Gate + shell for every /admin/workspace/* route.
 *
 * Access rules:
 *   - No active workspace → redirect to /workspaces picker.
 *   - Authed user must be OWNER/ADMIN of that workspace, or a platform
 *     superadmin / organization_admin. Server mirrors this check on every
 *     procedure call.
 *
 * Provides the left nav + sticky top bar, plus AdminSaveContext so child
 * pages can register their Save action for the shared button.
 */
export function AdminLayout() {
  const me = trpc.health.me.useQuery();
  const wsQuery = trpc.adminWorkspace.workspaceGet.useQuery(undefined, {
    retry: false,
    enabled: me.data?.activeWorkspaceId != null,
  });
  const [saveAction, setSaveAction] = useState<AdminSaveAction | null>(null);
  const register = useCallback((action: AdminSaveAction | null) => {
    setSaveAction(action);
  }, []);
  const saveCtx = useMemo<AdminSaveContextValue>(() => ({ register }), [register]);

  if (me.isLoading) {
    return (
      <div className="grid h-screen place-items-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }
  if (me.error) {
    return (
      <div className="grid h-screen place-items-center text-sm text-red-600">
        {me.error.message}
      </div>
    );
  }
  const user = me.data;
  if (!user) return <Navigate to="/chat" replace />;

  // Superadmins are platform-tier only — they never operate inside a
  // workspace or organization. Bounce them up.
  if (user.role === 'superadmin') return <Navigate to="/admin/platform" replace />;

  if (!user.activeWorkspaceId) return <Navigate to="/workspaces" replace />;

  // Workspace admin requires being an OWNER/ADMIN member of THIS workspace.
  // Org-wide admin role no longer auto-elevates — see workspaceAdminProcedure
  // in trpc.ts for the matching server check. Org admins who need to manage
  // a workspace they're not in should add themselves as a member first.
  const wsRole = wsQuery.data?.myRole;
  const canAdmin = wsRole === 'OWNER' || wsRole === 'ADMIN';

  if (wsQuery.isLoading) {
    return (
      <div className="grid h-screen place-items-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }
  if (wsQuery.error || !canAdmin) {
    return <Navigate to="/chat" replace />;
  }

  const workspaceName =
    wsQuery.data?.name ?? user.activeWorkspace?.name ?? 'Workspace';

  return (
    <AdminSaveContext.Provider value={saveCtx}>
      <div className="flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
        <AdminSidebar workspaceName={workspaceName} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AdminTopBar save={saveAction} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminSaveContext.Provider>
  );
}

function AdminTopBar({ save }: { save: AdminSaveAction | null }) {
  const location = useLocation();
  const crumb = deriveCrumb(location.pathname);

  return (
    <header className="flex h-[138px] shrink-0 items-start justify-between border-b border-zinc-200 bg-[#fafafa] px-8 pt-10">
      <div className="max-w-[520px]">
        <h1 className="text-[20px] font-medium leading-7 tracking-[-0.4px] text-black">
          {crumb.title}
        </h1>
        {crumb.description && (
          <p className="mt-2 text-base font-medium leading-6 text-zinc-600">
            {crumb.description}
          </p>
        )}
      </div>
      {save && (
        <button
          type="button"
          onClick={save.onSave}
          disabled={save.disabled || save.pending}
          className={cn(
            'flex items-center rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors',
            save.disabled || save.pending
              ? 'cursor-not-allowed opacity-50'
              : 'hover:bg-zinc-50',
          )}
        >
          {save.pending ? 'Saving…' : (save.label ?? 'Save changes')}
        </button>
      )}
    </header>
  );
}

interface Crumb {
  title: string;
  description?: string;
}

function deriveCrumb(pathname: string): Crumb {
  if (pathname.startsWith('/admin/workspace/general'))
    return {
      title: 'Workspace Information',
      description: 'Name, description, logo, and branding for this workspace.',
    };
  if (pathname.startsWith('/admin/workspace/files'))
    return {
      title: 'Workspace Files',
      description: 'Files visible only to members of this workspace.',
    };
  if (pathname.startsWith('/admin/workspace/ai-customization'))
    return {
      title: 'AI Customization',
      description: 'Tone, system prompt, and model defaults.',
    };
  if (pathname.startsWith('/admin/workspace/users'))
    return {
      title: 'Users',
      description: 'Members of this workspace and their roles.',
    };
  if (pathname.startsWith('/admin/workspace/token-usage'))
    return {
      title: 'Token Usage',
      description: 'Spend across AI requests in this workspace.',
    };
  if (pathname.startsWith('/admin/workspace/integration'))
    return { title: 'Integration', description: 'Connect external services.' };
  if (pathname.startsWith('/admin/workspace/profile'))
    return { title: 'Profile', description: 'Your personal account.' };
  if (pathname.startsWith('/admin/workspace/preferences'))
    return { title: 'Preferences', description: 'Personal app preferences.' };
  if (pathname.startsWith('/admin/workspace/notifications'))
    return { title: 'Notifications', description: 'Email and in-app alerts.' };
  if (pathname.startsWith('/admin/workspace/api-keys'))
    return { title: 'API Keys', description: 'Personal access tokens.' };
  return { title: 'Admin Settings' };
}

/** Rendered by pages that want the save bar hidden by the outlet. */
export function AdminPageBody({ children }: { children: ReactNode }) {
  return <div className="px-8 py-6">{children}</div>;
}
