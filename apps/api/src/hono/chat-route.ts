import type { Context } from 'hono';
import { z } from 'zod';
import type { UIMessage } from 'ai';
import type { Auth } from '../auth/config.ts';
import type { ModelRegistry } from '../ai/registry.ts';
import { DEFAULT_CHAT_MODEL } from '../ai/registry.ts';
import { streamReply } from '../services/chat/stream-reply.ts';
import {
  extractFirstUserText,
  lastMessage,
  persistAssistantMessages,
  persistUserMessage,
  upsertConversation,
} from '../services/chat/persist.ts';
import { mapDomainError } from '../trpc/error-mapper.ts';
import { Unauthorized } from '@diguro/shared/errors';
import type { Logger } from '../lib/logger.ts';
import type { Db } from '@diguro/db';

const ChatRequestSchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string().optional(),
});

interface Deps {
  auth: Auth;
  registry: ModelRegistry;
  db: Db;
  logger: Logger;
}

/**
 * POST /api/chat — bearer-authed streaming chat endpoint consumed by
 * @ai-sdk/react's useChat on the desktop. Persists the conversation and
 * messages as they flow: upsert conversation + save user message before
 * streaming, save assistant message(s) in onFinish.
 */
export function handleChat(deps: Deps) {
  return async (c: Context): Promise<Response> => {
    const session = await deps.auth.api
      .getSession({ headers: c.req.raw.headers })
      .catch(() => null);

    if (!session) {
      const err = mapDomainError(new Unauthorized());
      return c.json({ error: err.message }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: 'Invalid chat request', issues: parsed.error.issues },
        400,
      );
    }

    const conversationId = parsed.data.id;
    const modelId = parsed.data.modelId ?? DEFAULT_CHAT_MODEL;
    const messages = parsed.data.messages as UIMessage[];

    try {
      await upsertConversation(
        { db: deps.db },
        {
          conversationId,
          userId: session.user.id,
          organizationId: null,
          modelId,
          firstUserText: extractFirstUserText(messages),
        },
      );

      const newestUser = lastMessage(messages);
      if (newestUser && newestUser.role === 'user') {
        await persistUserMessage(
          { db: deps.db },
          { conversationId, message: newestUser },
        );
      }

      const result = await streamReply(
        { registry: deps.registry },
        {
          modelId,
          messages,
          systemPrompt:
            'You are Diguro, a helpful assistant. Be concise and cite sources when available.',
        },
      );

      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        onFinish: async ({ responseMessage }) => {
          try {
            await persistAssistantMessages(
              { db: deps.db },
              { conversationId, modelId, messages: [responseMessage] },
            );
          } catch (err) {
            deps.logger.error('failed to persist assistant messages', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      });
    } catch (err) {
      const mapped = mapDomainError(err);
      deps.logger.warn('chat request failed', {
        userId: session.user.id,
        conversationId,
        modelId,
        message: mapped.message,
      });
      return c.json({ error: mapped.message }, 500);
    }
  };
}
