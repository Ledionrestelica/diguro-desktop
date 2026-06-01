import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  FolderClosed,
  FolderPlus,
  MoreHorizontal,
  Palette,
  PenLine,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrgSwitcher } from './OrgSwitcher';
import { CHAT_DRAG_TYPE, ChatRow } from './ChatRow';
import type { ChatFolderRow, ConversationSummary } from './types';

/** Preset folder colours. Stored as the hex string on chat_folders.color. */
const FOLDER_COLORS: { name: string; value: string }[] = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
];

interface Props {
  activeChatId: string | null;
}

export function ChatSidebar({ activeChatId }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const utils = trpc.useUtils();
  const conversations = trpc.conversations.list.useQuery();
  const foldersQuery = trpc.conversations.foldersList.useQuery();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const createFolder = trpc.conversations.folderCreate.useMutation({
    onSuccess: () => {
      void utils.conversations.foldersList.invalidate();
      setCreating(false);
      setNewName('');
    },
  });

  const onMyFiles = location.pathname.startsWith('/my-files');

  const folders = foldersQuery.data ?? [];
  const chats = conversations.data ?? [];
  const folderIds = new Set(folders.map((f) => f.id));
  const byFolder = new Map<string, ConversationSummary[]>();
  const ungrouped: ConversationSummary[] = [];
  for (const chat of chats) {
    if (chat.folderId && folderIds.has(chat.folderId)) {
      const arr = byFolder.get(chat.folderId) ?? [];
      arr.push(chat);
      byFolder.set(chat.folderId, arr);
    } else {
      ungrouped.push(chat);
    }
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-6 overflow-hidden bg-[#f4f4f5] px-2 py-6">
      <div className="shrink-0 space-y-6">
        <OrgSwitcher />

        <nav className="flex flex-col gap-1.5">
          <SidebarButton icon={<PenLine className="size-4" />} onClick={() => navigate('/chat')}>
            New chat
          </SidebarButton>
          <SidebarButton
            icon={<FolderClosed className="size-4" />}
            onClick={() => navigate('/my-files')}
            variant={onMyFiles ? 'filled' : 'ghost'}
          >
            My files
          </SidebarButton>
          <SidebarButton
            icon={<Search className="size-4" />}
            onClick={() => {
              /* search overlay — v1.1 */
            }}
          >
            Search chats
          </SidebarButton>
        </nav>
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between px-3.5">
          <p className="text-xs leading-5 text-zinc-600">Chats</p>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={() => {
              setNewName('');
              setCreating(true);
            }}
            className="grid size-5 place-items-center rounded text-zinc-500 transition-colors hover:bg-black/[0.06] hover:text-zinc-800"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>

        {conversations.isLoading && <p className="px-3.5 text-xs text-zinc-500">Loading…</p>}

        <div className="scrollbar-thin flex flex-col gap-1 overflow-y-auto pr-1">
          {creating && (
            <form
              className="px-1"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newName.trim();
                if (trimmed) createFolder.mutate({ name: trimmed });
                else setCreating(false);
              }}
            >
              <input
                autoFocus
                value={newName}
                placeholder="Folder name"
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => setCreating(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCreating(false);
                }}
                className="w-full rounded-[10px] bg-white px-2.5 py-1 text-sm text-zinc-800 shadow-xs outline-none ring-1 ring-zinc-300"
              />
            </form>
          )}

          {folders.map((folder) => (
            <FolderSection
              key={folder.id}
              folder={folder}
              chats={byFolder.get(folder.id) ?? []}
              activeChatId={activeChatId}
              folders={folders}
            />
          ))}

          <UngroupedZone>
            <ul className="flex flex-col gap-0.5">
              {ungrouped.map((chat) => (
                <li key={chat.id}>
                  <ChatRow chat={chat} active={chat.id === activeChatId} folders={folders} />
                </li>
              ))}
            </ul>
          </UngroupedZone>

          {chats.length === 0 && folders.length === 0 && !conversations.isLoading && (
            <p className="px-3.5 text-xs text-zinc-500">No chats yet.</p>
          )}
        </div>
      </section>
    </aside>
  );
}

/** Drop handling shared by folder headers and the ungrouped zone. */
function useChatDrop(folderId: string | null) {
  const utils = trpc.useUtils();
  const move = trpc.conversations.moveToFolder.useMutation({
    onSuccess: () => void utils.conversations.list.invalidate(),
  });
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(CHAT_DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(CHAT_DRAG_TYPE);
        if (id) move.mutate({ conversationId: id, folderId });
      },
    },
  };
}

interface FolderSectionProps {
  folder: ChatFolderRow;
  chats: ConversationSummary[];
  activeChatId: string | null;
  folders: ChatFolderRow[];
}

function FolderSection({ folder, chats, activeChatId, folders }: FolderSectionProps) {
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const { over, handlers } = useChatDrop(folder.id);

  const rename = trpc.conversations.folderRename.useMutation({
    onSuccess: () => {
      void utils.conversations.foldersList.invalidate();
      setRenaming(false);
    },
  });
  const remove = trpc.conversations.folderDelete.useMutation({
    onSuccess: () => {
      void utils.conversations.foldersList.invalidate();
      void utils.conversations.list.invalidate();
    },
  });
  const setColor = trpc.conversations.folderSetColor.useMutation({
    onSuccess: () => void utils.conversations.foldersList.invalidate(),
  });

  return (
    <div>
      {renaming ? (
        <form
          className="px-1"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (trimmed && trimmed !== folder.name) {
              rename.mutate({ folderId: folder.id, name: trimmed });
            } else setRenaming(false);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="w-full rounded-[10px] bg-white px-2.5 py-1 text-sm text-zinc-800 shadow-xs outline-none ring-1 ring-zinc-300"
          />
        </form>
      ) : (
        <div
          {...handlers}
          className={cn(
            'group flex items-center rounded-[10px] py-0.5 pl-1 pr-0 text-sm text-zinc-700 transition-colors',
            over ? 'bg-cyan-50 ring-1 ring-cyan-300' : 'hover:bg-black/[0.04]',
          )}
        >
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex min-w-0 flex-1 items-center gap-1 text-left"
          >
            <ChevronRight
              className={cn('size-3.5 shrink-0 transition-transform', !collapsed && 'rotate-90')}
            />
            <FolderClosed
              className="size-3.5 shrink-0 text-zinc-500"
              style={folder.color ? { color: folder.color } : undefined}
            />
            <span className="truncate font-medium">{folder.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Folder actions"
                className="grid size-8 shrink-0 place-items-center text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setDraft(folder.name);
                  setRenaming(true);
                }}
              >
                <Pencil className="size-3.5" /> Rename
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="size-3.5" /> Color
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      if (folder.color !== null) {
                        setColor.mutate({ folderId: folder.id, color: null });
                      }
                    }}
                  >
                    {folder.color === null ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="size-3.5 rounded-full border border-zinc-300 bg-white" />
                    )}
                    Default
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {FOLDER_COLORS.map((c) => {
                    const current = folder.color === c.value;
                    return (
                      <DropdownMenuItem
                        key={c.value}
                        onSelect={(e) => {
                          e.preventDefault();
                          if (!current) {
                            setColor.mutate({ folderId: folder.id, color: c.value });
                          }
                        }}
                      >
                        {current ? (
                          <Check className="size-3.5" style={{ color: c.value }} />
                        ) : (
                          <span
                            className="size-3.5 rounded-full"
                            style={{ backgroundColor: c.value }}
                          />
                        )}
                        {c.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  remove.mutate({ folderId: folder.id });
                }}
              >
                <Trash2 className="size-3.5" /> Delete folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {!collapsed && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {chats.length === 0 ? (
            <li className="px-2.5 py-1 text-xs text-zinc-400">Empty</li>
          ) : (
            chats.map((chat) => (
              <li key={chat.id}>
                <ChatRow chat={chat} active={chat.id === activeChatId} folders={folders} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Drop target for "remove from folder" — wraps the loose chat list. */
function UngroupedZone({ children }: { children: React.ReactNode }) {
  const { over, handlers } = useChatDrop(null);
  return (
    <div
      {...handlers}
      className={cn('rounded-[10px] transition-colors', over && 'bg-cyan-50 ring-1 ring-cyan-300')}
    >
      {children}
    </div>
  );
}

interface SidebarButtonProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'filled';
}

function SidebarButton({ icon, children, onClick, variant = 'ghost' }: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center cursor-pointer gap-0 rounded-[10px] pr-3 text-left text-sm text-zinc-800 transition-colors',
        variant === 'filled' ? 'bg-white shadow-xs hover:bg-white/80' : 'hover:bg-black/4',
      )}
    >
      <span className="grid size-8 place-items-center">{icon}</span>
      <span className="flex-1 truncate leading-5">{children}</span>
    </button>
  );
}
