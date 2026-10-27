import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  Coins,
  FileText,
  FolderOpen,
  ScrollText,
  Settings2,
  Shield,
  User,
  Users,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { SettingsNav, SettingsNavGroup, SettingsNavLink } from './SettingsNav';
import { canAdminOrganization, canAdminWorkspace } from './settingsAccess';

/** The settings menu (Figma "Settings sidebar"): Account for everyone,
 *  Workspace and Organization for the people who can manage them. */
export function SettingsSidebar() {
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery();
  const user = me.data;
  const isSuperadmin = user?.role === 'superadmin';

  return (
    <SettingsNav
      backLabel={isSuperadmin ? 'Back to platform' : 'Back to chat'}
      onBack={() => void navigate(isSuperadmin ? '/admin/platform' : '/chat')}
    >
      <SettingsNavGroup label="Account">
        <SettingsNavLink to="/settings/profile" icon={User} label="Profile" />
        <SettingsNavLink to="/settings/security" icon={Shield} label="Security" />
      </SettingsNavGroup>

      {user && canAdminWorkspace(user) && (
        <SettingsNavGroup label={`Workspace · ${user.activeWorkspace?.name ?? ''}`}>
          <SettingsNavLink to="/settings/workspace/general" icon={Settings2} label="General" />
          <SettingsNavLink to="/settings/workspace/files" icon={FileText} label="Files" />
        </SettingsNavGroup>
      )}

      {user && canAdminOrganization(user) && (
        <SettingsNavGroup label={`Organization · ${user.organization?.name ?? ''}`}>
          <SettingsNavLink to="/settings/organization/general" icon={Settings2} label="General" />
          <SettingsNavLink to="/settings/organization/members" icon={Users} label="Members" />
          <SettingsNavLink to="/settings/organization/workspaces" icon={Boxes} label="Workspaces" />
          <SettingsNavLink to="/settings/organization/files" icon={FolderOpen} label="Files" />
          <SettingsNavLink to="/settings/organization/usage" icon={Coins} label="Usage" />
          <SettingsNavLink
            to="/settings/organization/audit-log"
            icon={ScrollText}
            label="Audit log"
          />
        </SettingsNavGroup>
      )}
    </SettingsNav>
  );
}
