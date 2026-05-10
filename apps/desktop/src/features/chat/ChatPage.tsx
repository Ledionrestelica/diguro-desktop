import { AlertTriangle, ArrowDown, OctagonAlert } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { Composer, type ReadyAttachment } from './Composer';
import { Message } from './Message';
import type { ChatOutletContext } from './ChatLayout';
import { trpc } from '@/lib/trpc';

export function ChatPage() {
  const { chatId, session, hydrating, citationsByMessageId, conversationScope, scopeLocked } =
    useOutletContext<ChatOutletContext>();
  const { messages, sendMessage, status, stop, error } = session;
  const me = trpc.health.me.useQuery();
  const preferredModelId = me.data?.preferredChatModelId ?? null;
  // Default scope for NEW chats: workspace files when the user is in a
  // workspace (the common case), otherwise organization-wide. Existing
  // conversations always honor their stored `conversationScope`.
  const defaultScope: 'organization' | 'workspace' | 'user' =
    me.data?.activeWorkspaceId ? 'workspace' : 'organization';

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
        <StickToBottom.Content className="scrollbar-thin px-6 pb-10 pt-4">
          <div className="mx-auto flex max-w-189 flex-col gap-6">
            {hydrating && (
              <p className="text-center text-sm text-zinc-500">Loading conversation…</p>
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
                />
              );
            })}

            {isSubmitting && <Message role="assistant" parts={[]} thinking showActions={false} />}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error.message}
              </div>
            )}
          </div>
        </StickToBottom.Content>

        <ScrollToBottomButton />
      </StickToBottom>

      <div className="shrink-0 bg-[#fafafa] px-6 pb-8 pt-2">
        {usage.data && (overLimit || nearLimit) && (
          <div className="mx-auto mb-2 w-full max-w-189">
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
        <p className="mt-3 text-center text-sm leading-4 text-neutral-500">
          AI can make mistakes. Check important info.
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
            You've used {used} of {cap} this month. New messages are paused
            until your budget resets on {reset}. Ask your workspace admin to
            raise your cap if you need more headroom.
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
        <p className="font-medium">
          Approaching your monthly AI budget — {pct}% used
        </p>
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
        'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-zinc-200 bg-white p-2 text-zinc-700 shadow-md transition-all',
        'hover:bg-zinc-50',
        isAtBottom ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
      )}
    >
      <ArrowDown className="size-4" />
    </button>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
        What can I help you with?
      </h2>
      <p className="mt-2 text-sm text-neutral-500">
        Ask anything. Your conversations save automatically.
      </p>
    </div>
  );
}
