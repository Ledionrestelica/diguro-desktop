import type { ReactNode } from 'react';
import googleLogo from '@/assets/brand/google-logo.svg';
import { MicrosoftLogo } from '@/components/brand/MicrosoftLogo';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { PiArrowRightUpStroke } from '@/components/icons/pika/PiArrowRightUpStroke';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AuthCenteredLayout, AuthLink } from './AuthCenteredLayout';

type SignInOptionsProps = {
  onEmail: () => void;
  onSignUp: () => void;
  onResetPassword: () => void;
};

export function SignInOptions({ onEmail, onSignUp, onResetPassword }: SignInOptionsProps) {
  return (
    <AuthCenteredLayout
      title="Sign in to your account."
      footer={
        <>
          <p>
            Don’t have an account? <AuthLink onClick={onSignUp}>Sign up here.</AuthLink>
          </p>
          <p>
            Trouble signing in? <AuthLink onClick={onResetPassword}>Reset password.</AuthLink>
          </p>
        </>
      }
    >
      <ComingSoon>
        <ProviderButton>
          <span className="flex size-6 items-center justify-center">
            <img src={googleLogo} alt="" width={16} height={16} />
          </span>
          Continue with Google
        </ProviderButton>
      </ComingSoon>
      <ComingSoon>
        <ProviderButton>
          <MicrosoftLogo className="size-6" />
          Continue with Microsoft
        </ProviderButton>
      </ComingSoon>
      <ProviderButton onClick={onEmail}>
        <PiEnvelopeDefaultStroke size={16} />
        Continue with Email
      </ProviderButton>
      <ComingSoon>
        <ProviderButton>
          Continue with SSO
          <PiArrowRightUpStroke size={16} />
        </ProviderButton>
      </ComingSoon>
    </AuthCenteredLayout>
  );
}

function ProviderButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const soon = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={soon || undefined}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] border border-border-input bg-bg-panel px-2.5 text-button-14 text-text transition-colors outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]',
        soon ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-hover',
      )}
    >
      {children}
    </button>
  );
}

function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">Coming soon</TooltipContent>
    </Tooltip>
  );
}
