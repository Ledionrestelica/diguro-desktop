import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { authStore } from './auth-store.ts';
import { trpc } from './trpc.ts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        async headers() {
          const token = await authStore.get();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        async fetch(url, options) {
          const merged: RequestInit = {
            ...(options as RequestInit),
            credentials: 'omit',
          };
          const res = await fetch(url, merged);
          // If the server rejects our bearer (token revoked, user deleted, DB
          // reset in dev), the token is useless — clear it and reload so
          // AuthGate drops the user back to the sign-in screen instead of
          // trapping them on a page that can't load data.
          if (res.status === 401) {
            const hadToken = Boolean(await authStore.get());
            if (hadToken) {
              authStore.clear();
              // Small timeout so React has a chance to render once before
              // the reload nukes the tree (avoids flashing an error state).
              setTimeout(() => {
                window.location.reload();
              }, 50);
            }
          }
          return res;
        },
      }),
    ],
  });
}
