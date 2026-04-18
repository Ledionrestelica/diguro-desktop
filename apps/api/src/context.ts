import type { Db } from '@diguro/db';
import type { Auth } from './auth/config.ts';
import type { Config } from './config.ts';
import type { Logger } from './lib/logger.ts';
import type { ObjectStore } from './ports/objectStore.ts';
import type { Queue } from './ports/queue.ts';

/**
 * Dependencies that are constant across requests. Constructed once at boot
 * in index.ts and passed into the tRPC context builder per-request.
 */
export interface AppDeps {
  readonly db: Db;
  readonly auth: Auth;
  readonly config: Config;
  readonly logger: Logger;
  readonly objectStore: ObjectStore;
  readonly queue: Queue;
}

/**
 * Per-request tRPC context. Populated by auth middleware layers that add
 * { user, session, organization, workspace, member } progressively.
 */
export type SystemRole = 'superadmin' | 'organization_admin' | 'user';

export interface Ctx extends AppDeps {
  readonly req: Request;
  readonly user?: {
    id: string;
    email: string;
    role: SystemRole;
    /** null for superadmins who aren't bound to an organization, and for
     *  fresh signups not yet assigned to one. */
    organizationId: string | null;
  };
  readonly session?: {
    id: string;
    token: string;
  };
}

export async function buildCtx(deps: AppDeps, req: Request): Promise<Ctx> {
  const session = await deps.auth.api
    .getSession({ headers: req.headers })
    .catch(() => null);

  if (!session) return { ...deps, req };

  const rawRole = (session.user as { role?: string }).role;
  const role: SystemRole =
    rawRole === 'superadmin' || rawRole === 'organization_admin' ? rawRole : 'user';
  const organizationId =
    (session.user as { organizationId?: string | null }).organizationId ?? null;

  return {
    ...deps,
    req,
    user: {
      id: session.user.id,
      email: session.user.email,
      role,
      organizationId,
    },
    session: {
      id: session.session.id,
      token: session.session.token,
    },
  };
}
