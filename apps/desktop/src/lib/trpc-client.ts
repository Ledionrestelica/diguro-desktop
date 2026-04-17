import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { authStore } from './auth-store.ts';
import { trpc } from './trpc.ts';

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

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
        fetch(url, options) {
          return fetch(url, { ...options, credentials: 'omit' });
        },
      }),
    ],
  });
}
