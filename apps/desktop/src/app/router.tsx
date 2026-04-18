import { createHashRouter, Navigate } from 'react-router-dom';
import { ChatLayout } from '@/features/chat/ChatLayout';
import { ChatPage } from '@/features/chat/ChatPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { OrganizationAdminLayout } from '@/features/admin/OrganizationAdminLayout';
import { GeneralSettingsPage } from '@/features/admin/pages/GeneralSettingsPage';
import { OrganizationGeneralSettingsPage } from '@/features/admin/pages/OrganizationGeneralSettingsPage';
import { OrganizationFilesPage } from '@/features/admin/pages/OrganizationFilesPage';
import { StubPage } from '@/features/admin/pages/StubPage';
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
 *   - AdminLayout for /admin/workspace/* (role-gated internally)
 */
export const router = createHashRouter([
  { path: '/', element: <Navigate to="/workspaces" replace /> },
  { path: '/workspaces', element: <WorkspacePickerPage /> },
  { path: '/workspaces/new', element: <NewWorkspaceWizardPage /> },

  // Back-compat redirects for older links.
  { path: '/orgs', element: <Navigate to="/workspaces" replace /> },
  { path: '/orgs/new', element: <Navigate to="/workspaces/new" replace /> },
  { path: '/admin/company/*', element: <Navigate to="/admin/workspace/general" replace /> },
  { path: '/admin/org/*', element: <Navigate to="/admin/workspace/general" replace /> },

  {
    path: '/chat',
    element: <ChatLayout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: ':chatId', element: <ChatPage /> },
    ],
  },
  {
    path: '/admin/organization',
    element: <OrganizationAdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/organization/general" replace /> },
      { path: 'general', element: <OrganizationGeneralSettingsPage /> },
      {
        path: 'members',
        element: (
          <StubPage
            title="Members"
            description="Everyone with access to this organization. Invite, promote, and remove."
            eta="Next up"
          />
        ),
      },
      {
        path: 'workspaces',
        element: (
          <StubPage
            title="Workspaces"
            description="Workspaces inside this organization. Create, archive, and configure."
            eta="Next up"
          />
        ),
      },
      { path: 'files', element: <OrganizationFilesPage /> },
      {
        path: 'token-usage',
        element: (
          <StubPage
            title="Token Usage"
            description="Spend across all workspaces in this organization."
            eta="Ships with usage tracking"
          />
        ),
      },
      {
        path: 'billing',
        element: (
          <StubPage
            title="Billing"
            description="Plan, invoices, and payment method."
            eta="Coming with v1.1"
          />
        ),
      },
    ],
  },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/workspace/general" replace /> },
      {
        path: 'workspace',
        children: [
          { index: true, element: <Navigate to="/admin/workspace/general" replace /> },
          { path: 'general', element: <GeneralSettingsPage /> },
          {
            path: 'ai-customization',
            element: (
              <StubPage
                title="AI Customization"
                description="Tone, system prompt, and allowed model list for this workspace."
                eta="Coming with v1.1"
              />
            ),
          },
          {
            path: 'users',
            element: (
              <StubPage
                title="Users"
                description="List, invite, and manage roles for members of this workspace."
                eta="Next up"
              />
            ),
          },
          {
            path: 'token-usage',
            element: (
              <StubPage
                title="Token Usage"
                description="Spend across AI requests in this workspace."
                eta="Ships with usage tracking"
              />
            ),
          },
          {
            path: 'integration',
            element: (
              <StubPage
                title="Integration"
                description="Connect SSO, Slack, and third-party document sources."
              />
            ),
          },
          {
            path: 'profile',
            element: (
              <StubPage title="Profile" description="Edit your personal account details." />
            ),
          },
          {
            path: 'preferences',
            element: (
              <StubPage
                title="Preferences"
                description="Keyboard shortcuts, theme, language."
              />
            ),
          },
          {
            path: 'notifications',
            element: (
              <StubPage title="Notifications" description="Email and in-app alert controls." />
            ),
          },
          {
            path: 'api-keys',
            element: (
              <StubPage
                title="API Keys"
                description="Personal access tokens for scripting against the Diguro API."
              />
            ),
          },
        ],
      },
    ],
  },
]);
