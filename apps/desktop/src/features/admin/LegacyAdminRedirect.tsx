import { Navigate, useLocation } from 'react-router-dom';

const MOVED: Record<string, string> = {
  '/admin/workspace/general': '/settings/workspace/general',
  '/admin/workspace/files': '/settings/workspace/files',
  '/admin/workspace/profile': '/settings/profile',
  '/admin/organization/general': '/settings/organization/general',
  '/admin/organization/members': '/settings/organization/members',
  '/admin/organization/workspaces': '/settings/organization/workspaces',
  '/admin/organization/files': '/settings/organization/files',
  '/admin/organization/token-usage': '/settings/organization/usage',
  '/admin/organization/audit-log': '/settings/organization/audit-log',
};

/** The workspace and organization admin pages moved under /settings; old
 *  links land on the matching page, or the section's General page. */
export function LegacyAdminRedirect() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '');
  const target =
    MOVED[path] ??
    (path.startsWith('/admin/organization')
      ? '/settings/organization/general'
      : '/settings/workspace/general');
  return <Navigate to={target} replace />;
}
