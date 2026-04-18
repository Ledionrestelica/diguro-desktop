import { eventType, Inngest } from 'inngest';
import { z } from 'zod';

/**
 * Typed Inngest client. Event definitions live here so every emitter and
 * handler shares the same contract. Adding a new event = declare it with
 * `eventType()` + a Zod schema; Inngest validates the data through the
 * StandardSchema protocol at send time.
 */

export const RESOURCE_UPLOADED = eventType('resource.uploaded', {
  schema: z.object({
    versionId: z.string().min(1),
    resourceId: z.string().min(1),
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('organization'), organizationId: z.string().min(1) }),
      z.object({ kind: z.literal('workspace'), workspaceId: z.string().min(1) }),
      z.object({ kind: z.literal('user'), userId: z.string().min(1) }),
    ]),
  }),
});

export const INNGEST_APP_ID = 'diguro-api';

export function createInngestClient(opts: {
  eventKey?: string | undefined;
  signingKey?: string | undefined;
  isDev: boolean;
}): Inngest {
  return new Inngest({
    id: INNGEST_APP_ID,
    isDev: opts.isDev,
    ...(opts.eventKey ? { eventKey: opts.eventKey } : {}),
    ...(opts.signingKey ? { signingKey: opts.signingKey } : {}),
  });
}

export type InngestClient = ReturnType<typeof createInngestClient>;
