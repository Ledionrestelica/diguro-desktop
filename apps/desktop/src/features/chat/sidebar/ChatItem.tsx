import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { PiThreeDotsMenuHorizontalStroke } from '@/components/icons/pika/PiThreeDotsMenuHorizontalStroke';
import { PiPencilEditStroke } from '@/components/icons/pika/PiPencilEditStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiDeleteDustbin02Stroke } from '@/components/icons/pika/PiDeleteDustbin02Stroke';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import type { ChatFolderRow, ConversationSummary } from '../types';
import { SidebarItem } from './SidebarItem';
import { Spinner } from './Spinner';
import { RenameField } from './RenameField';

/** Custom drag MIME so only chat rows are recognised as droppable payloads. */
export const CHAT_DRAG_TYPE = 'application/x-diguro-chat';

type ChatItemProps = {
  chat: ConversationSummary;
  active: boolean;
  running: boolean;
  folders: ChatFolderRow[];
};

export function ChatItem({ chat, active, running, folders }: ChatItemProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = useState(false);

  const rename = trpc.conversations.rename.useMutation({
    onSuccess: () => {
      void utils.conversations.list.invalidate();
      void utils.conversations.get.invalidate({ id: chat.id });
    },
  });
  const remove = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      if (active) void navigate('/chat');
      utils.conversations.list.setData(undefined, (prev) =>
        prev?.filter((c) => c.id !== chat.id),
      );
      void utils.conversations.list.invalidate();
    },
  });
  const move = trpc.conversations.moveToFolder.useMutation({
    onSuccess: () => void utils.conversations.list.invalidate(),
  });

  if (renaming) {
    return (
      <RenameField
        initial={chat.title}
        onDone={(title) => {
          setRenaming(false);
          if (title && title !== chat.title) rename.mutate({ id: chat.id, title });
        }}
      />
    );
  }

  return (
    <SidebarItem
      compact
      fluidKey={`chat-${chat.id}`}
      label={chat.title}
      tone={active ? 'active' : 'default'}
      aria-current={active ? 'page' : undefined}
      onClick={() => void navigate(`/chat/${chat.id}`)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CHAT_DRAG_TYPE, chat.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      {...(running ? { trailing: <Spinner /> } : {})}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Chat actions"
            className={cn(
              'grid size-5 cursor-pointer place-items-center rounded-[5px] text-text-secondary outline-none hover:bg-selected data-[state=open]:bg-selected data-[state=open]:opacity-100',
              'opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100',
            )}
          >
            <PiThreeDotsMenuHorizontalStroke size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 font-inter">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <PiPencilEditStroke size={16} /> Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PiFolderDefaultStroke size={16} /> Move to project
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-48 overflow-y-auto font-inter">
                <DropdownMenuItem
                  onSelect={() =>
                    chat.folderId !== null &&
                    move.mutate({ conversationId: chat.id, folderId: null })
                  }
                >
                  <MenuCheck on={chat.folderId === null} /> No project
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onSelect={() =>
                      chat.folderId !== folder.id &&
                      move.mutate({ conversationId: chat.id, folderId: folder.id })
                    }
                  >
                    <MenuCheck on={chat.folderId === folder.id} />
                    <span className="truncate">{folder.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate({ id: chat.id })}>
              <PiDeleteDustbin02Stroke size={16} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}

function MenuCheck({ on }: { on: boolean }) {
  return on ? <PiCheckTickSingleStroke size={16} /> : <span className="size-4" />;
}
