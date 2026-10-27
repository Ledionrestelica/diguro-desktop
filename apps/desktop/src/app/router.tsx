import { createHashRouter, Navigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { ChatLayout } from '@/features/chat/ChatLayout';
import { ChatPage } from '@/features/chat/ChatPage';
import { SettingsLayout } from '@/features/admin/SettingsLayout';
import {
  RequireOrganizationAdmin,
  RequireWorkspaceAdmin,
} from '@/features/admin/RequireSettingsAccess';
import { LegacyAdminRedirect } from '@/features/admin/LegacyAdminRedirect';
import {
  ProfileSettingsPage,
  SecuritySettingsPage,
} from '@/features/admin/pages/AccountSettingsPages';
import { PlatformAdminLayout } from '@/features/admin/PlatformAdminLayout';
import { GeneralSettingsPage } from '@/features/admin/pages/GeneralSettingsPage';
import { OrganizationGeneralSettingsPage } from '@/features/admin/pages/OrganizationGeneralSettingsPage';
import { OrganizationFilesPage } from '@/features/admin/pages/OrganizationFilesPage';
import { OrganizationWorkspacesPage } from '@/features/admin/pages/OrganizationWorkspacesPage';
import { WorkspaceFilesPage } from '@/features/admin/pages/WorkspaceFilesPage';
import { PersonalFilesPage } from '@/features/files/PersonalFilesPage';
import { TokenUsagePage } from '@/features/admin/pages/TokenUsagePage';
import { AuditLogPage } from '@/features/admin/pages/AuditLogPage';
import { MembersPage } from '@/features/admin/pages/MembersPage';
import { PlatformDashboardPage } from '@/features/admin/pages/PlatformDashboardPage';
import { PlatformOrganizationsPage } from '@/features/admin/pages/PlatformOrganizationsPage';
import { PlatformOrganizationDetailPage } from '@/features/admin/pages/PlatformOrganizationDetailPage';
import { PlatformUsersPage } from '@/features/admin/pages/PlatformUsersPage';
import { AcceptInvitePage } from '@/features/invitations/AcceptInvitePage';
import { WorkspacePickerPage } from '@/features/workspaces/WorkspacePickerPage';
import { NewWorkspaceWizardPage } from '@/features/workspaces/NewWorkspaceWizardPage';

/**
 * Hash-based router so packaged Electron (file://) builds still resolve routes.
 *
 * Root `/` redirects to `/workspaces` — the workspace picker is the default
 * landing page after sign-in. Users pick a workspace (or create one) before
 * entering chat.
 *
 * Top-level layouts:
 *   - WorkspacePickerPage at /workspaces (full screen)
 *   - ChatLayout for /chat/*
 *   - SettingsLayout for /settings/* (sections role-gated internally)
 */
/**
 * Role-aware landing for `/`. Superadmins go to the platform overview;
 * everyone else to the workspace picker.
 */
function RootRedirect() {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (me.data?.role === 'superadmin') {
    return <Navigate to="/admin/platform" replace />;
  }
  return <Navigate to="/workspaces" replace />;
}

export const router = createHashRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/workspaces', element: <WorkspacePickerPage /> },
  { path: '/workspaces/new', element: <NewWorkspaceWizardPage /> },
  { path: '/accept-invite/:token', element: <AcceptInvitePage /> },
  { path: '/my-files', element: <PersonalFilesPage /> },

  // Back-compat redirects for older links.
  { path: '/orgs', element: <Navigate to="/workspaces" replace /> },
  { path: '/orgs/new', element: <Navigate to="/workspaces/new" replace /> },
  { path: '/admin/company/*', element: <Navigate to="/settings" replace /> },
  { path: '/admin/org/*', element: <Navigate to="/settings" replace /> },

  {
    path: '/chat',
    element: <ChatLayout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: ':chatId', element: <ChatPage /> },
    ],
  },
  {
    path: '/admin/platform',
    element: <PlatformAdminLayout />,
    children: [
      { index: true, element: <PlatformDashboardPage /> },
      { path: 'organizations', element: <PlatformOrganizationsPage /> },
      { path: 'organizations/:id', element: <PlatformOrganizationDetailPage /> },
      { path: 'users', element: <PlatformUsersPage /> },
    ],
  },
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Navigate to="/settings/profile" replace /> },
      { path: 'profile', element: <ProfileSettingsPage /> },
      { path: 'security', element: <SecuritySettingsPage /> },
      {
        path: 'workspace',
        element: <RequireWorkspaceAdmin />,
        children: [
          { index: true, element: <Navigate to="/settings/workspace/general" replace /> },
          { path: 'general', element: <GeneralSettingsPage /> },
          { path: 'files', element: <WorkspaceFilesPage /> },
        ],
      },
      {
        path: 'organization',
        element: <RequireOrganizationAdmin />,
        children: [
          { index: true, element: <Navigate to="/settings/organization/general" replace /> },
          { path: 'general', element: <OrganizationGeneralSettingsPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'workspaces', element: <OrganizationWorkspacesPage /> },
          { path: 'files', element: <OrganizationFilesPage /> },
          { path: 'usage', element: <TokenUsagePage /> },
          { path: 'audit-log', element: <AuditLogPage /> },
        ],
      },
    ],
  },
  // The workspace and organization admin pages moved under /settings.
  { path: '/admin/workspace/*', element: <LegacyAdminRedirect /> },
  { path: '/admin/organization/*', element: <LegacyAdminRedirect /> },
]);
