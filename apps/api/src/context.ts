import type { Db } from '@diguro/db';
import type { Auth } from './auth/config.ts';
import type { Config } from './config.ts';
import type { Logger } from './lib/logger.ts';
import type { ObjectStore } from './ports/objectStore.ts';

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
}

/**
 * Per-request tRPC context. Populated by auth middleware layers that add
 * { user, session, scope, org, member } progressively.
 */
export interface Ctx extends AppDeps {
  readonly req: Request;
  readonly user?: {
    id: string;
    email: string;
    role: string;
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

  return {
    ...deps,
    req,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: (session.user as { role?: string }).role ?? 'user',
    },
    session: {
      id: session.session.id,
      token: session.session.token,
    },
  };
}
