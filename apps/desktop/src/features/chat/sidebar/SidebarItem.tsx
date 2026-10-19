import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useFluidItem } from '@/components/fluid/FluidList';

/**
 * One sidebar row (Figma "Sidebar/Item"): 16px icon, label, trailing meta,
 * optional hover actions. `tone` maps to the Figma states — default rows are
 * secondary text, `active` gets the gray-2 fill, `card` is the white
 * selected-workspace card.
 */
type Tone = 'default' | 'active' | 'card' | 'muted';

type SidebarItemProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  actions?: ReactNode;
  tone?: Tone;
  strong?: boolean;
  compact?: boolean;
  /** Joins the surrounding FluidList so its shared highlight lands here. */
  fluidKey?: string;
};

// Inside a FluidList the list draws the hover fill; rows only brighten text.
const fluidToneClass: Record<Tone, string> = {
  default: 'text-text-secondary data-[fluid-hover-active]:text-text',
  muted: 'text-text-placeholder data-[fluid-hover-active]:text-text',
  active: 'bg-bg-app text-text',
  card: 'border border-gray-3 bg-bg-panel text-text shadow-[0_2px_2px_rgba(36,36,36,0.03)]',
};

const toneClass: Record<Tone, string> = {
  default: 'text-text-secondary hover:bg-hover hover:text-text',
  muted: 'text-text-placeholder hover:bg-hover hover:text-text',
  active: 'bg-bg-app text-text',
  card: 'border border-gray-3 bg-bg-panel text-text shadow-[0_2px_2px_rgba(36,36,36,0.03)]',
};

export function SidebarItem({
  icon,
  label,
  trailing,
  actions,
  tone = 'default',
  strong = false,
  compact = false,
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
        'group/item relative flex w-full items-center rounded-[8px] transition-colors',
        compact ? 'h-[30px]' : 'h-8',
        (fluidItem.fluid ? fluidToneClass : toneClass)[tone],
        className,
      )}
    >
      <button
        type={type}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 text-left outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
        {...props}
      >
        {icon && (
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            {icon}
          </span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-label-14',
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
    <div className="flex h-[22px] items-center justify-between pr-1.5 pb-1.5 pl-2">
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
