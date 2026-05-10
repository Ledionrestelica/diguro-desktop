import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsSuperadminBlocked, RedirectToPlatform } from '@/lib/role-gate';
import { useMediaQuery } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ChatSidebar } from './ChatSidebar';
import { TopBar } from './TopBar';
import { WorkspaceRail } from './WorkspaceRail';
// Absolute alias (not `./useChatSession`) so web's Vite alias override
// in apps/web/vite.config.ts can swap this file for the cookie-auth
// variant at build time. Relative imports bypass aliases.
import { useChatSession, type ChatSession } from '@/features/chat/useChatSession';
import type { MessageCitation, PersistedMessage } from './types';

export interface ChatOutletContext {
  chatId: string;
  session: ChatSession;
  /** True while the persisted conversation is being fetched (if any). */
  hydrating: boolean;
  /** True when this layout is rendering a "new chat" (no URL param yet). */
  isNewChat: boolean;
  /**
   * Citations parsed from assistant messages, keyed by message id. Only
   * populated for messages already persisted by the API — live-streamed
   * messages show `[cite:chunkId]` chips without source metadata until
   * the backend finishes and the query refetches.
   */
  citationsByMessageId: Map<string, MessageCitation[]>;
  /** The scope this conversation's retrieval tool searches. Null for a
   *  brand-new chat with no conversation row yet — composer uses its own
   *  default and the server locks it on first message. */
  conversationScope: 'organization' | 'workspace' | 'user' | null;
  /** Server-enforced: once the conversation has any message, scope is
   *  locked. Composer surfaces this with a lock indicator. */
  scopeLocked: boolean;
}

/**
 * Owns the chat session so state survives the /chat → /chat/:chatId transition.
 *
 * When the URL has :chatId we fetch its messages via tRPC and hydrate useChat
 * through setMessages once the query resolves. For a brand-new chat, we
 * generate a stable client id up front and let ChatPage call navigate()
 * after the first send — because this layout owns useChat, no state is lost.
 */
export function ChatLayout() {
  // Superadmins are platform-tier only — never enter chat. We check
  // the flag at the top (hook order matters) but defer the actual
  // early-return to AFTER every other hook has been called below, so
  // hook count stays stable across the loading → loaded transition.
  const isSuperadminBlocked = useIsSuperadminBlocked();

  const { chatId: paramChatId } = useParams();
  const navigate = useNavigate();

  // Stable fresh id for "new chat" screens. Regenerate when we land back on
  // /chat after previously holding a :chatId.
  const [freshId, setFreshId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!paramChatId) setFreshId(crypto.randomUUID());
  }, [paramChatId]);

  const chatId = paramChatId ?? freshId;
  const isNewChat = !paramChatId;

  const conversationQuery = trpc.conversations.get.useQuery(
    { id: chatId },
    { enabled: !isNewChat, retry: false },
  );

  const initialMessages = useMemo<UIMessage[] | undefined>(() => {
    if (isNewChat) return undefined;
    if (!conversationQuery.data) return undefined;
    return conversationQuery.data.messages.map(toUIMessage);
  }, [conversationQuery.data, isNewChat]);

  const citationsByMessageId = useMemo<Map<string, MessageCitation[]>>(() => {
    const m = new Map<string, MessageCitation[]>();
    const rows = conversationQuery.data?.messages ?? [];
    for (const row of rows) {
      if (row.citations && row.citations.length > 0) {
        m.set(row.id, row.citations);
      }
    }
    return m;
  }, [conversationQuery.data]);

  const utils = trpc.useUtils();

  const session = useChatSession({
    id: chatId,
    ...(initialMessages ? { initialMessages } : {}),
    onFinish: () => {
      void utils.conversations.list.invalidate();
      // Always invalidate the detail query. On a fresh chat we've already
      // flipped to /chat/:id by the time onFinish fires, so the cache entry
      // needs to re-fetch to include the just-persisted assistant message
      // for the next visit.
      void utils.conversations.get.invalidate({ id: chatId });
      // Refresh the spending cap snapshot so the composer's pre-send
      // banner reflects the cost just incurred. Otherwise the user only
      // learns they're over-cap on the NEXT send (server returns 4xx).
      void utils.health.usageSnapshot.invalidate();

      // Fallback re-invalidation: AI-generated titles run in parallel with
      // streaming on the server. They usually finish first, but if the
      // assistant is very fast, the title may still be writing when the
      // first invalidate above fires. Re-invalidating 2s later picks it up.
      setTimeout(() => {
        void utils.conversations.list.invalidate();
      }, 2000);
    },
  });

  // When user sends the first message in a /chat (no id) context, move to /chat/:id
  // so refresh/share works. We detect the transition by watching the messages count.
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!isNewChat) {
      navigatedRef.current = false;
      return;
    }
    if (session.messages.length > 0 && !navigatedRef.current) {
      navigatedRef.current = true;
      void navigate(`/chat/${chatId}`, { replace: true });
      void utils.conversations.list.invalidate();
    }
  }, [isNewChat, session.messages.length, chatId, navigate, utils]);

  // Hydrate useChat from the DB — but never clobber a session that already
  // has live content.
  //
  // This matters during the /chat → /chat/:id transition mid-stream: we
  // navigate as soon as the user message lands, which flips isNewChat and
  // triggers conversations.get. That query may resolve before the server's
  // onFinish has persisted the assistant reply, returning a stale
  // [user-only] snapshot. Overwriting the live session with it would drop
  // the streaming response.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNewChat) {
      hydratedRef.current = null;
      return;
    }
    if (!initialMessages) return;
    if (hydratedRef.current === chatId) return;

    // If useChat already has messages for this chatId (live stream or
    // preserved state), trust them over whatever DB returned. Mark as
    // hydrated so we don't keep trying every render.
    if (session.messages.length > 0) {
      hydratedRef.current = chatId;
      return;
    }

    hydratedRef.current = chatId;
    session.setMessages(initialMessages);
  }, [initialMessages, chatId, isNewChat, session]);

  const outletContext: ChatOutletContext = {
    chatId,
    session,
    hydrating: !isNewChat && conversationQuery.isLoading,
    isNewChat,
    citationsByMessageId,
    conversationScope: conversationQuery.data?.retrievalScope ?? null,
    // Locked once the conversation has messages (server-side rule). For
    // live sessions we also treat "any message in useChat state" as locked
    // — once the user has sent one, subsequent scope changes wouldn't
    // take effect because the server already stamped the row.
    scopeLocked:
      (conversationQuery.data?.messages.length ?? 0) > 0 ||
      session.messages.length > 0,
  };

  // Sidebar collapses into a drawer below 700px viewport width. The
  // workspace rail stays visible because it's narrow (and the only way to
  // switch workspaces from inside chat).
  const isNarrow = useMediaQuery('(max-width: 700px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer when the route changes on narrow screens — clicking
  // a conversation should drop you back to the chat pane, not leave the
  // overlay covering it.
  useEffect(() => {
    if (isNarrow) setSidebarOpen(false);
  }, [location.pathname, isNarrow]);

  // Bounce superadmins to the platform tier (post-hooks early return).
  if (isSuperadminBlocked) return <RedirectToPlatform />;

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
      <WorkspaceRail />

      {isNarrow ? (
        <>
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 z-40 bg-black/30"
            />
          )}
          <div
            className={cn(
              'absolute inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 ease-out',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <ChatSidebar activeChatId={paramChatId ?? null} />
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
            >
              <X className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <ChatSidebar activeChatId={paramChatId ?? null} />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          {...(isNarrow ? { onMenuClick: () => setSidebarOpen((v) => !v) } : {})}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
  );
}

function toUIMessage(row: PersistedMessage): UIMessage {
  const role = row.role === 'ASSISTANT' ? 'assistant' : row.role === 'TOOL' ? 'assistant' : 'user';
  return {
    id: row.id,
    role: role as UIMessage['role'],
    parts: row.parts as UIMessage['parts'],
  };
}
