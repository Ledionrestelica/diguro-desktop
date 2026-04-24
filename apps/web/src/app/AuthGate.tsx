import { type ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { SignIn } from '@/features/auth/SignIn';
import { AuthContext } from './auth-context';

/**
 * Web-side AuthGate. Mirrors desktop's pattern exactly:
 *   - Unauthenticated → render SignIn inline (same component, same styles).
 *   - Authenticated → render children inside an AuthContext provider so
 *     anywhere in the tree can call `useAuth().signOut()`.
 *
 * The current URL is preserved through sign-in because we never navigate
 * away — SignIn swaps itself out for children as soon as the `health.me`
 * query flips from null to data. Invite flow: recipient clicks
 * `/accept-invite/:token`, AuthGate shows SignIn, they sign up with the
 * invited email, AuthGate re-renders, AcceptInvitePage takes over on the
 * same URL.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!me.data) {
    return (
      <SignIn
        onSignedIn={() => {
          void utils.health.me.invalidate();
        }}
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{
        signOut: () => {
          void apiAuth.signOut().then(() => {
            void utils.health.me.invalidate();
          });
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
