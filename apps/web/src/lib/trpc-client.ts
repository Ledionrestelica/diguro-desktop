import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './trpc';

/**
 * Web-side tRPC client. Matches the desktop factory signature
 * (`createTrpcClient()`) so the shared App.tsx shell can use either via
 * the alias override in vite.config. Swaps bearer tokens for cookie
 * sessions via `credentials: 'include'`.
 *
 * 401s are intentionally NOT handled here. The AuthGate at the router
 * root watches `trpc.health.me` — when that query returns 401 (no session
 * or session expired), AuthGate renders SignIn inline without changing
 * the URL. Individual tRPC calls that 401 propagate the error to their
 * caller's query state; the next `me` refetch catches the session loss.
 * Previously this hook did `window.location.assign('/sign-in?…')`, which
 * fought with AuthGate and left the URL stuck on a path that no longer
 * exists.
 */
export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        // Relative URL so every call goes out to same-origin and gets
        // forwarded by Vite's dev proxy (or edge rewrite in prod). No
        // VITE_API_URL override can flip this off-origin.
        url: '/trpc',
        transformer: superjson,
        fetch(url, options) {
          const merged: RequestInit = {
            ...(options as RequestInit),
            credentials: 'include',
          };
          return fetch(url, merged);
        },
      }),
    ],
  });
}
