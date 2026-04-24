import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { AuthContext } from './auth-context';
import { apiAuth } from '@/lib/api-auth';

/**
 * Web-side AuthGate. Checks the session by calling `health.me` — if it
 * resolves, the user is authenticated (Better-Auth cookie is present).
 * If not, redirect to /sign-in with a returnTo so the user lands back
 * here after logging in.
 *
 * Public routes (/sign-in, /sign-up, /accept-invite/*) bypass the gate
 * so unauthenticated users can reach them.
 */
const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/accept-invite', '/home'];

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  const isPublic = PUBLIC_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );

  useEffect(() => {
    if (isPublic) return;
    if (me.isLoading) return;
    if (me.data) return;
    void navigate(
      `/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
      { replace: true },
    );
  }, [isPublic, me.isLoading, me.data, navigate, location.pathname, location.search]);

  if (!isPublic && me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  // On public routes we always render children; on private routes we've
  // either confirmed auth (me.data) or redirected above.
  return (
    <AuthContext.Provider
      value={{
        signOut: () => {
          void apiAuth.signOut().then(async () => {
            await utils.health.me.invalidate();
            void navigate('/sign-in', { replace: true });
          });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
