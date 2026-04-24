import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo } from 'react';

/**
 * Web-side useChatSession — same shape as the desktop hook, cookie
 * sessions instead of bearer tokens. Aliased in vite.config so desktop
 * components importing `@/features/chat/useChatSession` during a web
 * build get this version transparently.
 *
 * The API path is deliberately hardcoded as a relative URL so no env
 * override (VITE_API_URL, stale browser cache, etc.) can force the
 * request off-origin. Vite's dev proxy forwards `/api/*` to the API; in
 * prod an edge rewrite routes the same path to the API service. The
 * `credentials: 'include'` on our fetch wrapper attaches Better-Auth's
 * cookie so `auth.api.getSession` picks it up server-side.
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
        api: '/api/chat',
        // Belt-and-suspenders: set credentials at both the transport level
        // and in the fetch wrapper. Some AI-SDK paths build a Request
        // internally that doesn't honor a second-arg init override; having
        // credentials on the transport means the Request is constructed
        // with them baked in.
        credentials: 'include',
        fetch: async (input, init) => {
          const merged: RequestInit = {
            ...(init as RequestInit),
            credentials: 'include',
          };
          return fetch(input, merged);
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
