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
import {
  AlertCircle,
  AtSign,
  Briefcase,
  Building2,
  ChevronDown,
  FileText,
  Loader2,
  Lock,
  Mic,
  Paperclip,
  Square,
  User,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { ModelPicker } from './ModelPicker';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_FILES = 10;
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

export type RetrievalScope = 'organization' | 'workspace' | 'user';

export interface MentionedFile {
  id: string;
  name: string;
}

interface Props {
  /** Conversation the uploads are scoped to. */
  conversationId: string;
  onSend: (
    text: string,
    attachments: ReadyAttachment[],
    scope: RetrievalScope,
    modelId: string | null,
    mentionedFileId: string | null,
  ) => void;
  onStop?: () => void;
  /** Set while a response is streaming; disables send, exposes Stop. */
  streaming?: boolean;
  disabled?: boolean;
  /** Initial scope selection. Parent sets this based on conversation state:
   *  new chat → user preference / default 'organization'; existing chat →
   *  the value stored on conversations.retrievalScope. */
  initialScope?: RetrievalScope;
  /** When true, the toggle is disabled and shown with a lock indicator —
   *  the conversation already has messages, so the server has locked the
   *  scope. Parent flips this once messages exist. */
  scopeLocked?: boolean;
  /** Starting model id. New chat → user preference; existing chat → last
   *  model used. `null` lets ModelPicker fall back to the catalog default. */
  initialModelId?: string | null;
}

export function Composer({
  conversationId,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  initialScope = 'organization',
  scopeLocked = false,
  initialModelId = null,
}: Props) {
  // Active workspace metadata drives the ScopeToggle's workspace option
  // (label + whether it's available). Reusing the global `health.me`
  // query so we don't fan out an extra request — it's already cached by
  // the layout / topbar.
  const meQuery = trpc.health.me.useQuery();
  const activeWorkspaceId = meQuery.data?.activeWorkspaceId ?? null;
  const activeWorkspaceName = meQuery.data?.activeWorkspace?.name ?? null;

  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [scope, setScope] = useState<RetrievalScope>(initialScope);
  const [modelId, setModelId] = useState<string | null>(initialModelId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File mention state. `picker` drives the dropdown — `typeahead` mode is
  // anchored to a # token in the textarea (selection strips the token);
  // `button` mode opens via the explicit pick-file button (selection just
  // sets `mentionedFile`). `mentionedFile` is the per-message single-file
  // reference that gets sent to the server as `mentionedResourceIds`.
  const [mentionedFile, setMentionedFile] = useState<MentionedFile | null>(null);
  const [picker, setPicker] = useState<
    | { kind: 'idle' }
    | { kind: 'typeahead'; start: number; query: string }
    | { kind: 'button'; query: string }
  >({ kind: 'idle' });
  const [pickerHighlight, setPickerHighlight] = useState(0);

  const pickerOpen = picker.kind !== 'idle';
  const pickerQuery = picker.kind === 'idle' ? '' : picker.query;
  const pickerHasQuery = pickerQuery.trim().length > 0;

  // Skip the network round-trip when the user hasn't typed anything yet —
  // an org with thousands of files would dump an arbitrary first 20 that
  // are never what the user wants. Empty state nudges them to type.
  const mentionFilesQuery = trpc.conversations.searchMentionableFiles.useQuery(
    { scope, q: pickerQuery, limit: 20 },
    { enabled: pickerOpen && pickerHasQuery, staleTime: 30_000 },
  );
  const mentionFiles = pickerHasQuery ? (mentionFilesQuery.data ?? []) : [];

  // Reset highlight whenever the candidate list changes so the first row is
  // always pre-selected (matches Slack/Linear behavior).
  useEffect(() => {
    setPickerHighlight(0);
  }, [pickerQuery, mentionFilesQuery.data]);

  // Clear an existing pinned file if the user toggles scope — the file
  // belongs to the previous scope and would be invisible to the model.
  useEffect(() => {
    setMentionedFile(null);
  }, [scope]);

  // Follow the parent when the conversation context changes (e.g. user
  // navigated from a new chat to an existing one mid-session).
  useEffect(() => {
    setScope(initialScope);
  }, [initialScope]);
  useEffect(() => {
    setModelId(initialModelId);
  }, [initialModelId]);

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
            a.clientId === clientId ? { ...a, state: 'ready', remoteUrl: presigned.url } : a,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setAttachments((prev) =>
          prev.map((a) =>
            a.clientId === clientId ? { ...a, state: 'error', errorMessage: message } : a,
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
    // Allow send when ONLY a file is pinned (text empty) — the prepended
    // "Pinned: <name>" line makes the user bubble non-empty for the renderer.
    if ((!trimmed && ready.length === 0 && !mentionedFile) || disabled || streaming) return;

    const readyAttachments: ReadyAttachment[] = ready.map((a) => ({
      url: a.remoteUrl!,
      filename: a.filename,
      mediaType: a.mediaType,
    }));

    // When a file is pinned, prepend a visible reference to the user text so
    // (a) the user bubble has SOMETHING to render even if they typed nothing,
    // and (b) the user can see in the conversation history which file each
    // turn was scoped to. The model also benefits — system-prompt knows a
    // file is pinned, but in-message context reinforces it.
    const finalText = mentionedFile
      ? trimmed
        ? `Pinned: ${mentionedFile.name}\n\n${trimmed}`
        : `Pinned: ${mentionedFile.name}`
      : trimmed;

    onSend(finalText, readyAttachments, scope, modelId, mentionedFile?.id ?? null);
    // Revoke remaining blob URLs
    for (const a of attachments) URL.revokeObjectURL(a.localPreview);
    setValue('');
    setAttachments([]);
    setMentionedFile(null);
    setPicker({ kind: 'idle' });
    setError(null);
  }

  // Detect a `#` mention token at the caret. Triggers when `#` is at the
  // start of the value or directly after whitespace (matches Slack — typing
  // "color#code" should NOT trigger a mention).
  function detectMentionToken(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const m = before.match(/(?:^|\s)#([^\s#]*)$/);
    if (!m || m[1] === undefined) return null;
    const start = cursor - m[1].length - 1;
    return { start, query: m[1] };
  }

  function onTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    const cursor = e.target.selectionStart ?? next.length;
    const detected = detectMentionToken(next, cursor);
    if (detected) {
      setPicker({ kind: 'typeahead', ...detected });
    } else if (picker.kind === 'typeahead') {
      // The user typed past the token (whitespace, deleted past #, etc.).
      setPicker({ kind: 'idle' });
    }
  }

  function selectMentionFile(file: MentionedFile) {
    if (picker.kind === 'typeahead') {
      // Strip the `#${query}` substring from the textarea.
      const before = value.slice(0, picker.start);
      const after = value.slice(picker.start + 1 + picker.query.length);
      const next = before + after;
      setValue(next);
      // Restore caret to where the # was.
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(picker.start, picker.start);
        }
      });
    }
    setMentionedFile(file);
    setPicker({ kind: 'idle' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Picker keyboard nav takes precedence over normal Enter-to-send.
    if (pickerOpen && mentionFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPickerHighlight((i) => (i + 1) % mentionFiles.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPickerHighlight((i) => (i - 1 + mentionFiles.length) % mentionFiles.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const file = mentionFiles[pickerHighlight];
        if (file) {
          e.preventDefault();
          selectMentionFile(file);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPicker({ kind: 'idle' });
        return;
      }
    }
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
    attachments.some((a) => a.state === 'ready') ||
    mentionedFile !== null;
  const anyUploading = attachments.some((a) => a.state === 'uploading');
  const canSend = hasReadyContent && !anyUploading && !disabled && !streaming;

  return (
    <div className="relative mx-auto w-full max-w-189">
      <div className="pointer-events-none absolute inset-x-0 -bottom-6 top-6 z-0 overflow-hidden rounded-[35px] opacity-70 blur-[10px]">
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
          'relative z-10 flex min-h-32 flex-col rounded-3xl border bg-[#fafafa] px-6 py-5 transition-colors',
          dragActive ? 'border-zinc-400 bg-zinc-50' : 'border-zinc-200',
        )}
      >
        {(attachments.length > 0 || mentionedFile) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {mentionedFile && (
              <MentionedFileChip
                file={mentionedFile}
                onRemove={() => setMentionedFile(null)}
              />
            )}
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
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            // Auto-close the picker when the user clicks outside the
            // textarea — but only in typeahead mode. In button mode the
            // picker's own input takes focus when opened, which blurs the
            // textarea immediately; closing here would kill the picker
            // we just opened. Defer so a click inside the picker (in
            // typeahead mode) registers before close.
            setTimeout(() => {
              setPicker((prev) => (prev.kind === 'typeahead' ? { kind: 'idle' } : prev));
            }, 150);
          }}
          disabled={disabled}
          placeholder="Chat with AI — type # to focus on one file"
          className="flex-1 resize-none bg-transparent text-base leading-6 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />

        {pickerOpen && (
          <FileMentionPicker
            mode={picker.kind === 'button' ? 'button' : 'typeahead'}
            files={mentionFiles}
            highlight={pickerHighlight}
            // React Query stays in `idle` (not loading) when disabled — so
            // we surface "loading" only when the query is actually firing.
            loading={pickerHasQuery && mentionFilesQuery.isFetching}
            scope={scope}
            query={pickerQuery}
            onQueryChange={(q) =>
              setPicker((prev) =>
                prev.kind === 'button'
                  ? { kind: 'button', query: q }
                  : prev,
              )
            }
            onPick={selectMentionFile}
            onHover={setPickerHighlight}
            onClose={() => setPicker({ kind: 'idle' })}
          />
        )}

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
            <CircleIconButton
              label="Pin a file from your library"
              onClick={() => {
                if (picker.kind === 'idle') {
                  setPicker({ kind: 'button', query: '' });
                } else {
                  setPicker({ kind: 'idle' });
                }
              }}
              disabled={streaming}
            >
              <AtSign className="size-4" />
            </CircleIconButton>
            <CircleIconButton label="Voice input" onClick={() => {}} disabled>
              <Mic className="size-4" />
            </CircleIconButton>
            <ScopeToggle
              scope={scope}
              locked={scopeLocked}
              workspaceName={activeWorkspaceName}
              workspaceAvailable={Boolean(activeWorkspaceId)}
              onChange={setScope}
            />
          </div>

          <div className="flex items-center gap-2">
            <ModelPicker value={modelId} onChange={setModelId} disabled={streaming || disabled} />
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

/**
 * Two-state pill that picks which corpus the chat searches. Locked once
 * the conversation has messages — the server won't let you change scope
 * mid-conversation anyway, so we surface that constraint in the UI.
 */
function scopeMeta(scope: RetrievalScope): {
  label: string;
  Icon: typeof Building2;
  /** Tailwind class for the chip when this scope is the active one. */
  activeClass: string;
} {
  switch (scope) {
    case 'user':
      return {
        label: 'My files',
        Icon: User,
        activeClass: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
      };
    case 'workspace':
      return {
        label: 'Workspace',
        Icon: Briefcase,
        activeClass: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
      };
    case 'organization':
    default:
      return {
        label: 'Organization',
        Icon: Building2,
        activeClass: 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
      };
  }
}

function ScopeToggle({
  scope,
  locked,
  workspaceName,
  workspaceAvailable,
  onChange,
}: {
  scope: RetrievalScope;
  locked: boolean;
  /** Display name of the active workspace; null if no workspace. Used to
   *  customize the dropdown label so users see which workspace they're
   *  scoping retrieval to. */
  workspaceName: string | null;
  /** False = no active workspace, hide the workspace option entirely. */
  workspaceAvailable: boolean;
  onChange: (next: RetrievalScope) => void;
}) {
  const meta = scopeMeta(scope);
  const Icon = meta.Icon;
  const label =
    scope === 'workspace' && workspaceName ? workspaceName : meta.label;

  if (locked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600"
        title="Scope locked for this conversation"
      >
        <Lock className="size-3 text-zinc-400" />
        <Icon className="size-3.5 text-zinc-500" />
        {label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            meta.activeClass,
          )}
          title={`Searching ${label.toLowerCase()}. Click to switch.`}
        >
          <Icon className="size-3.5" />
          <span className="max-w-32 truncate">{label}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaceAvailable ? (
          <ScopeItem
            scope="workspace"
            activeScope={scope}
            onPick={onChange}
            label={workspaceName ?? 'Workspace'}
            description="Workspace files plus all org-wide files."
          />
        ) : (
          // Edge case: user has no active workspace. Fall back to the
          // org-only option so they can still scope retrieval to their
          // organization's files instead of being limited to personal.
          <ScopeItem
            scope="organization"
            activeScope={scope}
            onPick={onChange}
            label="Organization"
            description="All files shared across the organization."
          />
        )}
        <ScopeItem
          scope="user"
          activeScope={scope}
          onPick={onChange}
          label="My files"
          description="Your personal library."
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScopeItem({
  scope,
  activeScope,
  onPick,
  label,
  description,
}: {
  scope: RetrievalScope;
  activeScope: RetrievalScope;
  onPick: (next: RetrievalScope) => void;
  label: string;
  description: string;
}) {
  const meta = scopeMeta(scope);
  const Icon = meta.Icon;
  const isActive = scope === activeScope;
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onSelect={() => onPick(scope)}
    >
      <Icon className="size-4" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="truncate text-xs text-zinc-500">{description}</span>
      </div>
      {isActive && <span className="ml-2 text-xs text-zinc-400">Active</span>}
    </DropdownMenuItem>
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
            <span className="block max-w-40 truncate text-sm text-zinc-800">
              {attachment.filename}
            </span>
            <span className="block text-xs text-zinc-500">{formatBytes(attachment.size)}</span>
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

function MentionedFileChip({
  file,
  onRemove,
}: {
  file: MentionedFile;
  onRemove: () => void;
}) {
  return (
    <div
      className="group inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-2.5 pr-1 text-xs font-medium text-violet-700"
      title={`Focused on ${file.name} — the assistant will only answer from this file`}
    >
      <FileText className="size-3.5" />
      <span className="max-w-44 truncate">{file.name}</span>
      <button
        type="button"
        aria-label="Unpin file"
        onClick={onRemove}
        className="grid size-4 place-items-center rounded-full text-violet-400 transition-colors hover:bg-violet-100 hover:text-violet-700"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

interface FileMentionPickerProps {
  mode: 'typeahead' | 'button';
  files: MentionedFile[];
  highlight: number;
  loading: boolean;
  scope: RetrievalScope;
  query: string;
  onQueryChange: (q: string) => void;
  onPick: (file: MentionedFile) => void;
  onHover: (i: number) => void;
  onClose: () => void;
}

function FileMentionPicker({
  mode,
  files,
  highlight,
  loading,
  scope,
  query,
  onQueryChange,
  onPick,
  onHover,
  onClose,
}: FileMentionPickerProps) {
  const scopeLabel = scope === 'user' ? 'your files' : 'organization files';
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  // Autofocus the internal search input when opened via the @ button.
  // Typeahead mode keeps the textarea focused — the picker mirrors what
  // the user types after `#` and we don't want to steal that focus.
  useEffect(() => {
    if (mode === 'button') inputRef.current?.focus();
  }, [mode]);

  // Picker-internal keyboard nav (button mode only — typeahead mode is
  // handled by the Composer's textarea onKeyDown so the user can keep
  // typing in the textarea while the picker is open).
  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (files.length > 0) onHover((highlight + 1) % files.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (files.length > 0) onHover((highlight - 1 + files.length) % files.length);
      return;
    }
    if (e.key === 'Enter') {
      const f = files[highlight];
      if (f) {
        e.preventDefault();
        onPick(f);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
      // keep textarea focused in typeahead mode; in button mode our
      // input takes focus instead so this is a no-op there.
      onMouseDown={(e) => {
        if (mode === 'typeahead') e.preventDefault();
      }}
    >
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
        <span>
          {hasQuery
            ? `Searching ${scopeLabel} for "${trimmedQuery}"`
            : `Search ${scopeLabel}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Close picker"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {mode === 'button' && (
        <div className="border-b border-zinc-100 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type to search files…"
            className="w-full rounded-md bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-400"
          />
        </div>
      )}

      <div className="max-h-64 overflow-y-auto">
        {!hasQuery && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            {mode === 'typeahead'
              ? 'Keep typing to search files…'
              : 'Type to search files.'}
          </p>
        )}
        {hasQuery && loading && (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            <Loader2 className="mx-auto size-4 animate-spin text-zinc-400" />
          </div>
        )}
        {hasQuery && !loading && files.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            No files match.
          </p>
        )}
        {hasQuery &&
          !loading &&
          files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f)}
              onMouseEnter={() => onHover(i)}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                i === highlight ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50',
              )}
            >
              <FileText className="size-4 shrink-0 text-zinc-400" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function badgeLabel(mediaType: string, filename: string): string {
  if (mediaType === 'application/pdf') return 'PDF';
  const dot = filename.lastIndexOf('.');
  if (dot >= 0 && dot < filename.length - 1) {
    return filename
      .slice(dot + 1)
      .toUpperCase()
      .slice(0, 4);
  }
  return 'FILE';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
