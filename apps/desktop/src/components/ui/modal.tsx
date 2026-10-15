import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { CrossIcon } from '@/components/icons/CrossIcon';
import { cn } from '@/lib/utils';

/**
 * Design-system dialog (Figma "Dialog"): 480px panel, 16px radius, title +
 * description header with a close ×, padded body, bordered action footer.
 */
type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-gray-12/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-32px)] w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] bg-bg-panel font-inter text-text shadow-[0_16px_48px_var(--color-gray-a5)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start gap-3 px-6 pt-6 pb-1">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Dialog.Title className="text-heading-20 font-medium">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-copy-14 text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="cursor-pointer rounded-[6px] text-text-secondary outline-none hover:text-text focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
            >
              <CrossIcon size={20} />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pt-4 pb-6">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
