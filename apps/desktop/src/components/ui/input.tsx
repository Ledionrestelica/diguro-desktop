import * as React from 'react';

import { cn } from '@/lib/utils';

/** Bare text input in the design-system field style (Figma "Input", medium,
 *  without title). Use TextField when the input needs a label or hint. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-[10px] border border-border-default bg-bg-panel px-3 text-copy-14 text-text transition-[border-color,box-shadow] outline-none placeholder:text-text-placeholder file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'hover:border-border-hover',
        'aria-invalid:border-danger aria-invalid:shadow-[0_0_0_3px_var(--color-danger-subtle)]',
        'disabled:cursor-not-allowed disabled:border-border-default disabled:bg-bg-subtle disabled:text-gray-8',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
