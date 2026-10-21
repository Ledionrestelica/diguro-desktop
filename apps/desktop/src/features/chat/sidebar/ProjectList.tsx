import { useState, type DragEvent, type ReactNode } from 'react';
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
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiFolderOpenStroke } from '@/components/icons/pika/PiFolderOpenStroke';
import { PiPlusDefaultStroke } from '@/components/icons/pika/PiPlusDefaultStroke';
import { PiThreeDotsMenuHorizontalStroke } from '@/components/icons/pika/PiThreeDotsMenuHorizontalStroke';
import { PiPencilEditStroke } from '@/components/icons/pika/PiPencilEditStroke';
import { PiDeleteDustbin02Stroke } from '@/components/icons/pika/PiDeleteDustbin02Stroke';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import type { ChatFolderRow, ConversationSummary } from '../types';
import { SidebarIconButton, SidebarItem, SidebarSectionHeader } from './SidebarItem';
import { CHAT_DRAG_TYPE, ChatItem } from './ChatItem';
import { RenameField } from './RenameField';

/** Preset project colours, stored as hex on chat_folders.color. */
const PROJECT_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
];

type ProjectListProps = {
  folders: ChatFolderRow[];
  chatsByFolder: Map<string, ConversationSummary[]>;
  activeChatId: string | null;
  runningChatId: string | null;
};

/** "Projects" = chat folders. Each expands into its chats on a guide line. */
export function ProjectList({
  folders,
  chatsByFolder,
  activeChatId,
  runningChatId,
}: ProjectListProps) {
  const utils = trpc.useUtils();
  const [creating, setCreating] = useState(false);
  const create = trpc.conversations.folderCreate.useMutation({
    onSuccess: () => void utils.conversations.foldersList.invalidate(),
  });

  return (
    <section className="flex flex-col gap-1">
      <SidebarSectionHeader
        label="Folders"
        action={
          <SidebarIconButton label="New folder" onClick={() => setCreating(true)}>
            <PiPlusDefaultStroke size={14} />
          </SidebarIconButton>
        }
      />
      {creating && (
        <RenameField
          initial=""
          placeholder="Folder name"
          onDone={(name) => {
            setCreating(false);
            if (name) create.mutate({ name });
          }}
        />
      )}
      {folders.map((folder) => (
        <Project
          key={folder.id}
          folder={folder}
          folders={folders}
          chats={chatsByFolder.get(folder.id) ?? []}
          activeChatId={activeChatId}
          runningChatId={runningChatId}
        />
      ))}
      {folders.length === 0 && !creating && (
        <button
          type="button"
          data-fluid-ignore
          onClick={() => setCreating(true)}
          className="mx-0.5 cursor-pointer rounded-[8px] border border-dashed border-border px-3 py-2.5 text-left text-copy-14 text-text-secondary hover:bg-hover"
        >
          Group related chats, like “Q4 audit”.
        </button>
      )}
    </section>
  );
}

function Project({
  folder,
  folders,
  chats,
  activeChatId,
  runningChatId,
}: {
  folder: ChatFolderRow;
  folders: ChatFolderRow[];
  chats: ConversationSummary[];
  activeChatId: string | null;
  runningChatId: string | null;
}) {
  const utils = trpc.useUtils();
  const containsActive = chats.some((c) => c.id === activeChatId);
  const [open, setOpen] = useState(containsActive);
  const [renaming, setRenaming] = useState(false);
  const drop = useChatDrop(folder.id);

  const rename = trpc.conversations.folderRename.useMutation({
    onSuccess: () => void utils.conversations.foldersList.invalidate(),
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

  const expanded = open || containsActive;
  const FolderIcon = expanded ? PiFolderOpenStroke : PiFolderDefaultStroke;

  return (
    <div {...drop.handlers} className={cn('rounded-[10px]', drop.over && 'bg-selection')}>
      {renaming ? (
        <RenameField
          initial={folder.name}
          onDone={(name) => {
            setRenaming(false);
            if (name && name !== folder.name) rename.mutate({ folderId: folder.id, name });
          }}
        />
      ) : (
        <SidebarItem
          hug
          fluidKey={`project-${folder.id}`}
          icon={
            <FolderIcon size={16} {...(folder.color ? { style: { color: folder.color } } : {})} />
          }
          label={folder.name}
          className={cn(expanded && 'text-text')}
          aria-expanded={expanded}
          onClick={() => setOpen(!expanded)}
          {...(!expanded && chats.length > 0 ? { trailing: chats.length } : {})}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Folder actions"
                className="grid size-5 cursor-pointer place-items-center rounded-[5px] text-text-secondary opacity-0 outline-none group-hover/item:opacity-100 hover:bg-selected focus-visible:opacity-100 data-[state=open]:bg-selected data-[state=open]:opacity-100"
              >
                <PiThreeDotsMenuHorizontalStroke size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44 font-inter">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>
                  <PiPencilEditStroke size={16} /> Rename
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ColorDot color={folder.color} />
                    Colour
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40 font-inter">
                    <DropdownMenuItem
                      onSelect={() =>
                        folder.color !== null &&
                        setColor.mutate({ folderId: folder.id, color: null })
                      }
                    >
                      {folder.color === null ? (
                        <PiCheckTickSingleStroke size={16} />
                      ) : (
                        <ColorDot color={null} />
                      )}
                      Default
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {PROJECT_COLORS.map((c) => (
                      <DropdownMenuItem
                        key={c.value}
                        onSelect={() =>
                          folder.color !== c.value &&
                          setColor.mutate({ folderId: folder.id, color: c.value })
                        }
                      >
                        {folder.color === c.value ? (
                          <PiCheckTickSingleStroke size={16} style={{ color: c.value }} />
                        ) : (
                          <ColorDot color={c.value} />
                        )}
                        {c.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => remove.mutate({ folderId: folder.id })}
                >
                  <PiDeleteDustbin02Stroke size={16} /> Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      )}
      {expanded && (
        <div className="pl-[15px]">
          <div className="flex flex-col gap-px border-l-[1.5px] border-border pl-2">
            {chats.length === 0 ? (
              <p data-fluid-ignore className="px-2 py-1.5 text-label-13 text-text-placeholder">
                Drag chats here
              </p>
            ) : (
              chats.map((chat) => (
                <ChatItem
                  key={chat.id}
                  chat={chat}
                  folders={folders}
                  active={chat.id === activeChatId}
                  running={chat.id === runningChatId}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A 12px swatch centred in the 16px icon slot, so labels line up with the
 *  check mark and the other menu icons. */
function ColorDot({ color }: { color: string | null }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center">
      <span
        className={cn('size-3 rounded-full', !color && 'border border-border')}
        style={{ backgroundColor: color ?? 'transparent' }}
      />
    </span>
  );
}

/** Drop target for moving a chat into a project (or out, with null). */
export function useChatDrop(folderId: string | null) {
  const utils = trpc.useUtils();
  const move = trpc.conversations.moveToFolder.useMutation({
    onSuccess: () => void utils.conversations.list.invalidate(),
  });
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(CHAT_DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData(CHAT_DRAG_TYPE);
        if (id) move.mutate({ conversationId: id, folderId });
      },
    },
  };
}

export function DropZone({ folderId, children }: { folderId: string | null; children: ReactNode }) {
  const { over, handlers } = useChatDrop(folderId);
  return (
    <div {...handlers} className={cn('rounded-[10px]', over && 'bg-selection')}>
      {children}
    </div>
  );
}
