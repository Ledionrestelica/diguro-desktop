import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Height-animated disclosure: animates grid rows 0fr ↔ 1fr so content of
 *  any height opens smoothly without measuring it. */
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={!open || undefined}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
