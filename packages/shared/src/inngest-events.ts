import { z } from 'zod';
import { OrgId, ResourceVersionId, UserId } from './ids.ts';

/**
 * Typed Inngest event payloads. Every handler validates on entry.
 * The event name is the map key; the payload lives under `.data`.
 */
export const InngestEvents = {
  'resource.uploaded': z.object({
    data: z.object({
      resourceVersionId: ResourceVersionId,
    }),
  }),

  'resource.ready': z.object({
    data: z.object({
      resourceVersionId: ResourceVersionId,
    }),
  }),

  'recon.run': z.object({
    data: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('org'), organizationId: OrgId }),
      z.object({ kind: z.literal('user'), userId: UserId }),
    ]),
  }),

  'retention.sweep': z.object({
    data: z.object({
      olderThanDays: z.number().int().positive().default(30),
    }),
  }),
} as const;

export type InngestEventName = keyof typeof InngestEvents;
export type InngestEventData<N extends InngestEventName> = z.infer<(typeof InngestEvents)[N]>;
