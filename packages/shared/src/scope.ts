import { z } from 'zod';
import { OrgId, UserId } from './ids.ts';

export const OrgScope = z.object({
  kind: z.literal('org'),
  organizationId: OrgId,
});
export type OrgScope = z.infer<typeof OrgScope>;

export const UserScope = z.object({
  kind: z.literal('user'),
  userId: UserId,
});
export type UserScope = z.infer<typeof UserScope>;

export const Scope = z.discriminatedUnion('kind', [OrgScope, UserScope]);
export type Scope = z.infer<typeof Scope>;

export const isOrgScope = (s: Scope): s is OrgScope => s.kind === 'org';
export const isUserScope = (s: Scope): s is UserScope => s.kind === 'user';
