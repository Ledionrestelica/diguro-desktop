interface SettingsUser {
  role: string;
  activeWorkspaceId: string | null;
  activeWorkspace?: { myRole: 'OWNER' | 'ADMIN' | 'MEMBER' | null } | null;
}

/** Workspace settings: the active workspace's owners and admins, plus
 *  organization admins. Superadmins stay on the platform tier. */
export function canAdminWorkspace(user: SettingsUser): boolean {
  if (user.role === 'superadmin' || !user.activeWorkspaceId) return false;
  if (user.role === 'organization_admin') return true;
  const role = user.activeWorkspace?.myRole;
  return role === 'OWNER' || role === 'ADMIN';
}

/** Organization settings: organization admins only. */
export function canAdminOrganization(user: SettingsUser): boolean {
  return user.role === 'organization_admin';
}
