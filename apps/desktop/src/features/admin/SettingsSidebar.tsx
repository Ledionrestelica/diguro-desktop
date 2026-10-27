import { useNavigate } from 'react-router-dom';
import { PiUserDefaultStroke } from '@/components/icons/pika/PiUserDefaultStroke';
import { PiShieldStroke } from '@/components/icons/pika/PiShieldStroke';
import { PiSettings01Stroke } from '@/components/icons/pika/PiSettings01Stroke';
import { PiHomeDefaultStroke } from '@/components/icons/pika/PiHomeDefaultStroke';
import { PiFileTextStroke } from '@/components/icons/pika/PiFileTextStroke';
import { PiUserTwoStroke } from '@/components/icons/pika/PiUserTwoStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiFolderOpenStroke } from '@/components/icons/pika/PiFolderOpenStroke';
import { PiBarchartDefaultStroke } from '@/components/icons/pika/PiBarchartDefaultStroke';
import { PiReminderAnticlockwiseStroke } from '@/components/icons/pika/PiReminderAnticlockwiseStroke';
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
        <SettingsNavLink to="/settings/profile" icon={PiUserDefaultStroke} label="Profile" />
        <SettingsNavLink to="/settings/security" icon={PiShieldStroke} label="Security" />
      </SettingsNavGroup>

      {user && canAdminWorkspace(user) && (
        <SettingsNavGroup label={`Workspace · ${user.activeWorkspace?.name ?? ''}`}>
          <SettingsNavLink
            to="/settings/workspace/general"
            icon={PiSettings01Stroke}
            label="General"
          />
          <SettingsNavLink to="/settings/workspace/files" icon={PiFileTextStroke} label="Files" />
        </SettingsNavGroup>
      )}

      {user && canAdminOrganization(user) && (
        <SettingsNavGroup label={`Organization · ${user.organization?.name ?? ''}`}>
          <SettingsNavLink
            to="/settings/organization/general"
            icon={PiHomeDefaultStroke}
            label="General"
          />
          <SettingsNavLink
            to="/settings/organization/members"
            icon={PiUserTwoStroke}
            label="Members"
          />
          <SettingsNavLink
            to="/settings/organization/workspaces"
            icon={PiFolderDefaultStroke}
            label="Workspaces"
          />
          <SettingsNavLink
            to="/settings/organization/files"
            icon={PiFolderOpenStroke}
            label="Files"
          />
          <SettingsNavLink
            to="/settings/organization/usage"
            icon={PiBarchartDefaultStroke}
            label="Usage"
          />
          <SettingsNavLink
            to="/settings/organization/audit-log"
            icon={PiReminderAnticlockwiseStroke}
            label="Audit log"
          />
        </SettingsNavGroup>
      )}
    </SettingsNav>
  );
}
