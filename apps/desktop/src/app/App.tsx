import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { createTrpcClient } from '@/lib/trpc-client';
import { AuthGate } from './AuthGate';
import { router } from './router';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export function App() {
  const [qc] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <ErrorBoundary>
          <AuthGate>
            <RouterProvider router={router} />
          </AuthGate>
        </ErrorBoundary>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
