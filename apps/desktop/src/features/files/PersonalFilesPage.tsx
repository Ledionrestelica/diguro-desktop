import { useRef, useState } from 'react';
import { FileText, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  useIsSuperadminBlocked,
  RedirectToPlatform,
} from '@/lib/role-gate';
import { ChatSidebar } from '@/features/chat/ChatSidebar';
import { TopBar } from '@/features/chat/TopBar';
import { WorkspaceRail } from '@/features/chat/WorkspaceRail';

/**
 * Personal (user-scoped) file library. Deliberately simpler than the org
 * Files page — no folders, no replace, no bulk drag-drop of directory
 * trees. Users have a handful of personal docs; the lean UI is enough.
 */
const TRANSIENT_STATUSES = new Set([
  'PENDING',
  'EXTRACTING',
  'CHUNKING',
  'EMBEDDING',
]);

export function PersonalFilesPage() {
  // Superadmins are platform-tier only — no personal files.
  const isSuperadminBlocked = useIsSuperadminBlocked();

  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();
  const filesQuery = trpc.me.filesList.useQuery(
    search.trim() ? { search: search.trim() } : undefined,
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data || data.length === 0) return false;
        const anyTransient = data.some(
          (f) => f.ingestStatus && TRANSIENT_STATUSES.has(f.ingestStatus),
        );
        return anyTransient ? 2000 : false;
      },
    },
  );

  const initiate = trpc.me.filesInitiateUpload.useMutation();
  const confirm = trpc.me.filesConfirmUpload.useMutation();
  const remove = trpc.me.filesRemove.useMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  async function uploadOne(file: File) {
    setUploadError(null);
    const tempId = crypto.randomUUID();
    setPendingUploads((prev) => [...prev, { id: tempId, name: file.name }]);
    try {
      const presigned = await initiate.mutateAsync({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentLength: file.size,
      });
      const putRes = await fetch(presigned.upload.url, {
        method: 'PUT',
        body: file,
        headers: presigned.upload.headers,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      await confirm.mutateAsync({ versionId: presigned.versionId });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPendingUploads((prev) => prev.filter((p) => p.id !== tempId));
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const arr = Array.from(list);
    await Promise.all(arr.map((f) => uploadOne(f)));
    await utils.me.filesList.invalidate();
  }

  function handleRemove(resourceId: string) {
    remove.mutate(
      { resourceId },
      {
        onSuccess: () => {
          void utils.me.filesList.invalidate();
        },
      },
    );
  }

  const files = filesQuery.data ?? [];

  // Post-hooks early return for superadmins (Rules of Hooks: every hook
  // above this point ran on every render; only the JSX branch differs).
  if (isSuperadminBlocked) return <RedirectToPlatform />;

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
      <WorkspaceRail />
      <ChatSidebar activeChatId={null} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-8 py-10">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-zinc-900">My files</h1>
              <p className="text-sm text-zinc-500">
                Personal library — visible only to you. Toggle <em>My files</em> on the
                chat composer to search these docs in a conversation.
              </p>
            </div>

            <section
        className={cn(
          'overflow-hidden rounded-[12px] border bg-white transition-colors',
          isDraggingOver ? 'border-black/60 ring-2 ring-black/20' : 'border-zinc-200',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 p-5">
          <div className="flex h-10 items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-2">
            <Search className="size-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your files"
              className="w-56 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={initiate.isPending}
            className={cn(
              'flex items-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors',
              initiate.isPending
                ? 'cursor-not-allowed opacity-70'
                : 'hover:bg-zinc-800',
            )}
          >
            Upload files
            <Upload className="size-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {uploadError && (
          <div className="border-b border-zinc-100 bg-red-50 px-5 py-2 text-sm text-red-700">
            {uploadError}
          </div>
        )}

        <ul className="flex flex-col">
          {pendingUploads.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-4 border-t border-zinc-100 px-5 py-4"
            >
              <FileIcon />
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-medium text-zinc-800">{p.name}</p>
                <p className="text-sm text-zinc-500">Uploading…</p>
              </div>
              <Loader2 className="ml-auto size-4 animate-spin text-zinc-400" />
            </li>
          ))}

          {filesQuery.isLoading && pendingUploads.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-zinc-500">Loading…</li>
          )}

          {!filesQuery.isLoading &&
            files.length === 0 &&
            pendingUploads.length === 0 && (
              <li className="px-5 py-14 text-center">
                <p className="text-sm font-medium text-zinc-800">No files yet</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Drop files here or click Upload.
                </p>
              </li>
            )}

          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-4 border-t border-zinc-100 px-5 py-4"
            >
              <FileIcon />
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-medium text-zinc-800">
                  {file.name}
                </p>
                <p className="text-sm text-zinc-500">{formatSize(file.fileSize)}</p>
              </div>
              <StatusBadge status={file.ingestStatus} />
              <button
                type="button"
                onClick={() => handleRemove(file.id)}
                disabled={remove.isPending}
                className="ml-auto inline-flex items-center gap-2 rounded-[10px] bg-red-50 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <div className="grid size-[42px] shrink-0 place-items-center rounded-[8px] bg-zinc-100">
      <FileText className="size-5 text-zinc-500" />
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.spinner && <Loader2 className="size-3 animate-spin" />}
      {config.label}
    </span>
  );
}

function statusConfig(status: string | null): {
  label: string;
  className: string;
  spinner: boolean;
} {
  switch (status) {
    case 'DONE':
      return {
        label: 'Ready',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        spinner: false,
      };
    case 'FAILED':
      return {
        label: 'Failed',
        className: 'border-red-200 bg-red-50 text-red-700',
        spinner: false,
      };
    case 'PENDING':
    case 'EXTRACTING':
    case 'CHUNKING':
    case 'EMBEDDING':
      return {
        label: statusLabel(status),
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        spinner: true,
      };
    case 'PENDING_UPLOAD':
      return {
        label: 'Uploading',
        className: 'border-zinc-200 bg-zinc-50 text-zinc-600',
        spinner: true,
      };
    default:
      return {
        label: 'Unknown',
        className: 'border-zinc-200 bg-zinc-50 text-zinc-600',
        spinner: false,
      };
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Queued';
    case 'EXTRACTING':
      return 'Extracting text';
    case 'CHUNKING':
      return 'Chunking';
    case 'EMBEDDING':
      return 'Indexing';
    default:
      return status;
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
