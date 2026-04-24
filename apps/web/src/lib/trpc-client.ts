import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './trpc';
import { API_URL } from './api';

/**
 * Web-side tRPC client. Matches the desktop factory signature
 * (`createTrpcClient()`) so the shared App.tsx shell can use either via
 * the alias override in vite.config. Swaps bearer tokens for cookie
 * sessions via `credentials: 'include'`, and reloads on 401 so the user
 * ends up back on /sign-in rather than stuck on a page that can't load.
 */
export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        async fetch(url, options) {
          const merged: RequestInit = {
            ...(options as RequestInit),
            credentials: 'include',
          };
          const res = await fetch(url, merged);
          if (res.status === 401 && !window.location.pathname.startsWith('/sign-in')) {
            // Auth missing / expired; Better-Auth returns 401 on protected
            // procedures. Bounce to sign-in rather than leaving the user on
            // a shell that keeps erroring. Small delay so React can flush
            // the current render before the navigation.
            setTimeout(() => {
              window.location.assign(
                `/sign-in?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
              );
            }, 50);
          }
          return res;
        },
      }),
    ],
  });
}
