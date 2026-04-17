import { router } from './trpc.ts';
import { healthRouter } from './routers/health.ts';
import { conversationsRouter } from './routers/conversations.ts';
import { chatAttachmentsRouter } from './routers/chatAttachments.ts';

export const appRouter = router({
  health: healthRouter,
  conversations: conversationsRouter,
  chatAttachments: chatAttachmentsRouter,
});

export type AppRouter = typeof appRouter;
