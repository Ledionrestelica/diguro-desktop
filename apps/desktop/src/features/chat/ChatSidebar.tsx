import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MoreHorizontal, PenLine, Pencil, Search, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OrgSwitcher } from './OrgSwitcher';
import type { ConversationSummary } from './types';

interface Props {
  activeChatId: string | null;
}

export function ChatSidebar({ activeChatId }: Props) {
  const navigate = useNavigate();
  const conversations = trpc.conversations.list.useQuery();

  return (
    <aside className="flex h-full w-53 shrink-0 flex-col gap-6 overflow-hidden bg-[#f4f4f5] px-2 py-6">
      <div className="shrink-0 space-y-6">
        <OrgSwitcher />

        <nav className="flex flex-col gap-1.5">
          <SidebarButton icon={<PenLine className="size-4" />} onClick={() => navigate('/chat')}>
            New chat
          </SidebarButton>
          <SidebarButton
            icon={<Search className="size-4" />}
            variant="filled"
            onClick={() => {
              /* search overlay — v1.1 */
            }}
          >
            Search chats
          </SidebarButton>
        </nav>
      </div>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 px-3.5 text-xs leading-5 text-zinc-600">Chats</p>

        {conversations.isLoading && <p className="px-3.5 text-xs text-zinc-500">Loading…</p>}

        {conversations.data && conversations.data.length === 0 && (
          <p className="px-3.5 text-xs text-zinc-500">No chats yet.</p>
        )}

        <ul className="scrollbar-thin flex flex-col gap-0.5 overflow-y-auto pr-1">
          {conversations.data?.map((chat) => (
            <li key={chat.id}>
              <ChatRow chat={chat} active={chat.id === activeChatId} />
            </li>
          ))}
        </ul>
      </section>
    </aside>
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

function ChatRow({ chat, active }: { chat: ConversationSummary; active: boolean }) {
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
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDraftTitle(chat.title);
              setRenaming(true);
            }}
          >
            <Pencil className="size-3.5" /> Rename
          </DropdownMenuItem>
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
