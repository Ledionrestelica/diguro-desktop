import { router } from './trpc.ts';
import { healthRouter } from './routers/health.ts';
import { conversationsRouter } from './routers/conversations.ts';
import { chatAttachmentsRouter } from './routers/chatAttachments.ts';
import { adminPlatformRouter } from './routers/adminPlatform.ts';
import { adminOrganizationRouter } from './routers/adminOrganization.ts';
import { adminWorkspaceRouter } from './routers/adminWorkspace.ts';
import { workspacesRouter } from './routers/workspaces.ts';
import { invitationsRouter } from './routers/invitations.ts';
import { meRouter } from './routers/me.ts';

export const appRouter = router({
  health: healthRouter,
  conversations: conversationsRouter,
  chatAttachments: chatAttachmentsRouter,
  workspaces: workspacesRouter,
  invitations: invitationsRouter,
  me: meRouter,
  adminPlatform: adminPlatformRouter,
  adminOrganization: adminOrganizationRouter,
  adminWorkspace: adminWorkspaceRouter,
});

export type AppRouter = typeof appRouter;
