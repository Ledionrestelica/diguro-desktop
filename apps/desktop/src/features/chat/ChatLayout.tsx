import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import type { UIMessage } from 'ai';
import { trpc } from '@/lib/trpc';
import { ChatSidebar } from './ChatSidebar';
import { TopBar } from './TopBar';
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
    initialMessages,
    onFinish: () => {
      void utils.conversations.list.invalidate();
      if (!isNewChat) void utils.conversations.get.invalidate({ id: chatId });
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
      navigate(`/chat/${chatId}`, { replace: true });
      void utils.conversations.list.invalidate();
    }
  }, [isNewChat, session.messages.length, chatId, navigate, utils]);

  // When useChat is mounted with id but no initial messages, and then the
  // conversation data arrives, hydrate it in.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNewChat) {
      hydratedRef.current = null;
      return;
    }
    if (!initialMessages) return;
    if (hydratedRef.current === chatId) return;
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
