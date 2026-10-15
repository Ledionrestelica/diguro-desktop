import type { ReactNode } from 'react';
import { IseranaWordmark } from '@/components/brand/IseranaWordmark';

/** Wordmark + title over a 330px column — the Sign in frame's layout, reused
 *  by the email, reset-password and forgot-password views. */
export function AuthCenteredLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-bg-panel px-4 pt-[17vh] pb-12 font-inter text-text antialiased">
      <div className="flex w-full max-w-[446px] flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <IseranaWordmark className="h-[18px] w-auto" />
          <h1 className="text-heading-24 font-medium">{title}</h1>
          {subtitle && <div className="-mt-2 text-copy-16 text-text-secondary">{subtitle}</div>}
        </div>
        <div className="flex w-full max-w-[330px] flex-col gap-3">{children}</div>
        {footer && (
          <div className="flex w-full flex-col items-center gap-3.5 text-center text-copy-14 [&_*]:font-medium">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuthLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer underline decoration-from-font underline-offset-2 hover:opacity-70"
    >
      {children}
    </button>
  );
}
