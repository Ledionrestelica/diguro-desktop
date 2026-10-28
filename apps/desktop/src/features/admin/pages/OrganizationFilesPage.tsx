import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PiChevronRightStroke } from '@/components/icons/pika/PiChevronRightStroke';
import { PiFileTextStroke } from '@/components/icons/pika/PiFileTextStroke';
import { PiFolderPlusStroke } from '@/components/icons/pika/PiFolderPlusStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiHomeDefaultStroke } from '@/components/icons/pika/PiHomeDefaultStroke';
import { PiRefreshStroke } from '@/components/icons/pika/PiRefreshStroke';
import { PiSearchDefaultStroke } from '@/components/icons/pika/PiSearchDefaultStroke';
import { PiDeleteDustbin02Stroke } from '@/components/icons/pika/PiDeleteDustbin02Stroke';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { dsButtonClass } from '@/components/ui/ds-button';
import { Input } from '@/components/ui/input';
import { AdminPageBody } from '../AdminPageBody';
import { DsBadge, type DsBadgeColor } from '@/components/ui/ds-badge';

/**
 * Organization-scoped file library — documents uploaded here are available
 * to every workspace in the organization for RAG. The library is organized
 * in folders (nestable). Drag-and-drop supports both loose files and entire
 * directory trees; directories are mirrored into folders on upload.
 */
const TRANSIENT_STATUSES = new Set(['PENDING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING']);

interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export function OrganizationFilesPage() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();

  const foldersQuery = trpc.adminOrganization.foldersList.useQuery();

  // When searching, scan all folders by omitting folderId entirely.
  // Otherwise restrict to the current folder (null = root).
  const filesQueryInput = useMemo(() => {
    const trimmed = search.trim();
    if (trimmed) return { search: trimmed };
    return { folderId: currentFolderId };
  }, [search, currentFolderId]);

  const filesQuery = trpc.adminOrganization.filesList.useQuery(filesQueryInput, {
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const anyTransient = data.some(
        (f) => f.ingestStatus && TRANSIENT_STATUSES.has(f.ingestStatus),
      );
      return anyTransient ? 2000 : false;
    },
  });

  const initiate = trpc.adminOrganization.filesInitiateUpload.useMutation();
  const confirm = trpc.adminOrganization.filesConfirmUpload.useMutation();
  const initiateReplace = trpc.adminOrganization.filesInitiateReplace.useMutation();
  const confirmReplace = trpc.adminOrganization.filesConfirmReplace.useMutation();
  const remove = trpc.adminOrganization.filesRemove.useMutation();
  const folderCreate = trpc.adminOrganization.folderCreate.useMutation();
  const folderEnsure = trpc.adminOrganization.folderEnsure.useMutation();
  const folderDelete = trpc.adminOrganization.folderDelete.useMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; name: string }>>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // Per-row replace state: resourceId of whichever file is mid-replace so
  // its row can show a spinner + disable the buttons. Only one replace
  // runs at a time — simpler UX than parallel replaces across rows.
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
    const files = Array.from(list as FileList);
    if (files.length === 0) return;
    await Promise.all(files.map((f) => uploadOne(f, currentFolderId)));
    await utils.adminOrganization.filesList.invalidate();
  }

  /**
   * Upload files that carry a relative path (directory picker / drag-drop).
   * We walk each file's path segments, ensuring a folder per segment under
   * the current folder, then upload the file into its matching leaf folder.
   */
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
        utils.adminOrganization.filesList.invalidate(),
        utils.adminOrganization.foldersList.invalidate(),
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
          void utils.adminOrganization.filesList.invalidate();
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
      await utils.adminOrganization.filesList.invalidate();
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
    await utils.adminOrganization.foldersList.invalidate();
  }

  function handleFolderDelete(folderId: string) {
    folderDelete.mutate(
      { folderId },
      {
        onSuccess: async () => {
          await Promise.all([
            utils.adminOrganization.foldersList.invalidate(),
            utils.adminOrganization.filesList.invalidate(),
          ]);
        },
      },
    );
  }

  const isSearching = search.trim().length > 0;

  return (
    <AdminPageBody>
      <div
        className="flex flex-col gap-5"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col gap-3">
          <p className="text-label-13 text-text-secondary">
            PDF, DOCX, MD, TXT, CSV — up to 100 MB each. Drop folders to preserve your directory
            structure.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-60">
              <PiSearchDefaultStroke className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-placeholder" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search files"
                className="h-8 pl-8 text-label-13"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className={SECONDARY_BUTTON}
              >
                <PiFolderPlusStroke className="size-4" />
                New folder
              </button>
              <button
                type="button"
                onClick={() => dirInputRef.current?.click()}
                className={SECONDARY_BUTTON}
              >
                <PiFolderDefaultStroke className="size-4" />
                Upload folder
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={initiate.isPending}
                className={PRIMARY_BUTTON}
              >
                <PiUploadUpStroke className="size-4" />
                Upload files
              </button>
            </div>
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

        {newFolderOpen && !isSearching && (
          <div className="enter-rise flex items-center gap-2">
            <Input
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
              className="h-8 flex-1 text-label-13"
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              disabled={!newFolderName.trim() || folderCreate.isPending}
              className={PRIMARY_BUTTON}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setNewFolderOpen(false);
                setNewFolderName('');
              }}
              className={SECONDARY_BUTTON}
            >
              Cancel
            </button>
          </div>
        )}

        {uploadError && (
          <div className="enter-rise rounded-[10px] bg-danger-subtle px-3 py-2 text-label-13 text-danger-text">
            {uploadError}
          </div>
        )}

        {!isSearching && (
          <Breadcrumb
            trail={breadcrumb}
            onGoHome={() => setCurrentFolderId(null)}
            onGoTo={(id) => setCurrentFolderId(id)}
          />
        )}

        {!isSearching && subfolders.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {subfolders.map((f) => (
              <div
                key={f.id}
                className="group flex items-center gap-1 rounded-[12px] border border-border-default py-1.5 pr-1.5 pl-3 transition-colors hover:bg-hover"
              >
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(f.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-1 text-left outline-none"
                >
                  <PiFolderDefaultStroke className="size-4 shrink-0 text-text-secondary" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-label-14 font-medium text-text">{f.name}</span>
                    <span className="text-label-12 text-text-secondary">Folder</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleFolderDelete(f.id)}
                  disabled={folderDelete.isPending}
                  aria-label={`Delete folder ${f.name}`}
                  title="Delete folder"
                  className={cn(ICON_BUTTON, 'hover:text-danger-text')}
                >
                  <PiDeleteDustbin02Stroke className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <section
          className={cn(
            'overflow-hidden rounded-[16px] border transition-colors',
            isDraggingOver ? 'border-focus-ring bg-selected' : 'border-border-default',
          )}
        >
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-label-14">
              <thead className="text-label-12 text-text-placeholder">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">
                    {isSearching ? 'Search results' : 'Name'}
                  </th>
                  <th className="w-36 px-5 py-2.5 text-left font-medium">Status</th>
                  <th className="w-24 px-5 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingUploads.map((p) => (
                  <tr key={p.id} className="border-t border-border-default">
                    <td className="px-5 py-3">
                      <FileCell name={p.name} meta="Uploading…" />
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <Loader2 strokeWidth={1.5} className="size-3.5 animate-spin" />
                        Uploading
                      </span>
                    </td>
                    <td />
                  </tr>
                ))}

                {filesQuery.isLoading && pendingUploads.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="border-t border-border-default px-5 py-6 text-center text-text-secondary"
                    >
                      Loading…
                    </td>
                  </tr>
                )}

                {!filesQuery.isLoading &&
                  files.length === 0 &&
                  subfolders.length === 0 &&
                  pendingUploads.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="border-t border-border-default px-5 py-10 text-center"
                      >
                        <p className="font-medium text-text">
                          {isSearching ? 'No files match your search' : 'This folder is empty'}
                        </p>
                        <p className="mt-1 text-label-13 text-text-secondary">
                          Drop files or a folder here, or use the upload buttons above.
                        </p>
                      </td>
                    </tr>
                  )}

                {!filesQuery.isLoading &&
                  files.length === 0 &&
                  subfolders.length > 0 &&
                  pendingUploads.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="border-t border-border-default px-5 py-6 text-center text-label-13 text-text-secondary"
                      >
                        No files in this folder yet.
                      </td>
                    </tr>
                  )}

                {files.map((file) => {
                  const isReplacing = replacingResourceId === file.id;
                  const version = file.versionNumber ?? null;
                  return (
                    <tr key={file.id} className="border-t border-border-default">
                      <td className="px-5 py-3">
                        <FileCell
                          name={file.name}
                          meta={formatSize(file.fileSize)}
                          badge={
                            version !== null && version > 1 ? (
                              <DsBadge
                                title={`Replaced on ${file.lastReplacedAt ? new Date(file.lastReplacedAt).toLocaleDateString() : 'unknown date'}`}
                              >
                                v{version}
                              </DsBadge>
                            ) : null
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={file.ingestStatus} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleReplace(file.id)}
                            disabled={isReplacing || replacingResourceId !== null}
                            aria-label={`Replace ${file.name}`}
                            title="Replace with a new version — old version remains cited by any past answers"
                            className={ICON_BUTTON}
                          >
                            {isReplacing ? (
                              <Loader2 strokeWidth={1.5} className="size-4 animate-spin" />
                            ) : (
                              <PiRefreshStroke className="size-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(file.id)}
                            disabled={remove.isPending || isReplacing}
                            aria-label={`Remove ${file.name}`}
                            title="Remove"
                            className={cn(ICON_BUTTON, 'hover:text-danger-text')}
                          >
                            <PiDeleteDustbin02Stroke className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminPageBody>
  );
}

const PRIMARY_BUTTON = dsButtonClass({ variant: 'primary' });

const SECONDARY_BUTTON = dsButtonClass();

const ICON_BUTTON =
  'grid size-8 shrink-0 place-items-center rounded-[8px] text-text-secondary outline-none transition-colors hover:bg-hover hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40';

function FileCell({ name, meta, badge }: { name: string; meta: string; badge?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-bg-subtle">
        <PiFileTextStroke className="size-4 text-text-secondary" />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-text">{name}</span>
          {badge}
        </div>
        <span className="text-label-12 text-text-secondary">{meta}</span>
      </div>
    </div>
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
    <nav className="-my-1 flex flex-wrap items-center gap-0.5 text-label-13">
      <button
        type="button"
        onClick={onGoHome}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 transition-colors hover:bg-hover',
          trail.length === 0 ? 'font-medium text-text' : 'text-text-secondary',
        )}
      >
        <PiHomeDefaultStroke className="size-3.5" />
        All files
      </button>
      {trail.map((f, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={f.id} className="flex items-center gap-0.5">
            <PiChevronRightStroke className="size-3.5 text-text-placeholder" />
            {isLast ? (
              <span className="px-2 py-1 font-medium text-text">{f.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onGoTo(f.id)}
                className="rounded-[8px] px-2 py-1 text-text-secondary transition-colors hover:bg-hover"
              >
                {f.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const config = statusConfig(status);
  return (
    <DsBadge color={config.color} dot pulse={config.busy}>
      {config.label}
    </DsBadge>
  );
}

function statusConfig(status: string | null): {
  label: string;
  color: DsBadgeColor;
  busy: boolean;
} {
  switch (status) {
    case 'DONE':
      return { label: 'Ready', color: 'green', busy: false };
    case 'FAILED':
      return { label: 'Failed', color: 'red', busy: false };
    case 'PENDING':
    case 'EXTRACTING':
    case 'CHUNKING':
    case 'EMBEDDING':
      // Internal pipeline stages aren't meaningful to users — collapse
      // to a single "Processing" label.
      return { label: 'Processing', color: 'blue', busy: true };
    case 'PENDING_UPLOAD':
      return { label: 'Uploading', color: 'gray', busy: true };
    default:
      return { label: 'Unknown', color: 'gray', busy: false };
  }
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Recursively walk a dropped FileSystemEntry, collecting (file, pathSegments)
 * tuples. Directories turn into path segments so our caller can mirror them
 * into folders during upload.
 */
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
    await Promise.all(children.map((child) => walkEntry(child, [...parentPath, entry.name], out)));
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
