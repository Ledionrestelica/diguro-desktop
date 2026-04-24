import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AuthGate } from './AuthGate';

// Web-owned pages (public + cookie-auth specific)
import { SignInPage } from '@/pages/SignInPage';
import { SignUpPage } from '@/pages/SignUpPage';
import { HomePage } from '@/pages/HomePage';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';

// Shared features — imported from desktop's src via vite alias fallthrough.
// Each file's internal `@/lib/*` imports resolve to WEB's shims thanks to
// the higher-priority alias overrides in vite.config.
import { ChatLayout } from '@/features/chat/ChatLayout';
import { ChatPage } from '@/features/chat/ChatPage';
import { WorkspacePickerPage } from '@/features/workspaces/WorkspacePickerPage';
import { NewWorkspaceWizardPage } from '@/features/workspaces/NewWorkspaceWizardPage';
import { PersonalFilesPage } from '@/features/files/PersonalFilesPage';
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
 * Browser router so invite emails link to clean HTTPS paths. AuthGate
 * is injected at the root so every route gets session gating + the
 * AuthContext provider; AuthGate itself decides which paths are public
 * (`/sign-in`, `/sign-up`, `/accept-invite/*`, `/home`).
 */
function RootLayout() {
  return (
    <AuthGate>
      <Outlet />
    </AuthGate>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/workspaces" replace /> },
      { path: '/home', element: <HomePage /> },
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/accept-invite/:token', element: <AcceptInvitePage /> },

      // Workspace picker + wizard — same pages as desktop.
      { path: '/workspaces', element: <WorkspacePickerPage /> },
      { path: '/workspaces/new', element: <NewWorkspaceWizardPage /> },

      // Chat — imported from desktop, auth/transport shimmed to cookies.
      {
        path: '/chat',
        element: <ChatLayout />,
        children: [
          { index: true, element: <ChatPage /> },
          { path: ':chatId', element: <ChatPage /> },
        ],
      },

      // Personal files.
      { path: '/my-files', element: <PersonalFilesPage /> },

      // Organization admin.
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

      // Workspace admin.
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

      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
]);
