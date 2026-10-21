import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFluidItem } from '@/components/fluid/FluidList';

/**
 * One sidebar row (Figma "Chat - Final · New Sidebar"): 16px icon, label,
 * trailing meta, optional hover actions. Default rows are secondary text,
 * `muted` placeholder text, `active` the gray-3 fill (one row at a time),
 * `current` dark text without the fill. `hug` makes the row a
 * pill as wide as its label instead of the full column.
 * States are still being designed — kept local to the sidebar on purpose.
 */
type Tone = 'default' | 'active' | 'current' | 'muted';

type SidebarItemProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
  strong?: boolean;
  hug?: boolean;
  /** Joins the surrounding FluidList so its shared highlight lands here. */
  fluidKey?: string;
};

// Inside a FluidList the list draws the hover fill; rows only brighten text.
const fluidToneClass: Record<Tone, string> = {
  default: 'text-text-secondary data-[fluid-hover-active]:text-text',
  muted: 'text-text-placeholder data-[fluid-hover-active]:text-text',
  active: 'bg-gray-3 text-text',
  current: 'text-text data-[fluid-hover-active]:text-text',
};

const toneClass: Record<Tone, string> = {
  default: 'text-text-secondary hover:bg-hover hover:text-text',
  muted: 'text-text-placeholder hover:bg-hover hover:text-text',
  active: 'bg-gray-3 text-text',
  current: 'text-text hover:bg-hover',
};

export function SidebarItem({
  icon,
  label,
  trailing,
  actions,
  tone = 'default',
  strong = false,
  hug = false,
  fluidKey,
  className,
  type = 'button',
  ...props
}: SidebarItemProps) {
  const fluidItem = useFluidItem(fluidKey);
  return (
    <div
      ref={fluidItem.ref}
      className={cn(
        'group/item relative flex h-9 items-center rounded-[16px] transition-colors',
        hug ? 'w-fit max-w-full' : 'w-full',
        (fluidItem.fluid ? fluidToneClass : toneClass)[tone],
        className,
      )}
    >
      <button
        type={type}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[16px] pr-3 pl-2.5 text-left outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
        {...props}
      >
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {icon}
          </span>
        )}
        <span
          className={cn(
            'min-w-0 truncate text-label-14',
            !hug && 'flex-1',
            strong ? 'font-semibold' : 'font-medium',
          )}
        >
          {label}
        </span>
        {trailing !== undefined && (
          <span className="shrink-0 text-label-12 text-text-placeholder">{trailing}</span>
        )}
      </button>
      {actions && <div className="flex shrink-0 items-center pr-1">{actions}</div>}
    </div>
  );
}

export function SidebarSectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div
      data-fluid-ignore
      className="flex h-[22px] items-center justify-between pr-1.5 pb-1.5 pl-2"
    >
      <span className="text-label-12 font-medium text-text-placeholder">{label}</span>
      {action}
    </div>
  );
}

export function SidebarIconButton({
  label,
  children,
  className,
  ...props
}: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-5 cursor-pointer place-items-center rounded-[5px] text-text-placeholder outline-none transition-colors hover:bg-hover hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
