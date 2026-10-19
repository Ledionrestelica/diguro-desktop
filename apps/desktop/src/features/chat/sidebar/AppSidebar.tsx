import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { OrganizationMark } from '@/features/organization/OrganizationMark';
import { PiChevronSortVerticalStroke } from '@/components/icons/pika/PiChevronSortVerticalStroke';
import { PiSidebarLeftCloseStroke } from '@/components/icons/pika/PiSidebarLeftCloseStroke';
import { PiPlusDefaultStroke } from '@/components/icons/pika/PiPlusDefaultStroke';
import { PiSearchDefaultStroke } from '@/components/icons/pika/PiSearchDefaultStroke';
import { PiFolderDefaultStroke } from '@/components/icons/pika/PiFolderDefaultStroke';
import { PiSparkleAI02Stroke } from '@/components/icons/pika/PiSparkleAI02Stroke';
import { CustomInstructionsButton } from '../CustomInstructionsButton';
import type { ConversationSummary } from '../types';
import { SidebarIconButton, SidebarItem, SidebarSectionHeader } from './SidebarItem';
import { WorkspaceList } from './WorkspaceList';
import { DropZone, ProjectList } from './ProjectList';
import { ChatItem } from './ChatItem';
import { UserFooter } from './UserFooter';

type AppSidebarProps = {
  activeChatId: string | null;
  /** Conversation whose reply is streaming right now (shows a spinner). */
  runningChatId?: string | null;
  onCollapse?: () => void;
};

/** The redesigned app sidebar (Figma "Chat - Final" › Sidebar). */
export function AppSidebar({ activeChatId, runningChatId = null, onCollapse }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = trpc.health.me.useQuery();
  const conversations = trpc.conversations.list.useQuery();
  const foldersQuery = trpc.conversations.foldersList.useQuery();
  const [search, setSearch] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch((s) => s ?? '');
        requestAnimationFrame(() => searchInput.current?.focus());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const org = me.data?.organization;
  const folders = foldersQuery.data ?? [];
  const query = search?.trim().toLowerCase() ?? '';
  const chats = (conversations.data ?? []).filter(
    (c) => !query || c.title.toLowerCase().includes(query),
  );
  const folderIds = new Set(folders.map((f) => f.id));
  const chatsByFolder = new Map<string, ConversationSummary[]>();
  const loose: ConversationSummary[] = [];
  for (const chat of chats) {
    if (chat.folderId && folderIds.has(chat.folderId)) {
      chatsByFolder.set(chat.folderId, [...(chatsByFolder.get(chat.folderId) ?? []), chat]);
    } else loose.push(chat);
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-gray-3 bg-bg-panel font-inter text-text antialiased">
      <div className="flex shrink-0 flex-col gap-[18px] px-3 pt-3">
        <div className="flex h-8 items-center justify-between">
          <button
            type="button"
            onClick={() => void navigate('/workspaces')}
            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-[8px] pr-1 outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
            title="Switch workspace"
          >
            {org?.logoUrl ? (
              <OrganizationMark
                logoUrl={org.logoUrl}
                seed={org.id}
                size={24}
                alt=""
                className="rounded-full"
              />
            ) : (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-label-12 font-semibold text-text-on-solid">
                {(org?.name ?? 'I').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-label-14 font-semibold">{org?.name ?? 'Iserana'}</span>
            <PiChevronSortVerticalStroke size={12} className="shrink-0 text-text-secondary" />
          </button>
          {onCollapse && (
            <button
              type="button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={onCollapse}
              className="grid size-7 cursor-pointer place-items-center rounded-[7px] text-text-secondary outline-none hover:bg-hover hover:text-text focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
            >
              <PiSidebarLeftCloseStroke size={16} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void navigate('/chat')}
          className="flex h-[34px] cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border border-[#e7e7e7] bg-bg-panel text-button-14 text-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
        >
          <PiPlusDefaultStroke size={16} />
          New chat
        </button>

        <nav className="flex flex-col gap-px">
          {search === null ? (
            <SidebarItem
              icon={<PiSearchDefaultStroke />}
              label="Search"
              trailing="⌘K"
              onClick={() => {
                setSearch('');
                requestAnimationFrame(() => searchInput.current?.focus());
              }}
            />
          ) : (
            <label className="flex h-8 items-center gap-2.5 rounded-[8px] border border-focus-ring px-2 shadow-[0_0_0_3px_var(--color-selection)]">
              <PiSearchDefaultStroke size={16} className="shrink-0 text-text-secondary" />
              <input
                ref={searchInput}
                value={search}
                placeholder="Search chats"
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => !search && setSearch(null)}
                onKeyDown={(e) => e.key === 'Escape' && setSearch(null)}
                className="min-w-0 flex-1 bg-transparent text-label-14 font-medium text-text outline-none placeholder:text-text-placeholder"
              />
            </label>
          )}
          <SidebarItem
            icon={<PiFolderDefaultStroke />}
            label="Files"
            tone={location.pathname.startsWith('/my-files') ? 'active' : 'default'}
            onClick={() => void navigate('/my-files')}
          />
          <CustomInstructionsButton
            align="start"
            trigger={
              <div>
                <SidebarItem icon={<PiSparkleAI02Stroke />} label="Custom instructions" />
              </div>
            }
          />
        </nav>
      </div>

      <div className="scrollbar-thin mt-[18px] flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-3 pb-3">
        {!query && <WorkspaceList />}
        {(folders.length > 0 || !query) && (
          <ProjectList
            folders={folders}
            chatsByFolder={chatsByFolder}
            activeChatId={activeChatId}
            runningChatId={runningChatId}
          />
        )}
        <section className="flex flex-col gap-px">
          <SidebarSectionHeader
            label="Chats"
            action={
              <SidebarIconButton label="New chat" onClick={() => void navigate('/chat')}>
                <PiPlusDefaultStroke size={14} />
              </SidebarIconButton>
            }
          />
          <DropZone folderId={null}>
            {loose.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                folders={folders}
                active={chat.id === activeChatId}
                running={chat.id === runningChatId}
              />
            ))}
          </DropZone>
          {conversations.isLoading && (
            <p className="px-2 py-1 text-label-13 text-text-placeholder">Loading…</p>
          )}
          {!conversations.isLoading && loose.length === 0 && (
            <p className={cn('px-2 py-1 text-label-13 text-text-placeholder')}>
              {query ? 'No chats match your search.' : 'Your chats will appear here.'}
            </p>
          )}
        </section>
      </div>

      <UserFooter />
    </aside>
  );
}
