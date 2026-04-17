import { router } from './trpc.ts';
import { healthRouter } from './routers/health.ts';
import { conversationsRouter } from './routers/conversations.ts';

export const appRouter = router({
  health: healthRouter,
  conversations: conversationsRouter,
});

export type AppRouter = typeof appRouter;
