import { authedProcedure, publicProcedure, router } from '../trpc.ts';

export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true,
    time: new Date().toISOString(),
  })),

  me: authedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
    sessionId: ctx.session.id,
  })),
});
