import { useEffect, useState, type ReactNode } from 'react';
import { authStore } from '@/lib/auth-store';
import { AuthFlow } from '@/features/auth/AuthFlow';
import { OnboardingGate } from '@/features/onboarding/OnboardingGate';
import { AuthContext } from './auth-context';

/**
 * Gates the entire router behind a bearer token check. Renders the sign-in flow when
 * no token is present. Re-renders the tree on sign-in/out by updating state.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    void authStore.get().then((t) => setAuthed(Boolean(t)));
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!authed) {
    return <AuthFlow onSignedIn={() => setAuthed(true)} />;
  }

  return (
    <AuthContext.Provider value={{ signOut: () => setAuthed(false) }}>
      {/* The hash router mounts after onboarding and reads the path from the URL. */}
      <OnboardingGate openApp={(path) => (window.location.hash = `#${path}`)}>
        {children}
      </OnboardingGate>
    </AuthContext.Provider>
  );
}
