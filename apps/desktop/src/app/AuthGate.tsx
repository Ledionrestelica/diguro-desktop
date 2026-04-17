import { useEffect, useState, type ReactNode } from 'react';
import { authStore } from '@/lib/auth-store';
import { SignIn } from '@/features/auth/SignIn';

/**
 * Gates the entire router behind a bearer token check. Renders SignIn when
 * no token is present. Re-renders the tree on sign-in/out by updating state.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    authStore.get().then((t) => setAuthed(Boolean(t)));
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!authed) {
    return <SignIn onSignedIn={() => setAuthed(true)} />;
  }

  return (
    <AuthContext.Provider value={{ signOut: () => setAuthed(false) }}>
      {children}
    </AuthContext.Provider>
  );
}

import { createContext, useContext } from 'react';

interface AuthContextValue {
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthGate>');
  return ctx;
}
