import { useCallback, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { SettingsFrame } from './SettingsFrame';
import { SettingsSidebar } from './SettingsSidebar';
import {
  AdminSaveContext,
  type AdminSaveAction,
  type AdminSaveContextValue,
} from './admin-save-context';

/**
 * Shell for every /settings/* route (Figma "Settings · B · Full page"):
 * Account for everyone, plus Workspace and Organization sections for the
 * people allowed to manage them. The sections gate themselves with
 * RequireWorkspaceAdmin / RequireOrganizationAdmin, and the server checks
 * every procedure again.
 */
export function SettingsLayout() {
  const location = useLocation();
  const me = trpc.health.me.useQuery();
  const [saveAction, setSaveAction] = useState<AdminSaveAction | null>(null);
  const register = useCallback((action: AdminSaveAction | null) => {
    setSaveAction(action);
  }, []);
  const saveCtx = useMemo<AdminSaveContextValue>(() => ({ register }), [register]);

  if (me.isLoading) {
    return (
      <div className="grid h-screen place-items-center text-label-13 text-text-secondary">
        Loading…
      </div>
    );
  }
  if (!me.data) return <Navigate to="/chat" replace />;

  const crumb = settingsCrumb(location.pathname, me.data.activeWorkspace?.name);

  return (
    <AdminSaveContext.Provider value={saveCtx}>
      <SettingsFrame
        sidebar={<SettingsSidebar />}
        title={crumb.title}
        description={crumb.description}
        save={saveAction}
      >
        <Outlet />
      </SettingsFrame>
    </AdminSaveContext.Provider>
  );
}

function settingsCrumb(
  pathname: string,
  workspaceName: string | undefined,
): { title: string; description?: string } {
  const page = pathname.replace(/^\/settings\/?/, '');
  const crumbs: Record<string, { title: string; description?: string }> = {
    profile: { title: 'Profile', description: 'How you appear to your team.' },
    security: { title: 'Security', description: 'Keep your account safe.' },
    'workspace/general': {
      title: workspaceName ? `${workspaceName} workspace` : 'Workspace',
      description:
        'Settings for everyone in this workspace. Only owners and admins can change them.',
    },
    'workspace/files': {
      title: 'Workspace files',
      description: 'Files only members of this workspace can see and chat with.',
    },
    'organization/general': {
      title: 'Organization',
      description: "Your organization's name, brand and limits.",
    },
    'organization/members': {
      title: 'Members',
      description: 'Everyone in your organization and the workspaces they’re in.',
    },
    'organization/workspaces': {
      title: 'Workspaces',
      description: 'Each workspace has its own files, chats and members.',
    },
    'organization/files': {
      title: 'Files',
      description: 'Documents available across every workspace in your organization.',
    },
    'organization/usage': {
      title: 'Usage',
      description: 'What your organization spent on AI, and where it went.',
    },
    'organization/audit-log': {
      title: 'Audit log',
      description: 'Who did what in your organization.',
    },
  };
  return crumbs[page] ?? { title: 'Settings' };
}
