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
import { persistCitationsFromMessage } from '../services/chat/citations.ts';
import { createUITools } from '../ai/ui-tools/index.ts';
import { createRetrievalTool } from '../ai/retrieval-tool.ts';
import { mapDomainError } from '../trpc/error-mapper.ts';
import { Unauthorized } from '@diguro/shared/errors';
import type { Logger } from '../lib/logger.ts';
import type { Db } from '@diguro/db';
import type { ObjectStore } from '../ports/objectStore.ts';
import type { EmbedProvider } from '../ports/embedProvider.ts';
import type { RerankProvider } from '../ports/rerankProvider.ts';

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
const CHAT_SYSTEM_PROMPT_BASE = [
  'You are Diguro, a helpful assistant. Be concise.',
  '',
  '# Web search',
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
  '',
  '# Generative UI tools',
  'You can render rich UI inline by calling one of these tools exactly once per response:',
  '- `render_chart` — numerical data you want visualized (trends, distributions, comparisons across 3+ categories).',
  '- `render_table` — structured lists (invoices, line items, extracted entities, 2+ rows of the same shape).',
  '- `render_document_card` — surface a single document with title/excerpt/tags.',
  '- `render_comparison` — side-by-side diff of two documents, contracts, versions, or options.',
  '- `render_extraction_form` — extracted fields from a document (key/value pairs the user may want to copy).',
  '',
  'Rules:',
  '- Use a UI tool when the data is clearly structured. Skip it for narrative or conceptual answers.',
  '- Never call more than one UI tool per response.',
  '- After calling a UI tool, add ONE short sentence (max ~20 words) framing or summarizing the result. Do NOT repeat the data as markdown — the tool call IS the rendering.',
  '- Do NOT combine web_search and a UI tool in the same response unless the user explicitly asked for both.',
].join('\n');

const RETRIEVAL_SYSTEM_PROMPT_ADDITION = [
  '',
  '# Organization knowledge base — your primary job',
  'This product exists to answer questions over the organization\'s uploaded documents (policies, contracts, minutes, permits, financials, runbooks, etc.) using the `search_documents` tool.',
  '',
  '## Default behavior: search first, talk later',
  'On any user question that could plausibly be answered by an internal document, **your first action is always to call `search_documents`**. Do NOT ask the user to clarify which policy, which document, or which system — just search. Clarifying questions belong AFTER you\'ve seen retrieval results, not before.',
  '',
  'The user is already inside their organization\'s app. When they ask "What\'s the minimum password length?", "What\'s our late fee?", "When did we sign with Acme?" — these are ALWAYS about this organization\'s documents. Do not hedge. Do not list generic NIST guidance. Do not ask which system. **Search.**',
  '',
  'Search your best-guess interpretation first. If results come back and match, answer with citations. If results are empty or irrelevant, only THEN explain what you searched and ask the user to disambiguate.',
  '',
  '## When it is OK to skip search',
  'Only skip `search_documents` for:',
  '- Pure greetings or small-talk ("hi", "thanks").',
  '- Direct follow-ups referencing a chunk already retrieved in this conversation (already in your working context).',
  '- Meta questions about the assistant itself ("what can you do").',
  '',
  'If you\'re unsure whether to search, SEARCH. Searching is cheap. Making the user repeat themselves is expensive and breaks trust.',
  '',
  '## Search technique',
  '- Rephrase the user\'s question in retrieval-friendly terms: specific nouns ("late fee", "noise ordinance", "grace period"), known entities ("Globex", "Acme"), policy-style vocabulary.',
  '- If your first search returns nothing relevant, try ONE different phrasing. Don\'t loop more than twice.',
  '- Never call the same query twice in a row.',
  '',
  '## Citations',
  '- When you use a passage from a retrieved chunk, cite it inline using `[cite:<chunkId>]`. Example: "The minimum is 14 characters [cite:abc-123]."',
  '- Cite every factual claim that came from a retrieved chunk. Do not invent chunkIds — only use ones returned by `search_documents`.',
  '- If retrieval returned nothing useful, say so plainly: "I couldn\'t find this in the uploaded documents." Then ask for clarification or suggest the user upload the relevant file.',
  '- Do NOT pad with generic industry guidance when the user asked about THEIR docs and retrieval came up empty. Say you couldn\'t find it.',
].join('\n');

interface Deps {
  auth: Auth;
  registry: ModelRegistry;
  db: Db;
  logger: Logger;
  objectStore: ObjectStore;
  embedProvider: EmbedProvider;
  rerankProvider: RerankProvider | null;
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

    const body: unknown = await c.req.json().catch(() => null);
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
          workspaceId: null,
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

      const nativeTools = deps.registry.nativeTools(modelId, { webSearch: true });
      const uiTools = createUITools();

      // Retrieval tool is scope-bound per request. We close over the
      // caller's organizationId so the model physically cannot query a
      // different org's files. When workspace-scoped chats land, this is
      // where we'd resolve the scope from conversation.workspaceId.
      const organizationId =
        (session.user as { organizationId?: string | null }).organizationId ?? null;
      const retrievalTools = organizationId
        ? {
            search_documents: createRetrievalTool({
              db: deps.db,
              embedProvider: deps.embedProvider,
              rerankProvider: deps.rerankProvider,
              logger: deps.logger,
              scope: { kind: 'organization', organizationId },
            }),
          }
        : {};

      const tools = { ...(nativeTools ?? {}), ...uiTools, ...retrievalTools };

      // Compose the system prompt. The retrieval addition only ships when
      // the user has an organization — otherwise the tool isn't attached
      // and the addition would be misleading.
      const systemPrompt = organizationId
        ? CHAT_SYSTEM_PROMPT_BASE + RETRIEVAL_SYSTEM_PROMPT_ADDITION
        : CHAT_SYSTEM_PROMPT_BASE;

      deps.logger.info('chat request tools', {
        conversationId,
        modelId,
        toolsAttached: Object.keys(tools),
        hasRetrieval: Boolean(organizationId),
      });

      const result = await streamReply(
        { registry: deps.registry },
        {
          modelId,
          messages: resolvedMessages,
          systemPrompt,
          tools,
          // With retrieval in play we need room for: (optional) 1-2
          // search calls, their results, follow-up reasoning, and the
          // final answer. 5 steps gives headroom without runaway cost.
          maxSteps: 5,
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
            const [persistedMessage] = saved.messages;
            deps.logger.info('persisted assistant message', {
              conversationId,
              modelId,
              // Log the ID we actually wrote, not the (often empty) UIMessage.id.
              persistedMessageId: persistedMessage?.id ?? null,
              rowsSaved: saved.inserted,
              partTypes: responseMessage.parts.map((p) => p.type),
            });

            // Citations: parse [cite:chunkId] markers in the assistant's
            // text parts, verify the chunkIds exist, write Citation rows.
            // Link to the DB-generated id, not responseMessage.id (which
            // can be empty from AI-SDK v6 → ensureId auto-assigns).
            if (persistedMessage) {
              try {
                const citationCount = await persistCitationsFromMessage(
                  { db: deps.db },
                  {
                    messageId: persistedMessage.id,
                    parts: persistedMessage.parts,
                  },
                );
                if (citationCount > 0) {
                  deps.logger.info('persisted citations', {
                    conversationId,
                    messageId: persistedMessage.id,
                    citations: citationCount,
                  });
                }
              } catch (citErr) {
                deps.logger.warn('citation persist failed (non-fatal)', {
                  conversationId,
                  error:
                    citErr instanceof Error ? citErr.message : String(citErr),
                });
              }
            }
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
    const sanitized =
      m.role === 'assistant' ? stripEphemeralAssistantParts(resolvedParts) : resolvedParts;
    out.push({ ...m, parts: sanitized } as UIMessage);
  }
  return out;
}

/**
 * Drop parts from an assistant message that the provider can't safely replay,
 * and strip provider-specific metadata from anything we keep.
 *
 *  - `reasoning` parts carry server-side item ids (e.g. OpenAI `rs_...`). When
 *    we echo them back, the Responses API tries to look them up and 404s if
 *    the items have aged out.
 *  - `tool-<name>` parts carry tool invocation state (call ids, provider
 *    metadata, search results). The model doesn't need to "remember" past
 *    tool calls — the user sees the rendered output and asks follow-ups in
 *    plain text.
 *  - Text parts from OpenAI carry `providerMetadata.openai.itemId = msg_...`
 *    which references the companion reasoning item. Stripping reasoning
 *    without also stripping these back-references makes OpenAI reject the
 *    replay with "message provided without its required reasoning item".
 *    So we null out providerMetadata on every part we keep.
 *
 * Kept: text (content only), source-url, file.
 */
function stripEphemeralAssistantParts<T extends { type: string }>(parts: T[]): T[] {
  const out: T[] = [];
  for (const p of parts) {
    if (p.type === 'reasoning') continue;
    if (p.type.startsWith('tool-')) continue;
    // Clone without providerMetadata — prevents OpenAI from trying to
    // resolve msg_/rs_ cross-references that no longer exist.
    const { providerMetadata: _unused, ...rest } = p as T & {
      providerMetadata?: unknown;
    };
    out.push(rest as T);
  }
  return out;
}
