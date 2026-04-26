import { Navigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';

/**
 * Returns `true` if the signed-in user is a `superadmin` and should be
 * bounced off the current (non-platform) route.
 *
 * Superadmins are platform-tier operators only. Anywhere outside of
 * `/admin/platform/*` they're redirected up to the platform overview.
 *
 * IMPORTANT — Rules of Hooks: call this hook at the top of a component
 * BUT only consume the result AFTER every other hook has been called.
 * Then return `<RedirectToPlatform />` when it's true:
 *
 *   const isSuperadmin = useIsSuperadminBlocked();
 *   const [foo, setFoo] = useState(...);
 *   const bar = useMemo(...);
 *   useEffect(...);
 *   ...
 *   if (isSuperadmin) return <RedirectToPlatform />;
 *
 * This keeps hook order stable across renders (loading → loaded) so React
 * doesn't warn about hook count changing.
 */
export function useIsSuperadminBlocked(): boolean {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  return me.data?.role === 'superadmin';
}

export function RedirectToPlatform() {
  return <Navigate to="/admin/platform" replace />;
}

/** Inverse: bounce non-superadmins away from a platform-only surface. */
export function useIsNonSuperadminBlocked(): boolean {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  return me.data != null && me.data.role !== 'superadmin';
}

export function RedirectToChat() {
  return <Navigate to="/chat" replace />;
}
