import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Height-animated disclosure: animates grid rows 0fr ↔ 1fr so content of
 *  any height opens smoothly without measuring it. Closed content stays
 *  mounted for the animation, so it is made inert (no focus, no hover). */
export function Collapsible({
  open,
  fast = false,
  children,
}: {
  open: boolean;
  /** 200ms on the shared ease-out (the sidebar) instead of the trace's 300ms. */
  fast?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.inert = !open;
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn(
        'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
        fast
          ? 'duration-200 ease-(--motion-ease-out)'
          : 'duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={!open || undefined}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
