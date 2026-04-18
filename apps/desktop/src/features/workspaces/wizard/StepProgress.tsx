import { cn } from '@/lib/utils';

/**
 * 3-segment progress bar shown above the wizard title. Segments ahead of the
 * current step are zinc-200; current + completed are cyan-500. Matches the
 * Figma spec (each segment 112px, h-2, rounded-12, gap 10px).
 */
export function StepProgress({ current, total = 3 }: { current: 1 | 2 | 3; total?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium leading-5 text-[#404040]">
        Step {current} of {total}
      </p>
      <div className="flex items-center gap-2.5">
        {Array.from({ length: total }).map((_, idx) => {
          const n = idx + 1;
          const filled = n <= current;
          return (
            <div
              key={n}
              className={cn(
                'h-2 w-28 rounded-[12px] transition-colors',
                filled ? 'bg-cyan-500' : 'bg-zinc-200',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
