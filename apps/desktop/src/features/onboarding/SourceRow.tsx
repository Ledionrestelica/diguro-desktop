import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One row of the bordered list used by Connect sources, Invite and All set:
 *  40px tile, title + caption, trailing action. */
export function SourceRow({
  tile,
  tileClassName,
  title,
  caption,
  trailing,
}: {
  tile: ReactNode;
  tileClassName?: string;
  title: ReactNode;
  caption?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5 border-b border-border px-4 py-3.5 last:border-b-0">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-gray-3',
          tileClassName,
        )}
      >
        {tile}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-label-16 font-medium text-text">{title}</span>
        {caption}
      </span>
      {trailing}
    </li>
  );
}

export function SourceList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-bg-panel"
    >
      {children}
    </ul>
  );
}

export function RowButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex h-8 shrink-0 items-center rounded-[8px] border border-border-input bg-bg-panel px-3.5 text-button-14 outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]',
        disabled
          ? 'cursor-not-allowed text-text-placeholder'
          : 'cursor-pointer text-text hover:bg-hover',
      )}
    >
      {children}
    </button>
  );
}
