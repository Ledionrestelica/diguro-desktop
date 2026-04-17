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
import { resolveAttachmentUrlsInParts } from '../services/chat/attachments.ts';
import { generateAndApplyConversationTitle } from '../services/chat/generate-title.ts';
import { mapDomainError } from '../trpc/error-mapper.ts';
import { Unauthorized } from '@diguro/shared/errors';
import type { Logger } from '../lib/logger.ts';
import type { Db } from '@diguro/db';
import type { ObjectStore } from '../ports/objectStore.ts';

const ChatRequestSchema = z.object({
  id: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
  modelId: z.string().optional(),
});

/**
 * System prompt kept strict about tool usage to bound cost. Provider-native
 * web_search is billed per call with per-token snippet overhead — rule of
 * thumb is ~1-2k input tokens added per search at searchContextSize=low.
 */
const CHAT_SYSTEM_PROMPT = [
  'You are Diguro, a helpful assistant. Be concise.',
  '',
  'Web search (`web_search`) is available but expensive. Use it ONLY when:',
  '- The user explicitly asks you to look something up, OR',
  '- The answer depends on events, prices, releases, or facts that likely changed after your training, OR',
  '- You genuinely do not know and guessing would mislead the user.',
  '',
  'Do NOT search for:',
  '- General knowledge you already have (definitions, explanations, well-known facts).',
  '- Coding questions, math, reasoning tasks, creative writing.',
  '- Anything the user\'s own uploaded files or prior messages already cover.',
  '',
  'When you do search: run at most one query, keep it focused, then answer.',
  'Cite sources naturally (the system attaches the URLs automatically).',
].join('\n');

interface Deps {
  auth: Auth;
  registry: ModelRegistry;
  db: Db;
  logger: Logger;
  objectStore: ObjectStore;
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
      const firstUserText = extractFirstUserText(messages);
      const upsertResult = await upsertConversation(
        { db: deps.db },
        {
          conversationId,
          userId: session.user.id,
          organizationId: null,
          modelId,
          firstUserText,
        },
      );

      // On first creation only, fire-and-forget AI-generated title.
      // Runs in parallel with streaming — doesn't block first-token latency.
      if (upsertResult.isNew && firstUserText) {
        void generateAndApplyConversationTitle(
          { registry: deps.registry, db: deps.db, logger: deps.logger },
          { conversationId, firstUserText },
        );
      }

      const newestUser = lastMessage(messages);
      if (newestUser && newestUser.role === 'user') {
        await persistUserMessage(
          { db: deps.db },
          { conversationId, message: newestUser },
        );
      }

      // Resolve chat:// URLs on file parts to presigned GET URLs for the model.
      // We only send the resolved version to the model — the DB keeps the
      // canonical chat:// URLs via persistUserMessage above.
      const resolvedMessages = await resolveMessagesForModel(
        { objectStore: deps.objectStore, userId: session.user.id },
        messages,
      );

      const tools = deps.registry.nativeTools(modelId, { webSearch: true });

      deps.logger.info('chat request tools', {
        conversationId,
        modelId,
        toolsAttached: tools ? Object.keys(tools) : [],
      });

      const result = await streamReply(
        { registry: deps.registry },
        {
          modelId,
          messages: resolvedMessages,
          systemPrompt: CHAT_SYSTEM_PROMPT,
          ...(tools ? { tools } : {}),
          maxSteps: 2,
        },
      );

      return result.toUIMessageStreamResponse({
        originalMessages: resolvedMessages,
        onFinish: async ({ responseMessage, isAborted }) => {
          if (isAborted) {
            deps.logger.info('chat stream aborted, skipping persist', { conversationId });
            return;
          }
          try {
            const saved = await persistAssistantMessages(
              { db: deps.db },
              { conversationId, modelId, messages: [responseMessage] },
            );
            deps.logger.info('persisted assistant message', {
              conversationId,
              modelId,
              responseMessageId: responseMessage.id,
              rowsSaved: saved,
              partTypes: responseMessage.parts.map((p) => p.type),
            });
          } catch (err) {
            deps.logger.error('failed to persist assistant messages', {
              conversationId,
              error: err instanceof Error ? err.message : String(err),
              partTypes: responseMessage.parts.map((p) => p.type),
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

async function resolveMessagesForModel(
  deps: { objectStore: ObjectStore; userId: string },
  messages: UIMessage[],
): Promise<UIMessage[]> {
  const out: UIMessage[] = [];
  for (const m of messages) {
    if (!Array.isArray(m.parts) || m.parts.length === 0) {
      out.push(m);
      continue;
    }
    const resolvedParts = await resolveAttachmentUrlsInParts(
      { objectStore: deps.objectStore },
      { userId: deps.userId, parts: m.parts },
    );
    out.push({ ...m, parts: resolvedParts } as UIMessage);
  }
  return out;
}
