import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo } from 'react';
import { authStore } from '@/lib/auth-store';
import { API_URL } from '@/lib/api-url';

interface Options {
  /** Stable id for this conversation — drives useChat's internal state key. */
  id: string;
  /** Hydrate the chat with persisted messages when opening an existing conversation. */
  initialMessages?: UIMessage[];
  /** Called after the assistant finishes; use to invalidate sidebar list, etc. */
  onFinish?: () => void;
}

/**
 * Wraps AI-SDK's useChat with:
 *   - bearer token injection on every request (pulled from the Electron keychain)
 *   - a conversation id that becomes both the useChat key and the row id in DB
 *   - optional initial messages hydrated from @diguro/api conversations.get
 */
export function useChatSession({ id, initialMessages, onFinish }: Options) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/chat`,
        fetch: async (input, init) => {
          const token = await authStore.get();
          return fetch(input, {
            ...init,
            credentials: 'omit',
            headers: {
              ...(init?.headers as Record<string, string> | undefined),
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
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
