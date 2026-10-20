import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Design-system text input (Figma "Input" component). Label above, optional
 * leading icon, helper or error text below. Sizes: sm 32 · md 36 · lg 44.
 */

type Size = 'sm' | 'md' | 'lg';

// Label is Label/13 on sm/md and Label/14 on lg, as in the Figma component.
const controlSize: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-label-14',
  md: 'h-9 px-3 text-label-14',
  lg: 'h-11 px-3.5 text-label-16',
};

type TextFieldProps = Omit<ComponentProps<'input'>, 'size'> & {
  label: string;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  size?: Size;
  icon?: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  controlClassName?: string;
  inputClassName?: string;
};

export function TextField({
  label,
  hideLabel = false,
  size = 'md',
  icon,
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

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          'font-medium text-text',
          size === 'lg' ? 'text-label-14' : 'text-label-13',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-[8px] border bg-bg-panel transition-[border-color,box-shadow]',
          controlSize[size],
          disabled
            ? 'border-border bg-bg-subtle'
            : error
              ? 'border-danger shadow-[0_0_0_3px_var(--color-danger-subtle)]'
              : 'border-border-input hover:border-border-hover focus-within:border-focus-ring focus-within:shadow-[0_0_0_3px_var(--color-selection)] focus-within:hover:border-focus-ring',
          controlClassName,
        )}
      >
        {icon && (
          <span className="flex size-5 shrink-0 items-center justify-center text-text-secondary [&_svg]:size-5">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent font-medium text-text outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed disabled:text-text-placeholder',
            inputClassName,
          )}
          {...props}
        />
      </div>
      {(error || helper) && (
        <p
          id={describedBy}
          className={cn(
            'text-label-12',
            error ? 'text-danger-text' : disabled ? 'text-text-placeholder' : 'text-text-secondary',
          )}
        >
          {error || helper}
        </p>
      )}
    </div>
  );
}
