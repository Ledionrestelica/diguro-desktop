import { z } from 'zod';
import { WorkspaceId, UserId } from './ids.ts';

/**
 * Scope = who does this resource belong to? Workspace-scoped (visible to
 * all members of a workspace) or user-scoped (personal to one user).
 */
export const WorkspaceScope = z.object({
  kind: z.literal('workspace'),
  workspaceId: WorkspaceId,
});
export type WorkspaceScope = z.infer<typeof WorkspaceScope>;

export const UserScope = z.object({
  kind: z.literal('user'),
  userId: UserId,
});
export type UserScope = z.infer<typeof UserScope>;

export const Scope = z.discriminatedUnion('kind', [WorkspaceScope, UserScope]);
export type Scope = z.infer<typeof Scope>;

export const isWorkspaceScope = (s: Scope): s is WorkspaceScope =>
  s.kind === 'workspace';
export const isUserScope = (s: Scope): s is UserScope => s.kind === 'user';
