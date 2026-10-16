import { useState } from 'react';
import { PiArrowRightStroke } from '@/components/icons/pika/PiArrowRightStroke';
import { cn } from '@/lib/utils';
import { OnboardingShell } from './OnboardingShell';

export type Plan = 'organization' | 'personal';

const OPTIONS: Array<{ plan: Plan; title: string; description: string; tile: string }> = [
  {
    plan: 'organization',
    title: 'Organization, Company',
    description: 'Answer questions from team documents.',
    tile: 'bg-[radial-gradient(120%_120%_at_50%_0%,#fff7c2_0%,#fdee9d_50%,#fbe577_100%)]',
  },
  {
    plan: 'personal',
    title: 'Personal',
    description: 'Just your own personal account.',
    tile: 'bg-[radial-gradient(125%_125%_at_50%_0%,#e6f6eb_0%,#bae2cb_50%,#8ecea9_100%)]',
  },
];

type PlanStepProps = {
  initial: Plan | null;
  onContinue: (plan: Plan) => void;
  onBack?: () => void;
};

export function PlanStep({ initial, onContinue, onBack }: PlanStepProps) {
  const [plan, setPlan] = useState<Plan | null>(initial);

  return (
    <OnboardingShell
      segment={1}
      title="How do you plan to use Iserana?"
      topOffset={163}
      narrowHeading
      {...(onBack ? { onBack } : {})}
      onContinue={() => plan && onContinue(plan)}
      continueDisabled={!plan}
    >
      <div role="radiogroup" aria-label="How you’ll use Iserana" className="flex flex-col gap-4">
        {OPTIONS.map((option) => {
          const selected = plan === option.plan;
          return (
            <button
              key={option.plan}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPlan(option.plan)}
              onDoubleClick={() => onContinue(option.plan)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3.5 rounded-[14px] border bg-bg-panel p-[9px] pr-[19px] text-left transition-[border-color,box-shadow] outline-none',
                selected
                  ? 'border-focus-ring shadow-[0_0_0_3px_var(--color-selection)]'
                  : 'border-border hover:border-border-hover focus-visible:border-focus-ring',
              )}
            >
              <span className={cn('size-[74px] shrink-0 rounded-[12px]', option.tile)} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-copy-16 font-medium text-text">{option.title}</span>
                <span className="text-copy-14 font-medium text-text-secondary">
                  {option.description}
                </span>
              </span>
              <PiArrowRightStroke size={16} className="shrink-0 text-text" />
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
