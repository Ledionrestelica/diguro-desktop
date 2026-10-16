import type { ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { OnboardingFlow } from './OnboardingFlow';

/**
 * Sits inside the auth gate on desktop and web. Signed-in users who haven't
 * finished onboarding get the onboarding flow instead of the app. Exempt:
 * superadmins, and anyone on an invite link — accepting the invite places
 * them in an organization and marks onboarding done.
 */
export function OnboardingGate({
  children,
  openApp,
}: {
  children: ReactNode;
  /** Point the app at its first screen once onboarding is done. */
  openApp: (path: string) => void;
}) {
  const me = trpc.health.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const data = me.data;
  if (!data || data.onboardingCompletedAt || data.role === 'superadmin' || onInviteLink()) {
    return <>{children}</>;
  }

  return (
    <OnboardingFlow
      me={{ name: data.name, organization: data.organization }}
      onFinished={(plan) => {
        openApp(plan === 'personal' ? '/my-files' : '/chat');
        void utils.health.me.invalidate();
      }}
    />
  );
}

function onInviteLink(): boolean {
  const { pathname, hash } = window.location;
  return pathname.startsWith('/accept-invite/') || hash.startsWith('#/accept-invite/');
}
