import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router-dom';
import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { AuthGate } from './AuthGate';
import { isExtensionDomError } from '@/components/ErrorBoundary';

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
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { OrganizationAdminLayout } from '@/features/admin/OrganizationAdminLayout';
import { OrganizationGeneralSettingsPage } from '@/features/admin/pages/OrganizationGeneralSettingsPage';
import { OrganizationFilesPage } from '@/features/admin/pages/OrganizationFilesPage';
import { OrganizationWorkspacesPage } from '@/features/admin/pages/OrganizationWorkspacesPage';
import { WorkspaceFilesPage } from '@/features/admin/pages/WorkspaceFilesPage';
import { TokenUsagePage } from '@/features/admin/pages/TokenUsagePage';
import { AuditLogPage } from '@/features/admin/pages/AuditLogPage';
import { MembersPage } from '@/features/admin/pages/MembersPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { GeneralSettingsPage } from '@/features/admin/pages/GeneralSettingsPage';
import { StubPage } from '@/features/admin/pages/StubPage';
import { PlatformAdminLayout } from '@/features/admin/PlatformAdminLayout';
import { PlatformDashboardPage } from '@/features/admin/pages/PlatformDashboardPage';
import { PlatformOrganizationsPage } from '@/features/admin/pages/PlatformOrganizationsPage';
import { PlatformOrganizationDetailPage } from '@/features/admin/pages/PlatformOrganizationDetailPage';
import { PlatformUsersPage } from '@/features/admin/pages/PlatformUsersPage';

/**
 * Role-aware landing for `/`. Superadmins go to the platform overview;
 * everyone else to the workspace picker. Mirrors the desktop's
 * RootRedirect — without this, `/` would always redirect to /workspaces,
 * the WorkspacePickerPage would itself bounce superadmin to /admin/platform,
 * and the catch-all `*` would 404 it back to /workspaces — infinite loop.
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

/**
 * Catch-all fallback. Same logic as RootRedirect — sending superadmins to
 * /workspaces would create a loop with WorkspacePickerPage's own redirect.
 */
function NotFoundRedirect() {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  if (me.isLoading) return null;
  if (me.data?.role === 'superadmin') {
    return <Navigate to="/admin/platform" replace />;
  }
  return <Navigate to="/workspaces" replace />;
}

/**
 * Route-level error fallback. Without this, errors thrown inside a route
 * component bubble into React Router's built-in error UI (a localized
 * "Hej utvecklare 👋…" page) before the outer ErrorBoundary in App.tsx
 * can see them. We mirror the boundary's logic here: ignore the
 * browser-extension DOM errors (forces a soft re-render via reload),
 * show a real fallback for anything else.
 */
function RouteErrorBoundary() {
  const error = useRouteError();
  const ignorable = error instanceof Error && isExtensionDomError(error);

  useEffect(() => {
    if (ignorable) {
      console.warn(
        '[RouteErrorBoundary] Ignored DOM manipulation error (likely browser extension):',
        (error as Error).message,
      );
      window.location.reload();
    }
  }, [ignorable, error]);

  if (ignorable) return null;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium text-zinc-800">Something went wrong</p>
      <p className="max-w-md text-sm text-zinc-500">
        Try refreshing the page. If this keeps happening, check if any browser
        extensions (translation tools, ad blockers, screen recorders) might be
        interfering.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Refresh
      </button>
    </div>
  );
}

/**
 * Web router — mirrors desktop's route set so the same pages render at the
 * same paths across both clients. Every route is gated by AuthGate; when
 * the user is not signed in, AuthGate shows the desktop SignIn inline
 * without navigating away. That keeps the current URL — critical for
 * invite flows (`/accept-invite/:token`) so post-sign-in the user lands
 * exactly where they clicked from.
 */
export const router = createBrowserRouter([
  // Public — must sit OUTSIDE AuthGate: a user resetting their password is
  // logged out by definition, so it can't be gated behind sign-in.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: (
      <AuthGate>
        <Outlet />
      </AuthGate>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/', element: <RootRedirect /> },

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
        path: '/admin/platform',
        element: <PlatformAdminLayout />,
        children: [
          { index: true, element: <PlatformDashboardPage /> },
          { path: 'organizations', element: <PlatformOrganizationsPage /> },
          {
            path: 'organizations/:id',
            element: <PlatformOrganizationDetailPage />,
          },
          { path: 'users', element: <PlatformUsersPage /> },
        ],
      },

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
          { path: 'workspaces', element: <OrganizationWorkspacesPage /> },
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
              { path: 'files', element: <WorkspaceFilesPage /> },
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

      { path: '*', element: <NotFoundRedirect /> },
    ],
  },
]);
