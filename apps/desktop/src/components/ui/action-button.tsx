import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Design-system button for redesigned (Inter) screens. Primary = solid
 * gray-12; secondary = white with input border. 40px tall, Button/14 type.
 */

type Variant = 'primary' | 'secondary';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-text-on-solid hover:bg-primary/90 disabled:bg-primary-disabled disabled:text-text-placeholder',
  secondary:
    'border border-border-input bg-bg-panel text-text hover:bg-hover disabled:text-text-placeholder',
};

type ActionButtonProps = ComponentProps<'button'> & {
  variant?: Variant;
  loading?: boolean;
};

export function ActionButton({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-5 text-button-14 whitespace-nowrap transition-colors outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)] disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
