import { cn } from '@/lib/utils';

/** Segmented progress track in the onboarding header. `current` is 0-based;
 *  segments up to and including it are filled. */
export function SetupProgress({ total, current }: { total: number; current: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label="Setup progress"
      className="flex w-full gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            i <= current ? 'bg-blue-8' : 'bg-border',
          )}
        />
      ))}
    </div>
  );
}
