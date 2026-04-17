import type { UIMessage, UIMessagePart } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageActions } from './MessageActions';
import { useAttachmentUrl } from './useAttachmentUrl';

type MessageRole = 'user' | 'assistant';

export interface MessageProps {
  role: MessageRole;
  parts: UIMessage['parts'];
  /** Show the animated "Thinking.." gradient label above the content. */
  thinking?: boolean;
  /** Hide the action toolbar while the assistant is still streaming. */
  showActions?: boolean;
}

export function Message({ role, parts, thinking, showActions = true }: MessageProps) {
  const text = extractText(parts);
  const files = extractFiles(parts);
  const hasContent = text.length > 0 || files.length > 0;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[520px] flex-col items-end gap-2">
          {files.length > 0 && <AttachmentGrid files={files} align="end" />}
          {text && (
            <div className="whitespace-pre-wrap rounded-[20px] bg-zinc-100 px-[18px] py-2.5 text-base leading-6 text-black">
              {text}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {thinking && (
        <p className="thinking-gradient-text w-fit text-base font-medium leading-6">Thinking..</p>
      )}
      {files.length > 0 && <AttachmentGrid files={files} align="start" />}
      {text && (
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
                  className={`rounded bg-zinc-100 px-1 py-0.5 font-sans text-[0.9em] ${className ?? ''}`}
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
            {text}
          </ReactMarkdown>
        </div>
      )}
      {showActions && hasContent && <MessageActions />}
    </div>
  );
}

function AttachmentGrid({ files, align }: { files: FileLikePart[]; align: 'start' | 'end' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {files.map((f, idx) => (
        <Attachment key={`${f.url}-${idx}`} file={f} />
      ))}
    </div>
  );
}

function Attachment({ file }: { file: FileLikePart }) {
  const resolved = useAttachmentUrl(file.url);
  const src = resolved.url;
  const isImage = file.mediaType.startsWith('image/');

  if (isImage) {
    if (!src) {
      return (
        <div
          className="grid h-44 w-44 animate-pulse place-items-center rounded-2xl border border-zinc-200 bg-zinc-100 text-xs text-zinc-400"
          aria-label="Loading attachment"
        >
          Loading…
        </div>
      );
    }
    return (
      <img
        src={src}
        alt={file.filename ?? 'Attached image'}
        className="max-h-64 max-w-[260px] rounded-2xl border border-zinc-200 object-contain"
      />
    );
  }

  const label = mediaBadge(file.mediaType, file.filename);
  return (
    <a
      href={src ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={!src}
      className={`flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 ${
        src ? '' : 'pointer-events-none opacity-60'
      }`}
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-red-50 text-[10px] font-semibold tracking-wide text-red-600">
        {label}
      </div>
      <span className="max-w-[220px] truncate">{file.filename ?? 'Attachment'}</span>
    </a>
  );
}

function mediaBadge(mediaType: string, filename: string | undefined): string {
  if (mediaType === 'application/pdf') return 'PDF';
  if (filename) {
    const dot = filename.lastIndexOf('.');
    if (dot >= 0 && dot < filename.length - 1) {
      return filename.slice(dot + 1).toUpperCase().slice(0, 4);
    }
  }
  return 'FILE';
}

interface FileLikePart {
  mediaType: string;
  url: string;
  filename?: string;
}

function extractText(parts: UIMessage['parts']): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

function extractFiles(parts: UIMessage['parts']): FileLikePart[] {
  return parts.flatMap((part) => (isFilePart(part) ? [part] : []));
}

function isFilePart(part: UIMessagePart<unknown, Record<string, never>>): part is FilePartShape {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'file' &&
    typeof (part as { mediaType?: unknown }).mediaType === 'string' &&
    typeof (part as { url?: unknown }).url === 'string'
  );
}

type FilePartShape = { type: 'file'; mediaType: string; url: string; filename?: string };
