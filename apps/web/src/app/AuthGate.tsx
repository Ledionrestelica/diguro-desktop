import { useState, type ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { SignIn } from '@/features/auth/SignIn';
import { AuthContext } from './auth-context';

/**
 * Web-side AuthGate. Mirrors desktop's pattern:
 *   - Unauthenticated → render SignIn inline (same component, same styles).
 *   - Authenticated → render children inside an AuthContext provider so
 *     anywhere in the tree can call `useAuth().signOut()`.
 *
 * Sign-out is driven by an explicit local `signedOut` flag rather than by a
 * `health.me` refetch: clearing the cookie and invalidating left the gate
 * stuck on the loading branch while the errored refetch settled. The flag
 * flips us to SignIn synchronously; the stale `me` cache is cleared in the
 * background so a fresh sign-in re-fetches cleanly.
 *
 * The current URL is preserved through sign-in because we never navigate
 * away — SignIn swaps itself out for children as soon as `health.me` has data.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [signedOut, setSignedOut] = useState(false);
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  if (!signedOut && me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (signedOut || !me.data) {
    return (
      <SignIn
        onSignedIn={() => {
          setSignedOut(false);
          void utils.health.me.invalidate();
        }}
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{
        signOut: () => {
          setSignedOut(true);
          void apiAuth.signOut().finally(() => {
            void utils.health.me.reset();
          });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
