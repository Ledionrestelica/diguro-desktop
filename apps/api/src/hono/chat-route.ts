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
import { recordUsage } from '../services/usage/record.ts';
import { assertUserWithinCap } from '../services/usage/limits.ts';
import { isKnownChatModel } from '../ai/model-catalog.ts';
import { mapDomainError } from '../trpc/error-mapper.ts';
import { eq, schema } from '@diguro/db';
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
  /**
   * Requested retrieval scope for a NEW conversation — applied on
   * first-create and then locked for the lifetime of the conversation.
   * Subsequent messages in the same chat reuse the stored value.
   */
  retrievalScope: z.enum(['organization', 'workspace', 'user']).optional(),
  /**
   * # mention: per-turn list of resource ids the model's retrieval should
   * be constrained to. v1 UI only ever sends 0 or 1, but the wire format
   * accepts an array so multi-mention is a UI-only change later.
   */
  mentionedResourceIds: z.array(z.string().min(1)).max(5).optional(),
});

/**
 * System prompt kept strict about tool usage to bound cost. Provider-native
 * web_search is billed per call with per-token snippet overhead — rule of
 * thumb is ~1-2k input tokens added per search at searchContextSize=low.
 */
const CHAT_SYSTEM_PROMPT_BASE = [
  'You are Diguro, a helpful assistant. Be concise.',
  '',
  '# Stay within your actual capabilities',
  'Never offer to do things you cannot actually do. Do not say "if you want, I can email this", "I can set a reminder", "I can schedule a meeting", "I can save this to a file", "I can run this code for you", "I can monitor this for changes", "I can notify you when…", "I can update the document", "I can call this API", or any similar offer for actions outside your toolset.',
  '',
  'Your real capabilities in this app are:',
  '- Read and answer from the user\'s uploaded documents (via the `search_documents` tool, when available).',
  '- Look up live information on the public web (via `web_search`, when available — sparingly, see rules below).',
  '- Render structured results inline using the generative UI tools listed below.',
  '- Reason about, summarize, compare, translate, and rewrite text the user provides or that retrieval surfaces.',
  '',
  'You CANNOT: send messages or emails, schedule, set reminders or alerts, watch for changes, take actions in third-party systems, write or modify files in the user\'s storage, execute code, control the desktop, or do anything that requires acting outside this conversation. If a user asks for such a thing, say plainly that you can\'t do it in this app and suggest the closest thing you CAN do (e.g. "I can draft the email text for you to send" instead of "I\'ll email it"). Never end a turn with a suggestion that implies you\'ll do an unsupported action next.',
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

const FOCUSED_FILE_PROMPT_ADDITION = [
  '',
  '# Focused on a single file',
  'The user has pinned ONE specific document for this turn (via a # mention). Treat their question as being about that file. Always call `search_documents` first — retrieval is automatically restricted to chunks from the pinned file, so you cannot accidentally pull from elsewhere. If the file does not contain the answer, say so plainly rather than guessing.',
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

    // Pick up the caller's active workspace from their session so every
    // conversation, telemetry row, and usage record we persist is tagged
    // with the right workspace context. Hardcoded null here meant the
    // chat sidebar's per-workspace filter saw zero rows even when the
    // user was inside a workspace.
    const sessionRow = (
      await deps.db
        .select({ activeWorkspaceId: schema.sessions.activeWorkspaceId })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session.session.id))
        .limit(1)
    )[0];
    const activeWorkspaceId = sessionRow?.activeWorkspaceId ?? null;

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
    // Default for new conversations: workspace if the caller has one
    // active, else organization. Mirrors the desktop's default — the
    // server fallback only matters when the client omits the field.
    const requestedScope =
      parsed.data.retrievalScope ?? (activeWorkspaceId ? 'workspace' : 'organization');
    const messages = parsed.data.messages as UIMessage[];

    try {
      // Spend cap pre-flight: reject before we start a stream the user
      // can't afford to finish. Gates on MTD already >= cap, so the last
      // call may slightly overshoot — preferable to mid-stream errors.
      await assertUserWithinCap({ db: deps.db }, { userId: session.user.id });

      // Sticky model preference: remember whichever model the user just
      // chose so the picker defaults to it next time. Safe to fire in
      // parallel with the stream — it's a single UPDATE on the user row.
      if (isKnownChatModel(modelId)) {
        void deps.db
          .update(schema.users)
          .set({ preferredChatModelId: modelId, updatedAt: new Date() })
          .where(eq(schema.users.id, session.user.id))
          .catch((err: unknown) => {
            deps.logger.warn('failed to update preferred chat model', {
              userId: session.user.id,
              modelId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }

      const firstUserText = extractFirstUserText(messages);
      const upsertResult = await upsertConversation(
        { db: deps.db },
        {
          conversationId,
          userId: session.user.id,
          workspaceId: activeWorkspaceId,
          modelId,
          firstUserText,
          retrievalScope: requestedScope,
        },
      );
      const effectiveScope = upsertResult.retrievalScope;

      // On first creation only, fire-and-forget AI-generated title.
      // Runs in parallel with streaming — doesn't block first-token latency.
      if (upsertResult.isNew && firstUserText) {
        void generateAndApplyConversationTitle(
          { registry: deps.registry, db: deps.db, logger: deps.logger },
          { conversationId, firstUserText, userId: session.user.id },
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
      // caller's org/workspace/user id so the model physically cannot
      // query a different scope's files. `effectiveScope` comes from the
      // conversation row — locked in on create, respected on every reply.
      const organizationId =
        (session.user as { organizationId?: string | null }).organizationId ?? null;
      const toolScope:
        | { kind: 'organization'; organizationId: string }
        | { kind: 'workspace'; workspaceId: string; organizationId: string | null }
        | { kind: 'user'; userId: string }
        | null =
        effectiveScope === 'user'
          ? { kind: 'user', userId: session.user.id }
          : effectiveScope === 'workspace'
            ? activeWorkspaceId
              ? {
                  kind: 'workspace',
                  workspaceId: activeWorkspaceId,
                  // Workspace scope rolls up org-wide files too, so the
                  // model sees universal docs (HR, brand) alongside the
                  // workspace's own. organizationId can be null for
                  // legacy/edge cases — the SQL handles that.
                  organizationId,
                }
              : null
            : organizationId
              ? { kind: 'organization', organizationId }
              : null;

      const mentionedResourceIds = parsed.data.mentionedResourceIds ?? [];
      const retrievalTools = toolScope
        ? {
            search_documents: createRetrievalTool({
              db: deps.db,
              embedProvider: deps.embedProvider,
              rerankProvider: deps.rerankProvider,
              logger: deps.logger,
              scope: toolScope,
              ...(mentionedResourceIds.length > 0
                ? { resourceIds: mentionedResourceIds }
                : {}),
              telemetry: {
                userId: session.user.id,
                workspaceId: activeWorkspaceId,
                conversationId,
              },
            }),
          }
        : {};

      const tools = { ...(nativeTools ?? {}), ...uiTools, ...retrievalTools };

      // Compose the system prompt. The retrieval addition only ships when
      // a retrieval tool is actually attached — mentioning it without one
      // would confuse the model into claiming it can search. When the user
      // has pinned a single file via #-mention, we add a stronger nudge so
      // the model treats that file as the topic of the message.
      const systemPrompt = toolScope
        ? CHAT_SYSTEM_PROMPT_BASE +
          RETRIEVAL_SYSTEM_PROMPT_ADDITION +
          (mentionedResourceIds.length > 0 ? FOCUSED_FILE_PROMPT_ADDITION : '')
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
          onFinish: async ({ usage, providerRequestId, latencyMs }) => {
            await recordUsage(
              { db: deps.db, logger: deps.logger },
              {
                userId: session.user.id,
                workspaceId: activeWorkspaceId,
                type: 'CHAT',
                modelId,
                promptTokens: usage.promptTokens,
                cachedInputTokens: usage.cachedInputTokens,
                completionTokens: usage.completionTokens,
                reasoningTokens: usage.reasoningTokens,
                providerRequestId,
                latencyMs,
                conversationId,
              },
            );
          },
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
