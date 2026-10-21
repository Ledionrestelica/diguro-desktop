import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
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
import { OrgAvatar } from './OrgAvatar';
import { FluidList } from '@/components/fluid/FluidList';

type AppSidebarProps = {
  activeChatId: string | null;
  /** Conversation whose reply is streaming right now (shows a spinner). */
  runningChatId?: string | null;
  onCollapse?: () => void;
  /** Open with the chat search already active (from the collapsed rail). */
  startSearch?: boolean;
};

/** The app sidebar (Figma "Chat - Final · New Sidebar"): sits on the app's
 *  gray, rows are pills, the chat area is a white card beside it. */
export function AppSidebar({
  activeChatId,
  runningChatId = null,
  onCollapse,
  startSearch = false,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = trpc.health.me.useQuery();
  const conversations = trpc.conversations.list.useQuery();
  const foldersQuery = trpc.conversations.foldersList.useQuery();
  const [search, setSearch] = useState<string | null>(startSearch ? '' : null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (startSearch) requestAnimationFrame(() => searchInput.current?.focus());
  }, [startSearch]);

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
    <aside className="group/sidebar flex h-full w-[288px] shrink-0 flex-col font-inter text-text antialiased">
      <div className="flex shrink-0 flex-col gap-7 px-4 pt-5">
        <div className="flex h-9 items-center justify-between">
          <button
            type="button"
            onClick={() => void navigate('/workspaces')}
            className="flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-full border border-gray-4 bg-bg-panel pr-3 pl-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none hover:bg-gray-2 focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
            title="Switch workspace"
          >
            <OrgAvatar org={org} />
            <span className="truncate text-label-14 font-semibold">{org?.name ?? 'Iserana'}</span>
            <PiChevronSortVerticalStroke size={12} className="shrink-0 text-text-secondary" />
          </button>
          {onCollapse && (
            <button
              type="button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={onCollapse}
              className="grid size-7 cursor-pointer place-items-center rounded-[7px] text-text-secondary opacity-0 outline-none group-hover/sidebar:opacity-100 hover:bg-hover hover:text-text focus-visible:opacity-100 focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
            >
              <PiSidebarLeftCloseStroke size={16} />
            </button>
          )}
        </div>

        <FluidList highlightClassName="rounded-[16px]">
          <nav className="flex flex-col gap-1">
            <SidebarItem
              hug
              fluidKey="nav-new-chat"
              icon={<PiPlusDefaultStroke />}
              label="New chat"
              className="text-text"
              onClick={() => void navigate('/chat')}
            />
            {search === null ? (
              <SidebarItem
                hug
                fluidKey="nav-search"
                icon={<PiSearchDefaultStroke />}
                label="Search"
                trailing="⌘K"
                onClick={() => {
                  setSearch('');
                  requestAnimationFrame(() => searchInput.current?.focus());
                }}
              />
            ) : (
              <label className="flex h-9 items-center gap-2.5 rounded-[10px] border border-focus-ring bg-bg-panel px-2.5 shadow-[0_0_0_3px_var(--color-selection)]">
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
              hug
              fluidKey="nav-files"
              icon={<PiFolderDefaultStroke />}
              label="Files"
              tone={location.pathname.startsWith('/my-files') ? 'active' : 'default'}
              onClick={() => void navigate('/my-files')}
            />
            <CustomInstructionsButton
              align="start"
              trigger={
                <div>
                  <SidebarItem
                    hug
                    fluidKey="nav-instructions"
                    icon={<PiSparkleAI02Stroke />}
                    label="Custom instructions"
                  />
                </div>
              }
            />
          </nav>
        </FluidList>
      </div>

      <div className="scrollbar-thin mt-7 min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        <FluidList className="flex flex-col gap-7" highlightClassName="rounded-[16px]">
          {!query && <WorkspaceList />}
          {(folders.length > 0 || !query) && (
            <ProjectList
              folders={folders}
              chatsByFolder={chatsByFolder}
              activeChatId={activeChatId}
              runningChatId={runningChatId}
            />
          )}
          <section className="flex flex-col gap-1">
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
        </FluidList>
      </div>

      <div className="px-4">
        <UserFooter />
      </div>
    </aside>
  );
}
