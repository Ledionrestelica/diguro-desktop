import type { ComponentType, ReactNode } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { FluidList, useFluidItem } from '@/components/fluid/FluidList';
import { PiArrowLeftStroke } from '@/components/icons/pika/PiArrowLeftStroke';

/**
 * The settings sidebar (Figma "Settings sidebar"): back link, title, groups.
 * Rows behave like the chat sidebar's: one hover fill springs between them
 * and the current page keeps the gray-3 fill.
 */
export function SettingsNav({
  backLabel,
  onBack,
  subtitle,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  subtitle?: string | undefined;
  children: ReactNode;
}) {
  return (
    <aside className="flex h-full w-[288px] shrink-0 flex-col overflow-y-auto px-4 pt-5 pb-5 font-inter">
      <button
        type="button"
        onClick={onBack}
        className="press-scale flex w-fit cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-label-14 font-medium text-text-secondary outline-none transition-colors hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
      >
        <PiArrowLeftStroke size={16} />
        {backLabel}
      </button>
      <div className="px-2.5 pt-4 pb-1">
        <p className="text-[20px] leading-7 font-semibold">Settings</p>
        {subtitle && <p className="truncate text-label-13 text-text-secondary">{subtitle}</p>}
      </div>
      <FluidList highlightClassName="rounded-[16px]">{children}</FluidList>
    </aside>
  );
}

export function SettingsNavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p
        data-fluid-ignore
        className="truncate px-2.5 pt-[18px] pb-1 text-label-12 font-medium text-text-placeholder"
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export function SettingsNavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  const active = useMatch({ path: to, end: false }) !== null;
  const fluidItem = useFluidItem(to);
  return (
    <div
      ref={fluidItem.ref}
      data-fluid-selected={active ? '' : undefined}
      className={cn(
        'relative flex h-9 w-full items-center rounded-[16px] transition-colors',
        active
          ? 'bg-gray-3 text-text'
          : fluidItem.fluid
            ? 'text-text-secondary data-[fluid-hover-active]:text-text'
            : 'text-text-secondary hover:bg-hover hover:text-text',
      )}
    >
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[16px] pr-3 pl-2.5 outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate text-label-14 font-medium">{label}</span>
      </Link>
    </div>
  );
}
