import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '../trpc.ts';
import { mapDomainError } from '../error-mapper.ts';
import {
  acceptOrgInvitation,
  getOrgInvitationByToken,
} from '../../services/organizations/invitations.ts';

/**
 * Public + authed endpoints for the invitation accept flow. Admin-only
 * CRUD (create / list / revoke) lives on `adminOrganization` — that
 * router already has org scope baked in.
 */
export const invitationsRouter = router({
  // Public: used by the accept landing page to show "You're invited to
  // <Org>". Returns minimal info (email + org name) — nothing sensitive.
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(10).max(200) }))
    .query(async ({ ctx, input }) => {
      try {
        return await getOrgInvitationByToken({ db: ctx.db }, { token: input.token });
      } catch (err) {
        throw mapDomainError(err);
      }
    }),

  // Authed: user must already have an account + session; we don't handle
  // sign-up here. The accept page routes new users through /sign-up first.
  accept: authedProcedure
    .input(z.object({ token: z.string().min(10).max(200) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await acceptOrgInvitation(
          { db: ctx.db, logger: ctx.logger },
          { token: input.token, actingUserId: ctx.user.id },
        );
      } catch (err) {
        throw mapDomainError(err);
      }
    }),
});
