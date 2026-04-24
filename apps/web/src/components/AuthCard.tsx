import type { ReactNode } from 'react';

/**
 * Shared card layout for sign-in, sign-up, and accept-invite. Keeps the
 * web pages visually consistent without dragging in the full shadcn
 * component set.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md rounded-[16px] border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
        <div className="mt-6 flex flex-col gap-4">{children}</div>
        {footer && (
          <div className="mt-6 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
