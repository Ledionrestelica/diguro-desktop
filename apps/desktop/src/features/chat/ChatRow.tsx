import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Check, FolderInput, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
import type { ChatFolderRow, ConversationSummary } from './types';

/** Custom drag MIME so only chat rows are recognised as droppable payloads. */
export const CHAT_DRAG_TYPE = 'application/x-diguro-chat';

interface Props {
  chat: ConversationSummary;
  active: boolean;
  folders: ChatFolderRow[];
}

export function ChatRow({ chat, active, folders }: Props) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);

  const rename = trpc.conversations.rename.useMutation({
    onSuccess: () => {
      void utils.conversations.list.invalidate();
      void utils.conversations.get.invalidate({ id: chat.id });
    },
  });
  const deleteChat = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      void utils.conversations.list.invalidate();
      if (active) void navigate('/chat');
    },
  });
  const move = trpc.conversations.moveToFolder.useMutation({
    onSuccess: () => void utils.conversations.list.invalidate(),
  });

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = draftTitle.trim();
          if (trimmed && trimmed !== chat.title) {
            rename.mutate({ id: chat.id, title: trimmed });
          }
          setRenaming(false);
        }}
      >
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRenaming(false);
          }}
          className="w-full rounded-[10px] bg-white px-2.5 py-1 text-sm text-zinc-800 shadow-xs outline-none ring-1 ring-zinc-300"
        />
      </form>
    );
  }

  return (
    <NavLink
      to={`/chat/${chat.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CHAT_DRAG_TYPE, chat.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'group flex items-center rounded-[10px] py-0.5 pl-2.5 pr-0 text-sm text-zinc-800 transition-colors',
        active ? 'bg-white shadow-xs' : 'hover:bg-black/[0.04]',
      )}
    >
      <span className="flex-1 truncate leading-5">{chat.title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat actions"
            onClick={(e) => e.preventDefault()}
            className={cn(
              'grid size-8 place-items-center text-zinc-600 transition-opacity',
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDraftTitle(chat.title);
              setRenaming(true);
            }}
          >
            <Pencil className="size-3.5" /> Rename
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="size-3.5" /> Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-48 overflow-y-auto">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  if (chat.folderId !== null) {
                    move.mutate({ conversationId: chat.id, folderId: null });
                  }
                }}
              >
                {chat.folderId === null && <Check className="size-3.5" />}
                <span className={cn(chat.folderId !== null && 'pl-[1.375rem]')}>
                  No folder
                </span>
              </DropdownMenuItem>
              {folders.length > 0 && <DropdownMenuSeparator />}
              {folders.map((folder) => {
                const current = chat.folderId === folder.id;
                return (
                  <DropdownMenuItem
                    key={folder.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (!current) {
                        move.mutate({ conversationId: chat.id, folderId: folder.id });
                      }
                    }}
                  >
                    {current && <Check className="size-3.5" />}
                    <span className={cn('truncate', !current && 'pl-[1.375rem]')}>
                      {folder.name}
                    </span>
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
              deleteChat.mutate({ id: chat.id });
            }}
          >
            <Trash2 className="size-3.5" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </NavLink>
  );
}
