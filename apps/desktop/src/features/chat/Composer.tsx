import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { AlertCircle, Loader2, Mic, Paperclip, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_FILES = 3;
const ACCEPTED = 'image/*,application/pdf';

function isAcceptedMime(type: string): boolean {
  if (type.startsWith('image/')) return true;
  if (type === 'application/pdf') return true;
  return false;
}

/**
 * A composer-owned attachment during its lifecycle. While `state === 'ready'`,
 * `remoteUrl` holds the canonical `chat://` URL that goes into the message
 * FilePart; `localPreview` is a blob: URL for in-composer display only.
 */
export interface ComposerAttachment {
  clientId: string;
  filename: string;
  mediaType: string;
  size: number;
  /** blob: URL for local thumbnail — revoked on unmount. */
  localPreview: string;
  state: 'uploading' | 'ready' | 'error';
  /** Populated once upload succeeds. */
  remoteUrl?: string;
  errorMessage?: string;
}

export interface ReadyAttachment {
  url: string;
  filename: string;
  mediaType: string;
}

interface Props {
  /** Conversation the uploads are scoped to. */
  conversationId: string;
  onSend: (text: string, attachments: ReadyAttachment[]) => void;
  onStop?: () => void;
  /** Set while a response is streaming; disables send, exposes Stop. */
  streaming?: boolean;
  disabled?: boolean;
}

export function Composer({
  conversationId,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
}: Props) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const presign = trpc.chatAttachments.presignUpload.useMutation();

  // Revoke all blob: URLs on unmount to avoid leaking memory.
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.localPreview);
    };
    // Intentional: we want the cleanup to see the latest `attachments`, so we
    // re-register on every change — the previous effect's cleanup runs first,
    // revoking the URLs we no longer track.
  }, [attachments]);

  const startUpload = useCallback(
    async (file: File, clientId: string) => {
      try {
        const presigned = await presign.mutateAsync({
          conversationId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentLength: file.size,
        });

        const putRes = await fetch(presigned.upload.url, {
          method: 'PUT',
          body: file,
          headers: presigned.upload.headers,
        });
        if (!putRes.ok) {
          throw new Error(`Upload failed (${putRes.status})`);
        }

        setAttachments((prev) =>
          prev.map((a) =>
            a.clientId === clientId
              ? { ...a, state: 'ready', remoteUrl: presigned.url }
              : a,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setAttachments((prev) =>
          prev.map((a) =>
            a.clientId === clientId
              ? { ...a, state: 'error', errorMessage: message }
              : a,
          ),
        );
      }
    },
    [conversationId, presign],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      setError(null);
      const accepted: File[] = [];
      for (const f of incoming) {
        if (!isAcceptedMime(f.type)) {
          setError(`${f.name || 'This file'} isn't a supported type. Images and PDFs only.`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          setError(`${f.name} is larger than 25 MB and was skipped.`);
          continue;
        }
        accepted.push(f);
      }
      if (accepted.length === 0) return;

      setAttachments((prev) => {
        const free = MAX_FILES - prev.length;
        if (free <= 0) {
          setError(`Max ${MAX_FILES} attachments per message.`);
          return prev;
        }
        const toAdd = accepted.slice(0, free).map((file) => {
          const clientId = crypto.randomUUID();
          const next: ComposerAttachment = {
            clientId,
            filename: file.name,
            mediaType: file.type,
            size: file.size,
            localPreview: URL.createObjectURL(file),
            state: 'uploading',
          };
          void startUpload(file, clientId);
          return next;
        });
        if (accepted.length > free) {
          setError(`Max ${MAX_FILES} attachments per message. Extra files were dropped.`);
        }
        return [...prev, ...toAdd];
      });
    },
    [startUpload],
  );

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) addFiles(picked);
    e.target.value = '';
  }

  function removeAttachment(clientId: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.clientId === clientId);
      if (target) URL.revokeObjectURL(target.localPreview);
      return prev.filter((a) => a.clientId !== clientId);
    });
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = value.trim();
    const ready = attachments.filter((a) => a.state === 'ready' && a.remoteUrl);
    const uploading = attachments.some((a) => a.state === 'uploading');
    if (uploading) return;
    if ((!trimmed && ready.length === 0) || disabled || streaming) return;

    const readyAttachments: ReadyAttachment[] = ready.map((a) => ({
      url: a.remoteUrl!,
      filename: a.filename,
      mediaType: a.mediaType,
    }));
    onSend(trimmed, readyAttachments);
    // Revoke remaining blob URLs
    for (const a of attachments) URL.revokeObjectURL(a.localPreview);
    setValue('');
    setAttachments([]);
    setError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items ?? []);
    const files = items
      .filter((item) => item.kind === 'file' && isAcceptedMime(item.type))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) addFiles(dropped);
  }

  function onDragOver(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dragActive && e.dataTransfer.types.includes('Files')) setDragActive(true);
  }

  function onDragLeave(e: DragEvent<HTMLFormElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  const hasReadyContent =
    value.trim().length > 0 ||
    attachments.some((a) => a.state === 'ready');
  const anyUploading = attachments.some((a) => a.state === 'uploading');
  const canSend = hasReadyContent && !anyUploading && !disabled && !streaming;

  return (
    <div className="relative mx-auto w-full max-w-[756px]">
      <div className="pointer-events-none absolute inset-x-0 -bottom-6 top-6 -z-0 overflow-hidden rounded-[35px] opacity-70 blur-[10px]">
        <div
          className="size-full"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(106, 169, 210, 0.8) 0%, rgba(235, 208, 249, 0.8) 33%, rgba(193, 230, 255, 0.8) 66%, rgba(198, 229, 245, 0.8) 100%)',
          }}
        />
      </div>

      <form
        onSubmit={submit}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'relative z-10 flex min-h-[128px] flex-col rounded-3xl border bg-[#fafafa] px-6 py-5 transition-colors',
          dragActive ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-200',
        )}
      >
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.clientId}
                attachment={att}
                onRemove={() => removeAttachment(att.clientId)}
              />
            ))}
          </div>
        )}

        <textarea
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          placeholder="Chat with AI"
          className="flex-1 resize-none bg-transparent text-base leading-6 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              onChange={onPick}
              className="hidden"
            />
            <CircleIconButton
              label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
            >
              <Paperclip className="size-4" />
            </CircleIconButton>
            <CircleIconButton label="Voice input" onClick={() => {}} disabled>
              <Mic className="size-4" />
            </CircleIconButton>
          </div>

          <div className="flex items-center gap-2">
            {streaming ? (
              <CircleIconButton label="Stop" onClick={() => onStop?.()}>
                <Square className="size-3.5 fill-current" />
              </CircleIconButton>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  canSend
                    ? 'bg-[#111827] text-white hover:bg-[#111827]/90'
                    : 'cursor-not-allowed bg-zinc-200 text-zinc-400',
                )}
              >
                {anyUploading ? 'Uploading…' : 'Send'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  const isImage = attachment.mediaType.startsWith('image/');

  return (
    <div className="group relative">
      {isImage ? (
        <div className="relative size-16 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
          <img
            src={attachment.localPreview}
            alt={attachment.filename}
            className="size-full object-cover"
          />
          <StateOverlay state={attachment.state} />
        </div>
      ) : (
        <div className="relative flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 pr-4 text-sm text-zinc-700">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-red-50 text-[10px] font-semibold tracking-wide text-red-600">
            {badgeLabel(attachment.mediaType, attachment.filename)}
          </div>
          <div className="min-w-0">
            <span className="block max-w-[160px] truncate text-sm text-zinc-800">
              {attachment.filename}
            </span>
            <span className="block text-xs text-zinc-500">
              {formatBytes(attachment.size)}
            </span>
          </div>
          <StateOverlay state={attachment.state} />
        </div>
      )}
      {attachment.state === 'error' && attachment.errorMessage && (
        <p
          className="absolute -bottom-5 left-0 whitespace-nowrap text-[10px] text-red-600"
          role="alert"
        >
          {attachment.errorMessage}
        </p>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}

function StateOverlay({ state }: { state: ComposerAttachment['state'] }) {
  if (state === 'uploading') {
    return (
      <div className="absolute inset-0 grid place-items-center bg-black/30 text-white">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="absolute inset-0 grid place-items-center bg-red-500/80 text-white">
        <AlertCircle className="size-4" />
      </div>
    );
  }
  return null;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove"
      onClick={onClick}
      className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
    >
      <X className="size-3" />
    </button>
  );
}

function CircleIconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}

function badgeLabel(mediaType: string, filename: string): string {
  if (mediaType === 'application/pdf') return 'PDF';
  const dot = filename.lastIndexOf('.');
  if (dot >= 0 && dot < filename.length - 1) {
    return filename.slice(dot + 1).toUpperCase().slice(0, 4);
  }
  return 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
