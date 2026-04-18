import { useRef, useState } from 'react';
import {
  FileText,
  Loader2,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../AdminLayout';

/**
 * Organization-scoped file library — documents uploaded here are available
 * to every workspace in the organization for RAG. Pre-ingestion pipeline:
 * the UI shows the ingest status per file (Uploading → Processing → Ready
 * / Failed) so admins can see where each doc is.
 */
export function OrganizationFilesPage() {
  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();
  const filesQuery = trpc.adminOrganization.filesList.useQuery(
    search.trim() ? { search: search.trim() } : undefined,
  );

  const initiate = trpc.adminOrganization.filesInitiateUpload.useMutation();
  const confirm = trpc.adminOrganization.filesConfirmUpload.useMutation();
  const remove = trpc.adminOrganization.filesRemove.useMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; name: string }>>([]);

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
      await utils.adminOrganization.filesList.invalidate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPendingUploads((prev) => prev.filter((p) => p.id !== tempId));
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    // Upload in parallel — each row shows its own progress state.
    await Promise.all(files.map((f) => uploadOne(f)));
  }

  function handleRemove(resourceId: string) {
    remove.mutate(
      { resourceId },
      {
        onSuccess: () => {
          void utils.adminOrganization.filesList.invalidate();
        },
      },
    );
  }

  const files = filesQuery.data ?? [];

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
        <section className="overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">Uploaded files</p>
              <p className="mt-1 text-sm font-medium leading-5 text-zinc-600">
                PDF, DOCX, XLSX, PPTX, MD, TXT, CSV — up to 100 MB each. Visible
                to every workspace in this organization.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-2 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)]">
                <Search className="size-4 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search files"
                  className="w-48 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={initiate.isPending}
                className={cn(
                  'flex items-center gap-2 rounded-[10px] bg-black px-4 py-2.5 text-sm font-medium text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors',
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
          </div>

          {uploadError && (
            <div className="border-b border-zinc-100 bg-red-50 px-6 py-2 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          <div className="px-6 pb-2 pt-5">
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>Name</span>
              <span>Status</span>
            </div>
          </div>

          <ul className="flex flex-col">
            {pendingUploads.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 border-t border-zinc-100 px-6 py-4"
              >
                <FileIcon />
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {p.name}
                  </p>
                  <p className="text-sm text-zinc-500">Uploading…</p>
                </div>
                <Loader2 className="ml-auto size-4 animate-spin text-zinc-400" />
              </li>
            ))}

            {filesQuery.isLoading && pendingUploads.length === 0 && (
              <li className="border-t border-zinc-100 px-6 py-8 text-center text-sm text-zinc-500">
                Loading…
              </li>
            )}

            {!filesQuery.isLoading && files.length === 0 && pendingUploads.length === 0 && (
              <li className="border-t border-zinc-100 px-6 py-14 text-center">
                <p className="text-sm font-medium text-zinc-800">No files yet</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Upload documents to make them available across every workspace.
                </p>
              </li>
            )}

            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-4 border-t border-zinc-100 px-6 py-4"
              >
                <FileIcon />
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {file.name}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {formatSize(file.fileSize)}
                  </p>
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
    </AdminPageBody>
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
        label: 'Processing',
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

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
