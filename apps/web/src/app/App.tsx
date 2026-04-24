import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { createTrpcClient } from '@/lib/trpc-client';
import { router } from './router';

/**
 * Web-companion shell. Mirrors the desktop App.tsx — QueryClient + tRPC
 * provider + router — but uses cookie-based auth. Routing (AuthGate)
 * happens inside each route tree rather than wrapping the RouterProvider,
 * because some routes (sign-in, accept-invite) are intentionally public.
 */
export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
