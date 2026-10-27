import { Children, Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A titled group of settings in a bordered card, rows split by dividers
 *  (Figma "Group · …" with "Box"). */
export function SettingsSection({
  title,
  note,
  className,
  children,
}: {
  title?: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <section className={cn('mb-7 flex flex-col gap-2.5', className)}>
      {title && <h2 className="text-label-14 font-semibold">{title}</h2>}
      <div className="overflow-hidden rounded-[16px] border border-border-default">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <div className="h-px bg-border-default" />}
            {row}
          </Fragment>
        ))}
      </div>
      {note && <p className="text-label-12 text-text-placeholder">{note}</p>}
    </section>
  );
}

/** Label and hint on the left, the control on the right. */
export function SettingsRow({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  /** Control goes under the label, for wide controls like text areas. */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-6 py-3.5 pr-4 pl-5',
        stacked ? 'flex-col gap-3' : 'items-center justify-between',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-label-14 font-medium">{label}</div>
        {hint && <div className="text-label-13 text-text-secondary">{hint}</div>}
      </div>
      {children && <div className={cn(stacked ? 'w-full' : 'shrink-0')}>{children}</div>}
    </div>
  );
}
