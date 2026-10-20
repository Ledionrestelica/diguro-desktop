import { useRef, useState, type ComponentType, type DragEvent } from 'react';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { PiFileTextStroke } from '@/components/icons/pika/PiFileTextStroke';
import { PiFileDefaultStroke } from '@/components/icons/pika/PiFileDefaultStroke';
import { PiFileBarGraphStroke } from '@/components/icons/pika/PiFileBarGraphStroke';
import { PiPhotoImageDefaultStroke } from '@/components/icons/pika/PiPhotoImageDefaultStroke';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import { CrossIcon } from '@/components/icons/CrossIcon';
import { cn } from '@/lib/utils';
import { OnboardingShell } from './OnboardingShell';
import { UPLOAD_ACCEPT, type UploadItem } from './useFileUploads';

type UploadStepProps = {
  scope: 'organization' | 'personal';
  orgName: string | null;
  uploads: {
    items: UploadItem[];
    add: (files: Iterable<File>) => void;
    dismiss: (id: string) => void;
    readyCount: number;
    busy: boolean;
  };
  onDone: () => void;
};

export function UploadStep({ scope, orgName, uploads, onDone }: UploadStepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const pending = uploads.items.filter((i) => i.state.kind === 'uploading').length;
  const count = uploads.readyCount + pending;

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    uploads.add(e.dataTransfer.files);
  }

  return (
    <OnboardingShell
      segment={scope === 'personal' ? 2 : 3}
      title="Upload files"
      subtitle="Add documents from your computer. Iserana starts reading them right away."
      topOffset={96}
      onBack={onDone}
      onContinue={onDone}
      continueLabel={count > 0 ? `Add ${count} ${count === 1 ? 'file' : 'files'}` : 'Done'}
      loading={uploads.busy}
    >
      <div className="flex flex-col gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2.5 rounded-[12px] border border-dashed py-7 outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]',
            dragging ? 'border-focus-ring bg-selection' : 'border-border-input bg-bg-raised',
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-[10px] border border-border bg-bg-panel">
            <PiUploadUpStroke size={20} />
          </span>
          <span className="text-label-14 font-medium text-text">
            Drop files here or <span className="text-text-link">browse</span>
          </span>
          <span className="text-label-13 text-text-secondary">
            PDF, Word, Excel, CSV, TXT or Markdown · up to 50 MB each
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) uploads.add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {uploads.items.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-[12px] border border-border bg-bg-panel">
            {uploads.items.map((item) => (
              <FileRow key={item.id} item={item} onDismiss={() => uploads.dismiss(item.id)} />
            ))}
          </ul>
        )}

        <p className="text-label-13 text-text-secondary">
          {scope === 'organization'
            ? `Files are saved to ${orgName ?? 'your organization'}. You can sort them into folders later.`
            : 'Files are saved to your personal library. Only you can see them.'}
        </p>
      </div>
    </OnboardingShell>
  );
}

const TYPE_ICON: Record<
  string,
  { Icon: ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  pdf: { Icon: PiFileTextStroke, color: 'text-tomato-9' },
  doc: { Icon: PiFileDefaultStroke, color: 'text-blue-9' },
  docx: { Icon: PiFileDefaultStroke, color: 'text-blue-9' },
  xls: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
  xlsx: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
  csv: { Icon: PiFileBarGraphStroke, color: 'text-green-9' },
};

function FileRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const { state } = item;
  const isImage = /^(png|jpe?g|gif|webp|heic|svg)$/.test(item.extension);
  const { Icon, color } = isImage
    ? { Icon: PiPhotoImageDefaultStroke, color: 'text-text' }
    : (TYPE_ICON[item.extension] ?? { Icon: PiFileDefaultStroke, color: 'text-text-secondary' });
  const size = formatBytes(item.size);

  const caption =
    state.kind === 'uploading'
      ? { text: `${size} · Uploading`, tone: 'text-text-secondary' }
      : state.kind === 'ready'
        ? { text: `${size} · Ready`, tone: 'text-text-secondary' }
        : { text: `${size} · ${state.reason}`, tone: 'text-danger-text' };

  return (
    <li className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-gray-4">
        <Icon size={16} className={color} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-label-14 font-medium',
              state.kind === 'rejected' || state.kind === 'failed'
                ? 'text-text-secondary'
                : 'text-text',
            )}
          >
            {item.name}
          </span>
          {state.kind === 'uploading' && (
            <span className="text-label-13 text-text-secondary">
              {Math.round(state.progress * 100)}%
            </span>
          )}
        </span>
        {state.kind === 'uploading' && (
          <span className="h-1 w-full overflow-hidden rounded-full bg-selected">
            <span
              className="block h-full rounded-full bg-blue-7 transition-[width]"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </span>
        )}
        <span className={cn('text-label-13', caption.tone)}>{caption.text}</span>
      </span>
      {state.kind === 'ready' ? (
        <PiCheckTickSingleStroke size={18} className="shrink-0 text-success" ariaLabel="Uploaded" />
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={state.kind === 'uploading' ? `Cancel ${item.name}` : `Remove ${item.name}`}
          className="shrink-0 cursor-pointer rounded-[4px] text-text-placeholder outline-none hover:text-text focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
        >
          <CrossIcon size={16} />
        </button>
      )}
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
