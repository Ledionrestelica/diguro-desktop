import type { FormEvent, ReactNode } from 'react';
import { IseranaWordmark } from '@/components/brand/IseranaWordmark';
import { ActionButton } from '@/components/ui/action-button';
import { PiArrowLeftStroke } from '@/components/icons/pika/PiArrowLeftStroke';
import { cn } from '@/lib/utils';
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
  /** Pin the content this far below the header (px at 1440×1024) instead of
   *  centring it. Steps 1–2 are centred; the later frames are top-aligned. */
  topOffset?: number;
  /** Wrap the title at 391px like the sign-up frames. */
  narrowHeading?: boolean;
  /** Shown above the title (e.g. the success check on "All set"). */
  badge?: ReactNode;
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
  topOffset,
  narrowHeading = topOffset === undefined,
  badge,
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

      <main
        className={cn(
          'flex flex-1 justify-center px-4',
          topOffset === undefined ? 'items-center py-12' : 'items-start pb-12',
        )}
        style={topOffset === undefined ? undefined : { paddingTop: `min(${topOffset}px, 16vh)` }}
      >
        <div
          className={cn(
            'flex w-full max-w-[446px] flex-col gap-8',
            topOffset === undefined && 'sm:-translate-y-[25px]',
          )}
        >
          {badge}
          <div className={cn('flex flex-col gap-3', narrowHeading && 'max-w-[391px]')}>
            <h1 className="text-heading-32 font-medium text-text">{title}</h1>
            {subtitle && (
              <div
                className={cn(
                  'text-text-secondary',
                  topOffset === undefined
                    ? 'text-copy-18 font-medium [&_*]:font-medium'
                    : 'text-copy-16',
                )}
              >
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
