import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import type { Ctx } from '../context.ts';
import { mapDomainError } from './error-mapper.ts';
import { Unauthorized } from '@diguro/shared/errors';

const t = initTRPC.context<Ctx>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const mapped = error.cause ? mapDomainError(error.cause) : error;
    return {
      ...shape,
      data: {
        ...shape.data,
        code: mapped.code,
      },
    };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;

/**
 * Base procedure — unauthenticated. Use only for sign-in / sign-up.
 */
export const publicProcedure = t.procedure;

/**
 * Authed procedure — requires a valid session. Every non-public procedure
 * should use this or something that composes from it.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw mapDomainError(new Unauthorized());
  }
  return next({ ctx: { ...ctx, user: ctx.user, session: ctx.session } });
});
