import { useCallback, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { PlatformAdminSidebar } from './PlatformAdminSidebar';
import {
  AdminSaveContext,
  type AdminSaveAction,
  type AdminSaveContextValue,
} from './admin-save-context';
import { AdminPageBody } from './AdminLayout';

/**
 * Gate + shell for every /admin/platform/* route.
 *
 * Platform tier sits ABOVE the per-organization tier — it's where
 * superadmins manage the whole installation: every tenant org, every
 * user, system health. Only system-role superadmins pass; everyone
 * else gets bounced back to /chat. Server mirrors the gate on every
 * adminPlatform.* tRPC procedure.
 */
export function PlatformAdminLayout() {
  const me = trpc.health.me.useQuery();
  const [saveAction, setSaveAction] = useState<AdminSaveAction | null>(null);
  const register = useCallback((action: AdminSaveAction | null) => {
    setSaveAction(action);
  }, []);
  const saveCtx = useMemo<AdminSaveContextValue>(() => ({ register }), [register]);

  if (me.isLoading) {
    return <div className="grid h-screen place-items-center text-sm text-zinc-500">Loading…</div>;
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
  if (user.role !== 'superadmin') return <Navigate to="/chat" replace />;

  return (
    <AdminSaveContext.Provider value={saveCtx}>
      <div className="flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
        <PlatformAdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PlatformAdminTopBar save={saveAction} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminSaveContext.Provider>
  );
}

function PlatformAdminTopBar({ save }: { save: AdminSaveAction | null }) {
  const location = useLocation();
  const crumb = deriveCrumb(location.pathname);

  return (
    <header className="flex h-[138px] shrink-0 items-start justify-between border-b border-zinc-200 bg-[#fafafa] px-8 pt-10">
      <div className="flex max-w-[640px] items-start gap-4">
        <div>
          <h1 className="text-[20px] font-medium leading-7 tracking-[-0.4px] text-black">
            {crumb.title}
          </h1>
          {crumb.description && (
            <p className="mt-2 text-base font-medium leading-6 text-zinc-600">
              {crumb.description}
            </p>
          )}
        </div>
      </div>
      {save && (
        <button
          type="button"
          onClick={save.onSave}
          disabled={save.disabled || save.pending}
          className={cn(
            'flex items-center rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors',
            save.disabled || save.pending ? 'cursor-not-allowed opacity-50' : 'hover:bg-zinc-50',
          )}
        >
          {save.pending ? 'Saving…' : (save.label ?? 'Save changes')}
        </button>
      )}
    </header>
  );
}

interface Crumb {
  eyebrow?: string;
  title: string;
  description?: string;
}

function deriveCrumb(pathname: string): Crumb {
  if (pathname === '/admin/platform' || pathname === '/admin/platform/') {
    return {
      eyebrow: 'Platform',
      title: 'Overview',
      description: 'Tenants, users, and system health — across the entire Diguro platform.',
    };
  }
  if (pathname === '/admin/platform/organizations') {
    return {
      eyebrow: 'Platform',
      title: 'Organizations',
      description: 'Every tenant on the platform. Create, suspend, or delete.',
    };
  }
  if (pathname.startsWith('/admin/platform/organizations/')) {
    return {
      eyebrow: 'Organization',
      title: 'Settings',
      description: 'Edit branding, raise caps, or suspend access. Changes take effect immediately.',
    };
  }
  if (pathname === '/admin/platform/users') {
    return {
      eyebrow: 'Platform',
      title: 'Users',
      description:
        'Every account on the platform. Promote, reassign, or ban — across organizations.',
    };
  }
  return { eyebrow: 'Platform', title: 'Admin' };
}

export { AdminPageBody };
