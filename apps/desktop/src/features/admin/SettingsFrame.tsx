import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AdminSaveAction } from './admin-save-context';
import { SettingsFrameContext } from './AdminPageBody';

/**
 * The settings shell (Figma "Settings · B · Full page"): settings nav on the
 * app's gray, and the page in a white card with its title, description and
 * the shared Save button. Content sits in a centred column.
 */
export function SettingsFrame({
  sidebar,
  title,
  description,
  save,
  children,
}: {
  sidebar: ReactNode;
  title: string;
  description?: string | undefined;
  save: AdminSaveAction | null;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg-app font-inter text-text antialiased">
      {sidebar}
      <div className="mt-5 mb-3.5 ml-[26px] flex min-w-0 flex-1 flex-col overflow-hidden rounded-l-[24px] bg-bg-panel">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[960px] px-8 pt-14 pb-16">
            <header className="mb-7 flex items-end justify-between gap-6">
              <div className="min-w-0">
                <h1 className="text-[24px] leading-8 font-semibold">{title}</h1>
                {description && (
                  <p className="mt-1 text-copy-14 text-text-secondary">{description}</p>
                )}
              </div>
              {save && (
                <button
                  type="button"
                  onClick={save.onSave}
                  disabled={save.disabled || save.pending}
                  className={cn(
                    'shrink-0 rounded-[10px] bg-primary px-3 py-[7px] text-label-13 font-medium text-text-on-solid outline-none transition-opacity focus-visible:shadow-[0_0_0_2px_var(--color-focus-ring)]',
                    save.disabled || save.pending
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:opacity-90',
                  )}
                >
                  {save.pending ? 'Saving…' : (save.label ?? 'Save changes')}
                </button>
              )}
            </header>
            <SettingsFrameContext.Provider value={true}>{children}</SettingsFrameContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
