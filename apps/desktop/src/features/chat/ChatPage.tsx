import { ArrowDown } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { Composer, type ReadyAttachment } from './Composer';
import { Message } from './Message';
import type { ChatOutletContext } from './ChatLayout';

export function ChatPage() {
  const { chatId, session, hydrating, citationsByMessageId } =
    useOutletContext<ChatOutletContext>();
  const { messages, sendMessage, status, stop, error } = session;

  const isSubmitting = status === 'submitted';
  const isStreaming = status === 'streaming';
  const isBusy = isSubmitting || isStreaming;

  function handleSend(text: string, attachments: ReadyAttachment[]) {
    // Build the parts array explicitly so we can include `chat://` file URLs.
    // AI-SDK v6 useChat's sendMessage accepts a { role, parts } payload.
    if (attachments.length === 0) {
      void sendMessage({ text });
      return;
    }
    void sendMessage({
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
    });
  }

  return (
    <div className="flex h-full flex-col">
      <StickToBottom
        className="relative min-h-0 flex-1 overflow-hidden"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content className="scrollbar-thin px-6 pb-10 pt-4">
          <div className="mx-auto flex max-w-[756px] flex-col gap-6">
            {hydrating && <p className="text-center text-sm text-zinc-500">Loading conversation…</p>}

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
        <Composer
          conversationId={chatId}
          onSend={handleSend}
          onStop={() => void stop()}
          streaming={isBusy}
        />
        <p className="mt-3 text-center text-sm leading-4 text-neutral-500">
          AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
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
        isAtBottom
          ? 'pointer-events-none translate-y-2 opacity-0'
          : 'translate-y-0 opacity-100',
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
