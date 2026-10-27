import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PiArrowLeftStroke } from '@/components/icons/pika/PiArrowLeftStroke';

/** The settings sidebar (Figma "Settings sidebar"): back link, title, groups. */
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
    <aside className="flex h-full w-[288px] shrink-0 flex-col overflow-y-auto px-4 pt-5 pb-5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-label-14 font-medium text-text-secondary outline-none transition-colors hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
      >
        <PiArrowLeftStroke size={16} />
        {backLabel}
      </button>
      <div className="px-2.5 pt-4 pb-1">
        <p className="text-[20px] leading-7 font-semibold">Settings</p>
        {subtitle && <p className="truncate text-label-13 text-text-secondary">{subtitle}</p>}
      </div>
      {children}
    </aside>
  );
}

export function SettingsNavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pt-[18px] pb-1 text-label-12 font-medium text-text-placeholder">
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
  icon: LucideIcon;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-label-14 font-medium outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--color-text)]',
          isActive ? 'bg-gray-3 text-text' : 'text-text-secondary hover:bg-hover hover:text-text',
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
