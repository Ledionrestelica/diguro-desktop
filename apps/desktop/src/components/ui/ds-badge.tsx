import type { ComponentProps, ComponentType } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Figma "Badge" set (Settings page). Colour, size, an optional status dot
 * and optional left/right icons follow the design.
 */

export type DsBadgeColor = 'blue' | 'orange' | 'red' | 'green' | 'purple' | 'gray';
export type DsBadgeSize = 'sm' | 'md' | 'lg';
type Icon = ComponentType<{ size?: number; className?: string }>;

const colors: Record<DsBadgeColor, { badge: string; dot: string }> = {
  blue: { badge: 'bg-blue-4 text-blue-11', dot: 'bg-blue-11' },
  orange: { badge: 'bg-amber-4 text-amber-12', dot: 'bg-amber-12' },
  red: { badge: 'bg-tomato-4 text-tomato-11', dot: 'bg-tomato-11' },
  green: { badge: 'bg-green-4 text-green-12', dot: 'bg-green-12' },
  purple: { badge: 'bg-iris-4 text-iris-11', dot: 'bg-iris-11' },
  gray: { badge: 'bg-gray-a3 text-text', dot: 'bg-primary' },
};

const disabledColor = { badge: 'border border-gray-a2 text-gray-a8', dot: 'bg-gray-a8' };

const sizes: Record<
  DsBadgeSize,
  {
    base: string;
    plain: string;
    dot: string;
    left: string;
    right: string;
    icon: number;
    slot: string;
  }
> = {
  sm: {
    base: 'h-5 text-label-12',
    plain: 'px-2',
    dot: 'pr-2',
    left: 'gap-0.5 pr-2 pl-0.5',
    right: 'gap-0.5 pr-0.5 pl-2',
    icon: 12,
    slot: 'size-4',
  },
  md: {
    base: 'h-6 text-label-14',
    plain: 'px-2',
    dot: 'pr-2.5 pl-0.5',
    left: 'gap-0.5 pr-2.5 pl-0.5',
    right: 'gap-0.5 pr-0.5 pl-2.5',
    icon: 14,
    slot: 'size-5',
  },
  lg: {
    base: 'h-8 text-label-14',
    plain: 'px-3',
    dot: 'pr-3 pl-1.5',
    left: 'gap-1 pr-3 pl-1',
    right: 'gap-1 pr-1 pl-3',
    icon: 16,
    slot: 'size-6',
  },
};

type DsBadgeProps = ComponentProps<'span'> & {
  color?: DsBadgeColor;
  size?: DsBadgeSize;
  dot?: boolean;
  /** Pulses the dot, for states that are still in progress. */
  pulse?: boolean;
  leftIcon?: Icon;
  rightIcon?: Icon;
  disabled?: boolean;
};

export function DsBadge({
  color = 'gray',
  size = 'sm',
  dot = false,
  pulse = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  disabled = false,
  className,
  children,
  ...props
}: DsBadgeProps) {
  const s = sizes[size];
  const c = disabled ? disabledColor : colors[color];
  const padding = dot ? s.dot : LeftIcon ? s.left : RightIcon ? s.right : s.plain;
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-full font-inter font-medium whitespace-nowrap',
        s.base,
        padding,
        c.badge,
        className,
      )}
      {...props}
    >
      {dot && (
        <span aria-hidden className="grid size-5 shrink-0 place-items-center">
          <span className={cn('size-1 rounded-full', c.dot, pulse && 'animate-pulse')} />
        </span>
      )}
      {!dot && LeftIcon && (
        <span aria-hidden className={cn('grid shrink-0 place-items-center', s.slot)}>
          <LeftIcon size={s.icon} />
        </span>
      )}
      {children}
      {RightIcon && (
        <span aria-hidden className={cn('grid shrink-0 place-items-center', s.slot)}>
          <RightIcon size={s.icon} />
        </span>
      )}
    </span>
  );
}
