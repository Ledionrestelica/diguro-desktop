import { useState } from 'react';
import { SignInOptions } from './SignInOptions';
import { EmailSignIn } from './EmailSignIn';
import { ForgotPassword } from './ForgotPassword';
import { SignUpStep } from './SignUpStep';
import { VerifyEmailStep } from './VerifyEmailStep';

/**
 * Everything a signed-out user sees. Kept as local state rather than routes
 * so the URL the user arrived on (e.g. an invite link) survives sign-in on
 * web, and so desktop's hash router never has to know about auth.
 */

type View =
  | { name: 'options' }
  | { name: 'email' }
  | { name: 'forgot' }
  | { name: 'sign-up' }
  | { name: 'verify'; email: string; from: 'sign-up' | 'email' };

export function AuthFlow({ onSignedIn }: { onSignedIn: () => void }) {
  const [view, setView] = useState<View>({ name: 'options' });

  switch (view.name) {
    case 'options':
      return (
        <SignInOptions
          onEmail={() => setView({ name: 'email' })}
          onSignUp={() => setView({ name: 'sign-up' })}
          onResetPassword={() => setView({ name: 'forgot' })}
        />
      );
    case 'email':
      return (
        <EmailSignIn
          onBack={() => setView({ name: 'options' })}
          onSignedIn={onSignedIn}
          onNeedsVerification={(email) => setView({ name: 'verify', email, from: 'email' })}
          onForgot={() => setView({ name: 'forgot' })}
        />
      );
    case 'forgot':
      return <ForgotPassword onBack={() => setView({ name: 'options' })} />;
    case 'sign-up':
      return (
        <SignUpStep
          onBack={() => setView({ name: 'options' })}
          onCreated={(email) => setView({ name: 'verify', email, from: 'sign-up' })}
        />
      );
    case 'verify':
      return (
        <VerifyEmailStep
          email={view.email}
          onBack={() => setView(view.from === 'email' ? { name: 'email' } : { name: 'sign-up' })}
          onVerified={onSignedIn}
        />
      );
  }
}
