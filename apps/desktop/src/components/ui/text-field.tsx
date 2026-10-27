import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Design-system text input (Figma "Input" component on the Input page).
 * Optional label and description above, optional icons inside, hint or
 * error text below. Sizes: sm 32 · md 36 · lg 44.
 */

type Size = 'sm' | 'md' | 'lg';

const controlSize: Record<Size, string> = {
  sm: 'h-8 rounded-[10px] px-2.5 text-copy-14',
  md: 'h-9 rounded-[10px] px-3 text-copy-14',
  lg: 'h-11 rounded-[12px] px-3.5 text-copy-16',
};

type TextFieldProps = Omit<ComponentProps<'input'>, 'size'> & {
  label: string;
  /** Keep the label for screen readers only (Figma "Without title"). */
  hideLabel?: boolean;
  /** Second line under the label (Figma "With title and description"). */
  description?: ReactNode;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  controlClassName?: string;
  inputClassName?: string;
};

export function TextField({
  label,
  hideLabel = false,
  description,
  size = 'md',
  icon,
  trailing,
  helper,
  error,
  className,
  controlClassName,
  inputClassName,
  id,
  disabled,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error || helper ? `${inputId}-hint` : undefined;
  const iconSize = size === 'lg' ? '[&_svg]:size-5' : '[&_svg]:size-4';

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <div className={cn('flex flex-col gap-0.5', hideLabel && 'sr-only')}>
        <label
          htmlFor={inputId}
          className={cn('text-label-14 font-medium', disabled ? 'text-gray-8' : 'text-text')}
        >
          {label}
        </label>
        {description && (
          <p className={cn('text-label-13', disabled ? 'text-gray-8' : 'text-text-secondary')}>
            {description}
          </p>
        )}
      </div>
      <div
        className={cn(
          'flex w-full items-center gap-2 border transition-[border-color,box-shadow]',
          controlSize[size],
          disabled
            ? 'border-border-default bg-bg-subtle'
            : error
              ? 'border-danger bg-bg-panel shadow-[0_0_0_3px_var(--color-danger-subtle)]'
              : 'border-border-input bg-bg-panel hover:border-border-hover focus-within:border-focus-ring focus-within:shadow-[0_0_0_3px_var(--color-selection)] focus-within:hover:border-focus-ring',
          controlClassName,
        )}
      >
        {icon && (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center',
              disabled ? 'text-gray-8' : 'text-text-placeholder',
              iconSize,
            )}
          >
            {icon}
          </span>
        )}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed disabled:text-gray-8',
            inputClassName,
          )}
          {...props}
        />
        {trailing && (
          <span
            className={cn(
              'flex shrink-0 items-center justify-center',
              disabled ? 'text-gray-8' : 'text-text-placeholder',
              iconSize,
            )}
          >
            {trailing}
          </span>
        )}
      </div>
      {(error || helper) && (
        <p
          id={describedBy}
          className={cn(
            'text-label-12',
            error ? 'text-danger-text' : disabled ? 'text-gray-8' : 'text-text-secondary',
          )}
        >
          {error || helper}
        </p>
      )}
    </div>
  );
}
