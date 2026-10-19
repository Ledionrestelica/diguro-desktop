import { AlertTriangle, ArrowDown, OctagonAlert } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { Composer, type ReadyAttachment } from './Composer';
import { Message } from './Message';
import type { ChatOutletContext } from './ChatLayout';
import { trpc } from '@/lib/trpc';

const REPORT_ISSUE_URL = 'mailto:support@diguro.se?subject=Iserana%20issue';

export function ChatPage() {
  const { chatId, session, hydrating, citationsByMessageId, conversationScope, scopeLocked } =
    useOutletContext<ChatOutletContext>();
  const { messages, sendMessage, status, stop, error } = session;
  const me = trpc.health.me.useQuery();
  const preferredModelId = me.data?.preferredChatModelId ?? null;
  // Default scope for NEW chats: workspace files when the user is in a
  // workspace (the common case), otherwise organization-wide. Existing
  // conversations always honor their stored `conversationScope`.
  const defaultScope: 'organization' | 'workspace' | 'user' = me.data?.activeWorkspaceId
    ? 'workspace'
    : 'organization';
  const effectiveScope = conversationScope ?? defaultScope;
  const scopeLabel =
    effectiveScope === 'user'
      ? 'your files'
      : effectiveScope === 'workspace'
        ? (me.data?.activeWorkspace?.name ?? 'workspace')
        : (me.data?.organization?.name ?? 'organization');

  // Spending cap snapshot drives the pre-send guard. The server enforces
  // the same cap in chat-route via `assertUserWithinCap` — this query
  // exists purely so the UI can disable the composer + show why BEFORE
  // the user types and burns time. Refetch on a 60s interval so the cap
  // unblocks soon after the next billing cycle ticks (we round to start
  // of next UTC month server-side).
  const usage = trpc.health.usageSnapshot.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const overLimit = (usage.data?.fractionUsed ?? 0) >= 1;
  const nearLimit = !overLimit && (usage.data?.fractionUsed ?? 0) >= 0.9;

  const isSubmitting = status === 'submitted';
  const isStreaming = status === 'streaming';
  const isBusy = isSubmitting || isStreaming;

  function handleSend(
    text: string,
    attachments: ReadyAttachment[],
    scope: 'organization' | 'workspace' | 'user',
    modelId: string | null,
    mentionedFileId: string | null,
  ) {
    // The server only honors `retrievalScope` on conversation creation;
    // subsequent messages reuse the stored scope. `modelId` is respected
    // on every turn — the chat-route stamps it as the sticky user pref.
    // `mentionedResourceIds` is per-turn — the server constrains the
    // retrieval tool to those resource ids for THIS message only.
    const body: Record<string, unknown> = { retrievalScope: scope };
    if (modelId) body['modelId'] = modelId;
    if (mentionedFileId) body['mentionedResourceIds'] = [mentionedFileId];
    const options = { body };

    // Build the parts array explicitly so we can include `chat://` file URLs.
    // AI-SDK v6 useChat's sendMessage accepts a { role, parts } payload.
    if (attachments.length === 0) {
      void sendMessage({ text }, options);
      return;
    }
    void sendMessage(
      {
        role: 'user',
        parts: [
          ...(text.length > 0 ? [{ type: 'text' as const, text }] : []),
          ...attachments.map((a) => ({
            type: 'file' as const,
            url: a.url,
            mediaType: a.mediaType,
            filename: a.filename,
          })),
        ],
      },
      options,
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StickToBottom
        className="relative min-h-0 flex-1 overflow-hidden"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content className="scrollbar-thin px-6 pt-16 pb-10">
          <div className="mx-auto flex max-w-[720px] flex-col gap-8 font-inter">
            {hydrating && (
              <p className="text-center text-label-14 text-text-secondary">Loading conversation…</p>
            )}

            {!hydrating && messages.length === 0 && !isBusy && <EmptyState />}

            {messages.map((m, i) => {
              if (m.role === 'system') return null;
              const isLast = i === messages.length - 1;
              return (
                <Message
                  key={m.id}
                  role={m.role === 'assistant' ? 'assistant' : 'user'}
                  parts={m.parts}
                  thinking={m.role === 'assistant' && isLast && isStreaming}
                  showActions={m.role === 'assistant' && !(isLast && isStreaming)}
                  citations={citationsByMessageId.get(m.id) ?? []}
                  scopeLabel={scopeLabel}
                  createdAt={(m.metadata as { createdAt?: string } | undefined)?.createdAt}
                />
              );
            })}

            {isSubmitting && (
              <Message
                role="assistant"
                parts={[]}
                thinking
                showActions={false}
                scopeLabel={scopeLabel}
              />
            )}

            {error && (
              <div className="rounded-[12px] border border-danger-border bg-danger-subtle px-4 py-3 text-copy-14 text-danger-text">
                {readableError(error.message)}
              </div>
            )}
          </div>
        </StickToBottom.Content>

        <ScrollToBottomButton />
      </StickToBottom>

      <div className="shrink-0 px-6 pt-2 pb-5">
        {usage.data && (overLimit || nearLimit) && (
          <div className="mx-auto mb-2 w-full max-w-[745px]">
            <SpendingLimitBanner
              overLimit={overLimit}
              usedMicrodollars={usage.data.usedMicrodollars}
              capMicrodollars={usage.data.capMicrodollars}
              fractionUsed={usage.data.fractionUsed}
              resetsAt={usage.data.resetsAt}
            />
          </div>
        )}
        <Composer
          conversationId={chatId}
          onSend={handleSend}
          onStop={() => void stop()}
          streaming={isBusy}
          disabled={overLimit}
          initialScope={conversationScope ?? defaultScope}
          scopeLocked={scopeLocked}
          initialModelId={preferredModelId}
        />
        <p className="mt-4 text-center font-inter text-label-12 font-medium text-text-placeholder">
          Having trouble?{' '}
          <a
            href={REPORT_ISSUE_URL}
            className="underline decoration-from-font underline-offset-2 hover:text-text-secondary"
          >
            Report an issue or Bug
          </a>
        </p>
      </div>
    </div>
  );
}

function SpendingLimitBanner({
  overLimit,
  usedMicrodollars,
  capMicrodollars,
  fractionUsed,
  resetsAt,
}: {
  overLimit: boolean;
  usedMicrodollars: number;
  capMicrodollars: number;
  fractionUsed: number;
  resetsAt: string;
}) {
  const used = formatUsd(usedMicrodollars);
  const cap = formatUsd(capMicrodollars);
  const pct = Math.min(100, Math.round(fractionUsed * 100));
  const reset = formatResetDate(resetsAt);

  if (overLimit) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <OctagonAlert className="mt-0.5 size-4 shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Monthly AI budget reached</p>
          <p className="mt-0.5 text-xs text-red-700/90">
            You've used {used} of {cap} this month. New messages are paused until your budget resets
            on {reset}. Ask your workspace admin to raise your cap if you need more headroom.
          </p>
        </div>
      </div>
    );
  }

  // Near-limit (≥90%): warn but don't block.
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Approaching your monthly AI budget — {pct}% used</p>
        <p className="mt-0.5 text-xs text-amber-800/90">
          {used} of {cap} this month. Resets {reset}.
        </p>
      </div>
    </div>
  );
}

function formatUsd(microdollars: number): string {
  const usd = microdollars / 1_000_000;
  if (usd < 0.01) return '$0.00';
  return `$${usd.toFixed(2)}`;
}

function formatResetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'next month';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  return (
    <button
      type="button"
      aria-label="Scroll to bottom"
      onClick={() => void scrollToBottom()}
      className={cn(
        'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-gray-4 bg-bg-panel p-2 text-text-secondary shadow-[0_3px_6px_rgba(225,225,225,0.7)] transition-all',
        'hover:text-text',
        isAtBottom ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
      )}
    >
      <ArrowDown className="size-4" />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-[18vh] max-w-md text-center">
      <h2 className="text-heading-24 font-medium text-text">What can I help you with?</h2>
      <p className="mt-2 text-copy-14 text-text-secondary">
        Ask anything. Your conversations save automatically.
      </p>
    </div>
  );
}

/** Provider errors arrive as raw JSON from the stream; show their message. */
function readableError(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    const error: unknown =
      typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'error') : null;
    const message: unknown =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'message') : null;
    if (typeof message === 'string') return `The AI provider couldn’t answer: ${message}`;
  } catch {
    // Not JSON — already a readable message.
  }
  return raw;
}
