import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AuthGate } from './AuthGate';

// Shared features from desktop — imported via the `@` alias fallthrough in
// vite.config.ts. Internal `@/lib/*` imports inside these files resolve
// to web shims (cookie auth, cookie tRPC, cookie streaming transport) via
// the higher-priority alias overrides.
import { ChatLayout } from '@/features/chat/ChatLayout';
import { ChatPage } from '@/features/chat/ChatPage';
import { WorkspacePickerPage } from '@/features/workspaces/WorkspacePickerPage';
import { NewWorkspaceWizardPage } from '@/features/workspaces/NewWorkspaceWizardPage';
import { PersonalFilesPage } from '@/features/files/PersonalFilesPage';
import { AcceptInvitePage } from '@/features/invitations/AcceptInvitePage';
import { OrganizationAdminLayout } from '@/features/admin/OrganizationAdminLayout';
import { OrganizationGeneralSettingsPage } from '@/features/admin/pages/OrganizationGeneralSettingsPage';
import { OrganizationFilesPage } from '@/features/admin/pages/OrganizationFilesPage';
import { TokenUsagePage } from '@/features/admin/pages/TokenUsagePage';
import { AuditLogPage } from '@/features/admin/pages/AuditLogPage';
import { MembersPage } from '@/features/admin/pages/MembersPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { GeneralSettingsPage } from '@/features/admin/pages/GeneralSettingsPage';
import { StubPage } from '@/features/admin/pages/StubPage';

/**
 * Web router — mirrors desktop's route set so the same pages render at the
 * same paths across both clients. Every route is gated by AuthGate; when
 * the user is not signed in, AuthGate shows the desktop SignIn inline
 * without navigating away. That keeps the current URL — critical for
 * invite flows (`/accept-invite/:token`) so post-sign-in the user lands
 * exactly where they clicked from.
 */
export const router = createBrowserRouter([
  {
    element: (
      <AuthGate>
        <Outlet />
      </AuthGate>
    ),
    children: [
      { path: '/', element: <Navigate to="/workspaces" replace /> },

      { path: '/accept-invite/:token', element: <AcceptInvitePage /> },

      { path: '/workspaces', element: <WorkspacePickerPage /> },
      { path: '/workspaces/new', element: <NewWorkspaceWizardPage /> },

      {
        path: '/chat',
        element: <ChatLayout />,
        children: [
          { index: true, element: <ChatPage /> },
          { path: ':chatId', element: <ChatPage /> },
        ],
      },

      { path: '/my-files', element: <PersonalFilesPage /> },

      {
        path: '/admin/organization',
        element: <OrganizationAdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/admin/organization/general" replace />,
          },
          { path: 'general', element: <OrganizationGeneralSettingsPage /> },
          { path: 'members', element: <MembersPage /> },
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
          { path: 'token-usage', element: <TokenUsagePage /> },
          { path: 'audit-log', element: <AuditLogPage /> },
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
          {
            index: true,
            element: <Navigate to="/admin/workspace/general" replace />,
          },
          {
            path: 'workspace',
            children: [
              {
                index: true,
                element: <Navigate to="/admin/workspace/general" replace />,
              },
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
                path: 'profile',
                element: (
                  <StubPage
                    title="Profile"
                    description="Edit your personal account details."
                  />
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
            ],
          },
        ],
      },

      { path: '*', element: <Navigate to="/workspaces" replace /> },
    ],
  },
]);
