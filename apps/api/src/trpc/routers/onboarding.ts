import { z } from 'zod';
import { authedProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import { createOwnOrganization } from '../../services/onboarding/createOrganization.ts';
import { completeOnboarding } from '../../services/onboarding/complete.ts';

export const onboardingRouter = router({
  createOrganization: authedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOwnOrganization(
          { db: ctx.db },
          { userId: ctx.user.id, sessionId: ctx.session.id, name: input.name },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  complete: authedProcedure.mutation(async ({ ctx }) => {
    try {
      await completeOnboarding({ db: ctx.db }, { userId: ctx.user.id });
      return { ok: true as const };
    } catch (err) {
      throw mapDomainError(err);
    }
  }),
});
