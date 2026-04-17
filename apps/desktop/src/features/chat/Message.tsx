import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageActions } from './MessageActions';

export interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  /** Show the animated "Thinking.." gradient label above the content. */
  thinking?: boolean;
  /** Hide the action toolbar while the assistant is still streaming. */
  showActions?: boolean;
}

export function Message({ role, content, thinking, showActions = true }: MessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="whitespace-pre-wrap rounded-[20px] bg-zinc-100 px-[18px] py-2.5 text-base leading-6 text-black">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {thinking && (
        <p className="thinking-gradient-text w-fit text-base font-medium leading-6">Thinking..</p>
      )}
      {content && (
        <div className="text-base leading-6 text-zinc-800">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              ul: ({ children }) => <ul className="mb-4 list-disc pl-5 last:mb-0">{children}</ul>,
              ol: ({ children }) => <ol className="mb-4 list-decimal pl-5 last:mb-0">{children}</ol>,
              li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
              code: ({ children, className }) => (
                <code
                  className={`rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm ${className ?? ''}`}
                >
                  {children}
                </code>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
                >
                  {children}
                </a>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
      {showActions && content && <MessageActions />}
    </div>
  );
}
