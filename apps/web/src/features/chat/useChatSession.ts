import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo } from 'react';
import { API_URL } from '@/lib/api';

/**
 * Web-side useChatSession — same shape as the desktop hook, cookie
 * sessions instead of bearer tokens. Aliased in vite.config so desktop
 * components importing `@/features/chat/useChatSession` during a web
 * build get this version transparently.
 */

interface Options {
  id: string;
  initialMessages?: UIMessage[];
  onFinish?: () => void;
}

export function useChatSession({ id, initialMessages, onFinish }: Options) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/chat`,
        fetch: async (input, init) => {
          return fetch(input, {
            ...(init as RequestInit),
            credentials: 'include',
          });
        },
      }),
    [],
  );

  return useChat({
    id,
    transport,
    ...(initialMessages ? { messages: initialMessages } : {}),
    ...(onFinish ? { onFinish } : {}),
  });
}

export type ChatSession = ReturnType<typeof useChatSession>;
