import { useCallback, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { OrganizationAdminSidebar } from './OrganizationAdminSidebar';
import {
  AdminSaveContext,
  type AdminSaveAction,
  type AdminSaveContextValue,
} from './admin-save-context';
import { AdminPageBody } from './AdminLayout';

/**
 * Gate + shell for every /admin/organization/* route.
 *
 * Organization-level admin manages the TENANT (the Diguro HQ / Acme Inc.)
 * rather than a single workspace. Only superadmins + organization_admins
 * have access. No active-workspace requirement — org admin is orthogonal
 * to which workspace you're currently chatting inside.
 */
export function OrganizationAdminLayout() {
  const me = trpc.health.me.useQuery();
  const orgQuery = trpc.adminOrganization.organizationGet.useQuery(undefined, {
    retry: false,
    enabled:
      me.data?.role === 'superadmin' || me.data?.role === 'organization_admin',
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

  const canAdminOrg =
    user.role === 'superadmin' || user.role === 'organization_admin';
  if (!canAdminOrg) return <Navigate to="/chat" replace />;

  if (orgQuery.isLoading) {
    return (
      <div className="grid h-screen place-items-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }
  if (orgQuery.error || !orgQuery.data) {
    return <Navigate to="/workspaces" replace />;
  }

  return (
    <AdminSaveContext.Provider value={saveCtx}>
      <div className="flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
        <OrganizationAdminSidebar organizationName={orgQuery.data.name} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <OrganizationAdminTopBar save={saveAction} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminSaveContext.Provider>
  );
}

function OrganizationAdminTopBar({ save }: { save: AdminSaveAction | null }) {
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
  if (pathname.startsWith('/admin/organization/general'))
    return {
      title: 'Organization Information',
      description: 'Name, slug, logo, and branding for your organization.',
    };
  if (pathname.startsWith('/admin/organization/members'))
    return {
      title: 'Members',
      description: 'Everyone with access to this organization.',
    };
  if (pathname.startsWith('/admin/organization/workspaces'))
    return {
      title: 'Workspaces',
      description: 'Workspaces inside this organization.',
    };
  if (pathname.startsWith('/admin/organization/files'))
    return {
      title: 'Files',
      description:
        'Documents available across every workspace in this organization.',
    };
  if (pathname.startsWith('/admin/organization/token-usage'))
    return {
      title: 'Token Usage',
      description: 'Spend across all workspaces in this organization.',
    };
  if (pathname.startsWith('/admin/organization/billing'))
    return {
      title: 'Billing',
      description: 'Plan, invoices, and payment method.',
    };
  return { title: 'Organization Settings' };
}

export { AdminPageBody };
