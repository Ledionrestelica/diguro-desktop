import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { trpc } from '@/lib/trpc';
import { ChatSidebar } from './ChatSidebar';
import { TopBar } from './TopBar';
import { WorkspaceRail } from './WorkspaceRail';
import { useChatSession, type ChatSession } from './useChatSession';
import type { PersistedMessage } from './types';

export interface ChatOutletContext {
  chatId: string;
  session: ChatSession;
  /** True while the persisted conversation is being fetched (if any). */
  hydrating: boolean;
  /** True when this layout is rendering a "new chat" (no URL param yet). */
  isNewChat: boolean;
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
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafafa] text-foreground">
      <WorkspaceRail />
      <ChatSidebar activeChatId={paramChatId ?? null} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
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
