import type { FormEvent, ReactNode } from 'react';
import { IseranaWordmark } from '@/components/brand/IseranaWordmark';
import { ActionButton } from '@/components/ui/action-button';
import { PiArrowLeftStroke } from '@/components/icons/pika/PiArrowLeftStroke';
import { SetupProgress } from './SetupProgress';

/**
 * Frame shared by every onboarding step: wordmark + progress in the header,
 * a 446px content column centred in the page, Back / Continue in the footer.
 * The whole page is one form so Enter submits the step.
 */

export const ONBOARDING_SEGMENTS = 5;

type OnboardingShellProps = {
  segment: number;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  loading?: boolean;
  error?: string | null;
};

export function OnboardingShell({
  segment,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  loading = false,
  error,
}: OnboardingShellProps) {
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!continueDisabled && !loading) onContinue();
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex min-h-screen flex-col bg-bg-panel font-inter text-text antialiased"
    >
      <header className="relative flex h-16 shrink-0 items-center border-b border-border px-4 sm:px-[47px]">
        <IseranaWordmark className="h-[18px] w-auto" />
        <div className="absolute top-8 left-1/2 hidden w-[446px] max-w-[calc(100%-320px)] -translate-x-1/2 sm:block">
          <SetupProgress total={ONBOARDING_SEGMENTS} current={segment} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-[446px] flex-col gap-8 sm:-translate-y-[25px]">
          <div className="flex max-w-[391px] flex-col gap-3">
            <h1 className="text-heading-32 font-medium text-text">{title}</h1>
            {subtitle && (
              <div className="text-copy-18 font-medium text-text-secondary [&_*]:font-medium">
                {subtitle}
              </div>
            )}
          </div>
          {children}
          {error && (
            <p role="alert" className="text-label-14 text-danger-text">
              {error}
            </p>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 items-center justify-between px-4 pt-4 pb-[26px] sm:px-11">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 cursor-pointer items-center gap-2 rounded-[8px] text-button-14 text-text outline-none hover:opacity-70 focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
          >
            <PiArrowLeftStroke size={16} />
            Back
          </button>
        ) : (
          <span />
        )}
        <ActionButton type="submit" loading={loading} disabled={continueDisabled}>
          {continueLabel}
        </ActionButton>
      </footer>
    </form>
  );
}
