import { useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileText,
  FolderPlus,
  Folder as FolderIcon,
  Home,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { AdminPageBody } from '../AdminLayout';

/**
 * Workspace-scoped file library. Files added here are visible to members
 * of this workspace only — separate from organization-wide files. Mirrors
 * OrganizationFilesPage's UI feature-for-feature: folders (nested + drag-
 * drop directory uploads), replace with version history, search, remove.
 *
 * Same lazy-rebuild pattern as the org page: when adminOrganization gets
 * new file features, this page should track them via the parallel
 * adminWorkspace endpoints.
 */
const TRANSIENT_STATUSES = new Set([
  'PENDING',
  'EXTRACTING',
  'CHUNKING',
  'EMBEDDING',
]);

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export function WorkspaceFilesPage() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();

  const foldersQuery = trpc.adminWorkspace.foldersList.useQuery();

  const filesQueryInput = useMemo(() => {
    const trimmed = search.trim();
    if (trimmed) return { search: trimmed };
    return { folderId: currentFolderId };
  }, [search, currentFolderId]);

  const filesQuery = trpc.adminWorkspace.filesList.useQuery(filesQueryInput, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const anyTransient = data.some(
        (f) => f.ingestStatus && TRANSIENT_STATUSES.has(f.ingestStatus),
      );
      return anyTransient ? 2000 : false;
    },
  });

  const initiate = trpc.adminWorkspace.filesInitiateUpload.useMutation();
  const confirm = trpc.adminWorkspace.filesConfirmUpload.useMutation();
  const initiateReplace = trpc.adminWorkspace.filesInitiateReplace.useMutation();
  const confirmReplace = trpc.adminWorkspace.filesConfirmReplace.useMutation();
  const remove = trpc.adminWorkspace.filesRemove.useMutation();
  const folderCreate = trpc.adminWorkspace.folderCreate.useMutation();
  const folderEnsure = trpc.adminWorkspace.folderEnsure.useMutation();
  const folderDelete = trpc.adminWorkspace.folderDelete.useMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; name: string }>>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [replacingResourceId, setReplacingResourceId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const pendingReplaceResourceId = useRef<string | null>(null);

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const files = filesQuery.data ?? [];

  const subfolders = useMemo(
    () => folders.filter((f) => f.parentId === currentFolderId),
    [folders, currentFolderId],
  );

  const breadcrumb = useMemo(() => {
    if (!currentFolderId) return [] as FolderRow[];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const path: FolderRow[] = [];
    let cursor: string | null | undefined = currentFolderId;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row = byId.get(cursor);
      if (!row) break;
      path.unshift(row);
      cursor = row.parentId;
    }
    return path;
  }, [folders, currentFolderId]);

  async function uploadOne(file: File, folderId: string | null) {
    setUploadError(null);
    const tempId = crypto.randomUUID();
    setPendingUploads((prev) => [...prev, { id: tempId, name: file.name }]);
    try {
      const presigned = await initiate.mutateAsync({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentLength: file.size,
        folderId,
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

  async function handleLooseFiles(list: FileList | File[] | null) {
    if (!list) return;
    const items = Array.from(list as FileList);
    if (items.length === 0) return;
    await Promise.all(items.map((f) => uploadOne(f, currentFolderId)));
    await utils.adminWorkspace.filesList.invalidate();
  }

  async function handlePathedFiles(items: Array<{ file: File; path: string[] }>) {
    if (items.length === 0) return;
    setUploadError(null);
    try {
      const folderCache = new Map<string, string | null>();
      folderCache.set('', currentFolderId);

      async function resolveFolderId(segments: string[]): Promise<string | null> {
        let parent: string | null = currentFolderId;
        const path: string[] = [];
        for (const seg of segments) {
          path.push(seg);
          const key = path.join('/');
          const cached = folderCache.get(key);
          if (cached !== undefined) {
            parent = cached;
            continue;
          }
          const ensured = await folderEnsure.mutateAsync({
            name: seg,
            parentId: parent,
          });
          folderCache.set(key, ensured.id);
          parent = ensured.id;
        }
        return parent;
      }

      await Promise.all(
        items.map(async (item) => {
          const folderId = await resolveFolderId(item.path);
          await uploadOne(item.file, folderId);
        }),
      );
    } finally {
      await Promise.all([
        utils.adminWorkspace.filesList.invalidate(),
        utils.adminWorkspace.foldersList.invalidate(),
      ]);
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      await handleLooseFiles(e.dataTransfer.files);
      return;
    }
    const pathed: Array<{ file: File; path: string[] }> = [];
    const entries = Array.from(items)
      .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
      .filter((e): e is FileSystemEntry => !!e);
    await Promise.all(entries.map((entry) => walkEntry(entry, [], pathed)));
    if (pathed.length > 0) {
      await handlePathedFiles(pathed);
    } else {
      await handleLooseFiles(e.dataTransfer.files);
    }
  }

  async function handleDirectoryPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const pathed: Array<{ file: File; path: string[] }> = [];
    for (const f of Array.from(list)) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/').filter(Boolean);
      const fileName = parts.pop() ?? f.name;
      pathed.push({ file: new File([f], fileName, { type: f.type }), path: parts });
    }
    await handlePathedFiles(pathed);
  }

  function handleRemove(resourceId: string) {
    remove.mutate(
      { resourceId },
      {
        onSuccess: () => {
          void utils.adminWorkspace.filesList.invalidate();
        },
      },
    );
  }

  function handleReplace(resourceId: string) {
    setUploadError(null);
    pendingReplaceResourceId.current = resourceId;
    replaceInputRef.current?.click();
  }

  async function runReplace(resourceId: string, file: File) {
    setReplacingResourceId(resourceId);
    setUploadError(null);
    try {
      const presigned = await initiateReplace.mutateAsync({
        resourceId,
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
      await confirmReplace.mutateAsync({ versionId: presigned.versionId });
      await utils.adminWorkspace.filesList.invalidate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setReplacingResourceId(null);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await folderCreate.mutateAsync({ name, parentId: currentFolderId });
    setNewFolderName('');
    setNewFolderOpen(false);
    await utils.adminWorkspace.foldersList.invalidate();
  }

  function handleFolderDelete(folderId: string) {
    folderDelete.mutate(
      { folderId },
      {
        onSuccess: async () => {
          await Promise.all([
            utils.adminWorkspace.foldersList.invalidate(),
            utils.adminWorkspace.filesList.invalidate(),
          ]);
        },
      },
    );
  }

  const isSearching = search.trim().length > 0;

  return (
    <AdminPageBody>
      <div className="flex flex-col gap-6">
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
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between gap-4 border-b border-zinc-100 p-6">
            <div>
              <p className="text-sm font-medium leading-5 text-black">Workspace files</p>
              <p className="mt-1 text-sm font-medium leading-5 text-zinc-600">
                PDF, DOCX, MD, TXT, CSV — up to 100 MB each. Visible only inside
                this workspace. Drop folders to preserve your directory structure.
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
                onClick={() => setNewFolderOpen(true)}
                className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <FolderPlus className="size-4" />
                New folder
              </button>
              <button
                type="button"
                onClick={() => dirInputRef.current?.click()}
                className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <FolderIcon className="size-4" />
                Upload folder
              </button>
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
                  void handleLooseFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={dirInputRef}
                type="file"
                hidden
                multiple
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                onChange={(e) => {
                  void handleDirectoryPick(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={replaceInputRef}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const resourceId = pendingReplaceResourceId.current;
                  pendingReplaceResourceId.current = null;
                  e.target.value = '';
                  if (file && resourceId) {
                    void runReplace(resourceId, file);
                  }
                }}
              />
            </div>
          </div>

          {!isSearching && (
            <Breadcrumb
              trail={breadcrumb}
              onGoHome={() => setCurrentFolderId(null)}
              onGoTo={(id) => setCurrentFolderId(id)}
            />
          )}

          {newFolderOpen && !isSearching && (
            <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-6 py-3">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreateFolder();
                  if (e.key === 'Escape') {
                    setNewFolderOpen(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="Folder name"
                className="flex-1 rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
              <button
                type="button"
                onClick={() => void handleCreateFolder()}
                disabled={!newFolderName.trim() || folderCreate.isPending}
                className="rounded-[8px] bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName('');
                }}
                className="rounded-[8px] border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              >
                Cancel
              </button>
            </div>
          )}

          {uploadError && (
            <div className="border-b border-zinc-100 bg-red-50 px-6 py-2 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          <div className="px-6 pb-2 pt-5">
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <span>{isSearching ? 'Search results' : 'Name'}</span>
              <span>Status</span>
            </div>
          </div>

          <ul className="flex flex-col">
            {!isSearching &&
              subfolders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-4 border-t border-zinc-100 px-6 py-4"
                >
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(f.id)}
                    className="flex min-w-0 items-center gap-4 text-left"
                  >
                    <div className="grid size-[42px] shrink-0 place-items-center rounded-[8px] bg-amber-50">
                      <FolderIcon className="size-5 text-amber-600" />
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-sm font-medium text-zinc-800">
                        {f.name}
                      </p>
                      <p className="text-sm text-zinc-500">Folder</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFolderDelete(f.id)}
                    disabled={folderDelete.isPending}
                    className="ml-auto inline-flex items-center gap-2 rounded-[10px] bg-red-50 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Delete
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}

            {pendingUploads.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 border-t border-zinc-100 px-6 py-4"
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
              <li className="border-t border-zinc-100 px-6 py-8 text-center text-sm text-zinc-500">
                Loading…
              </li>
            )}

            {!filesQuery.isLoading &&
              files.length === 0 &&
              subfolders.length === 0 &&
              pendingUploads.length === 0 && (
                <li className="border-t border-zinc-100 px-6 py-14 text-center">
                  <p className="text-sm font-medium text-zinc-800">
                    {isSearching ? 'No files match your search' : 'This folder is empty'}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Drop files or a folder here, or use the upload buttons above.
                  </p>
                </li>
              )}

            {files.map((file) => {
              const isReplacing = replacingResourceId === file.id;
              const version = file.versionNumber ?? null;
              return (
                <li
                  key={file.id}
                  className="flex items-center gap-4 border-t border-zinc-100 px-6 py-4"
                >
                  <FileIcon />
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-800">
                        {file.name}
                      </p>
                      {version !== null && version > 1 && (
                        <span
                          title={`Replaced on ${file.lastReplacedAt ? new Date(file.lastReplacedAt).toLocaleDateString() : 'unknown date'}`}
                          className="rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-0 text-[10px] font-semibold text-zinc-600"
                        >
                          v{version}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{formatSize(file.fileSize)}</p>
                  </div>
                  <StatusBadge status={file.ingestStatus} />
                  <button
                    type="button"
                    onClick={() => handleReplace(file.id)}
                    disabled={isReplacing || replacingResourceId !== null}
                    className="ml-auto inline-flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Replace with a new version — old version remains cited by any past answers"
                  >
                    {isReplacing ? (
                      <>
                        Replacing…
                        <Loader2 className="size-3.5 animate-spin" />
                      </>
                    ) : (
                      <>
                        Replace
                        <RefreshCw className="size-3.5" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(file.id)}
                    disabled={remove.isPending || isReplacing}
                    className="inline-flex items-center gap-2 rounded-[10px] bg-red-50 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Remove
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </AdminPageBody>
  );
}

function Breadcrumb({
  trail,
  onGoHome,
  onGoTo,
}: {
  trail: FolderRow[];
  onGoHome: () => void;
  onGoTo: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 bg-zinc-50 px-6 py-3 text-sm">
      <button
        type="button"
        onClick={onGoHome}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-zinc-700 hover:bg-white"
      >
        <Home className="size-3.5" />
        All files
      </button>
      {trail.map((f, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-zinc-400" />
            {isLast ? (
              <span className="rounded-md px-2 py-1 font-medium text-zinc-900">
                {f.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoTo(f.id)}
                className="rounded-md px-2 py-1 text-zinc-700 hover:bg-white"
              >
                {f.name}
              </button>
            )}
          </span>
        );
      })}
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

async function walkEntry(
  entry: FileSystemEntry,
  parentPath: string[],
  out: Array<{ file: File; path: string[] }>,
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    out.push({ file, path: parentPath });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    await Promise.all(
      children.map((child) => walkEntry(child, [...parentPath, entry.name], out)),
    );
  }
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const read = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) return resolve(out);
        out.push(...entries);
        read();
      }, reject);
    };
    read();
  });
}
