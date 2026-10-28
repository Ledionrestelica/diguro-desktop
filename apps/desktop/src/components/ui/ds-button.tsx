import type { ComponentProps, ComponentType } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Figma "Button" and "Icon button" sets (Settings page). Variant, size and
 * colours follow the design; pressing shrinks it slightly (`press-scale`).
 */

export type DsButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'destructive';
export type DsButtonSize = 'sm' | 'md' | 'lg';
type Icon = ComponentType<{ size?: number; className?: string }>;

const base =
  'press-scale inline-flex shrink-0 cursor-pointer items-center justify-center font-inter font-medium whitespace-nowrap outline-none transition-[transform,background-color,border-color,color] focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed';

const variants: Record<DsButtonVariant, string> = {
  primary:
    'bg-primary text-white enabled:hover:bg-primary-hover disabled:bg-primary-hover disabled:text-gray-11',
  secondary:
    'border border-border-default bg-bg-panel text-text enabled:hover:border-gray-7 disabled:border-transparent disabled:bg-gray-3 disabled:text-gray-7',
  tertiary:
    'border border-gray-5 text-text enabled:hover:border-gray-7 disabled:border-border-default disabled:text-gray-6',
  danger: 'bg-tomato-3 text-tomato-10 enabled:hover:bg-tomato-4 disabled:text-tomato-6',
  destructive: 'bg-tomato-9 text-white enabled:hover:bg-tomato-11 disabled:text-tomato-7',
};

const sizes: Record<DsButtonSize, { button: string; square: string; icon: number }> = {
  sm: {
    button: 'h-8 gap-1.5 rounded-[10px] px-3 text-label-13',
    square: 'size-8 rounded-[10px]',
    icon: 16,
  },
  md: {
    button: 'h-9 gap-1.5 rounded-[10px] px-3.5 text-label-14',
    square: 'size-9 rounded-[10px]',
    icon: 16,
  },
  lg: {
    button: 'h-11 gap-2 rounded-[12px] px-[18px] text-label-16',
    square: 'size-11 rounded-[12px]',
    icon: 20,
  },
};

/** Class string for elements that can't be a DsButton (links, file labels). */
export function dsButtonClass({
  variant = 'secondary',
  size = 'sm',
}: { variant?: DsButtonVariant; size?: DsButtonSize } = {}) {
  return cn(base, variants[variant], sizes[size].button);
}

function Spinner({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
    />
  );
}

type DsButtonProps = ComponentProps<'button'> & {
  variant?: DsButtonVariant;
  size?: DsButtonSize;
  leftIcon?: Icon;
  rightIcon?: Icon;
  /** Shows a spinner in place of the left icon and blocks clicks. */
  loading?: boolean;
};

export function DsButton({
  variant = 'secondary',
  size = 'sm',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: DsButtonProps) {
  const iconSize = sizes[size].icon;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(dsButtonClass({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : LeftIcon && <LeftIcon size={iconSize} />}
      {children}
      {RightIcon && <RightIcon size={iconSize} />}
    </button>
  );
}

type DsIconButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon: Icon;
  /** Read by screen readers and shown as the tooltip; the button has no visible text. */
  label: string;
  variant?: DsButtonVariant;
  size?: DsButtonSize;
  loading?: boolean;
};

export function DsIconButton({
  icon: IconComponent,
  label,
  variant = 'secondary',
  size = 'sm',
  loading = false,
  disabled,
  type = 'button',
  className,
  ...props
}: DsIconButtonProps) {
  const iconSize = sizes[size].icon;
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size].square, className)}
      {...props}
    >
      {loading ? <Spinner size={iconSize} /> : <IconComponent size={iconSize} />}
    </button>
  );
}
