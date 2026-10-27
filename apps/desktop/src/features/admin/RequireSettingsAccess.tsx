import { Navigate, Outlet } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

function Loading() {
  return <p className="text-label-13 text-text-secondary">Loading…</p>;
}

/**
 * Gate for /settings/workspace/*: the active workspace's OWNER/ADMIN members
 * and organization admins. The server's workspaceAdminProcedure checks the
 * same on every call.
 */
export function RequireWorkspaceAdmin() {
  const me = trpc.health.me.useQuery();
  const wsQuery = trpc.adminWorkspace.workspaceGet.useQuery(undefined, {
    retry: false,
    enabled: me.data?.activeWorkspaceId != null && me.data.role !== 'superadmin',
  });

  if (me.isLoading) return <Loading />;
  const user = me.data;
  if (!user) return <Navigate to="/chat" replace />;
  if (user.role === 'superadmin') return <Navigate to="/admin/platform" replace />;
  if (!user.activeWorkspaceId) return <Navigate to="/workspaces" replace />;
  if (wsQuery.isLoading) return <Loading />;

  const wsRole = wsQuery.data?.myRole;
  const canAdmin = user.role === 'organization_admin' || wsRole === 'OWNER' || wsRole === 'ADMIN';
  if (wsQuery.error || !canAdmin) return <Navigate to="/settings/profile" replace />;
  return <Outlet />;
}

/**
 * Gate for /settings/organization/*: organization admins only. Superadmins
 * manage tenants from /admin/platform. The server's organizationAdmin
 * procedures check the same on every call.
 */
export function RequireOrganizationAdmin() {
  const me = trpc.health.me.useQuery();
  const orgQuery = trpc.adminOrganization.organizationGet.useQuery(undefined, {
    retry: false,
    enabled: me.data?.role === 'organization_admin',
  });

  if (me.isLoading) return <Loading />;
  const user = me.data;
  if (!user) return <Navigate to="/chat" replace />;
  if (user.role === 'superadmin') return <Navigate to="/admin/platform" replace />;
  if (user.role !== 'organization_admin') return <Navigate to="/settings/profile" replace />;
  if (orgQuery.isLoading) return <Loading />;
  if (orgQuery.error || !orgQuery.data) return <Navigate to="/settings/profile" replace />;
  return <Outlet />;
}
