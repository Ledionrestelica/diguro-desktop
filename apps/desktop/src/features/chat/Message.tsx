import { Globe } from 'lucide-react';
import type { UIMessage, UIMessagePart } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageActions } from './MessageActions';
import { useAttachmentUrl } from './useAttachmentUrl';
import { ToolPart } from './tools/registry';
import { isGenerativeUIToolName } from './tools/names';

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
  const blocks = buildBlocks(parts);
  const sources = extractSources(parts);
  const searchState = extractSearchState(parts);
  const userFiles = role === 'user' ? extractFiles(parts) : [];
  const userText = role === 'user' ? extractText(parts) : '';

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[520px] flex-col items-end gap-2">
          {userFiles.length > 0 && <AttachmentGrid files={userFiles} align="end" />}
          {userText && (
            <div className="whitespace-pre-wrap rounded-[20px] bg-zinc-100 px-[18px] py-2.5 text-base leading-6 text-black">
              {userText}
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasRenderableContent = blocks.length > 0 || sources.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {thinking && (
        <p className="thinking-gradient-text w-fit animate-bounce text-base font-medium leading-6">
          Thinking..
        </p>
      )}
      {searchState && <SearchIndicator state={searchState} />}
      {blocks.map((block, i) => (
        <BlockRender key={i} block={block} />
      ))}
      {sources.length > 0 && <SourceList sources={sources} />}
      {showActions && hasRenderableContent && <MessageActions />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Block model — walks parts in stream order, coalescing adjacent text*/
/* ------------------------------------------------------------------ */

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; part: UIMessagePart<unknown, Record<string, never>> }
  | { kind: 'files'; parts: FileLikePart[] };

function buildBlocks(parts: UIMessage['parts']): Block[] {
  const out: Block[] = [];
  let textBuf = '';
  let fileBuf: FileLikePart[] = [];

  const flushText = () => {
    if (textBuf.length > 0) {
      out.push({ kind: 'text', text: textBuf });
      textBuf = '';
    }
  };
  const flushFiles = () => {
    if (fileBuf.length > 0) {
      out.push({ kind: 'files', parts: fileBuf });
      fileBuf = [];
    }
  };

  for (const part of parts) {
    const type = (part as { type?: unknown }).type;
    if (typeof type !== 'string') continue;

    if (type === 'text') {
      flushFiles();
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') textBuf += text;
      continue;
    }

    if (isFilePart(part)) {
      flushText();
      fileBuf.push(part);
      continue;
    }

    if (type.startsWith('tool-')) {
      const name = type.slice('tool-'.length);
      // Provider-native tools (web_search) have a dedicated inline indicator
      // + source footer — don't render them as a generic block.
      if (!isGenerativeUIToolName(name)) continue;
      flushText();
      flushFiles();
      out.push({ kind: 'tool', part });
      continue;
    }
  }
  flushText();
  flushFiles();
  return out;
}

function BlockRender({ block }: { block: Block }) {
  if (block.kind === 'text') return <AssistantText text={block.text} />;
  if (block.kind === 'files') return <AttachmentGrid files={block.parts} align="start" />;
  return <ToolPart part={block.part} />;
}

function AssistantText({ text }: { text: string }) {
  return (
    <div className="text-base leading-6 text-zinc-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="mb-4 list-disc pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => (
            <ol className="mb-4 list-decimal pl-5 last:mb-0">{children}</ol>
          ),
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
  );
}

/* ---------------------- Search indicator + sources ---------------------- */

function SearchIndicator({ state }: { state: 'searching' | 'done' }) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600">
      <Globe
        className={`size-3.5 text-zinc-500 ${state === 'searching' ? 'animate-pulse' : ''}`}
      />
      {state === 'searching' ? 'Searching the web…' : 'Searched the web'}
    </div>
  );
}

function SourceList({ sources }: { sources: SourceLikePart[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sources</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, idx) => (
          <SourceChip key={`${s.url}-${idx}`} source={s} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function SourceChip({ source, index }: { source: SourceLikePart; index: number }) {
  const host = safeHostname(source.url);
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex max-w-[320px] items-center gap-2 rounded-full border border-zinc-200 bg-white py-1.5 pl-1.5 pr-3 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600">
        {index}
      </span>
      <span className="truncate">
        <span className="text-zinc-900 group-hover:underline">{source.title || host}</span>
        {source.title && <span className="text-zinc-500"> · {host}</span>}
      </span>
    </a>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* ---------------------- Attachments (user + assistant) ---------------------- */

function AttachmentGrid({ files, align }: { files: FileLikePart[]; align: 'start' | 'end' }) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
    >
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
      return filename
        .slice(dot + 1)
        .toUpperCase()
        .slice(0, 4);
    }
  }
  return 'FILE';
}

/* ---------------------- Extractors ---------------------- */

interface FileLikePart {
  type: 'file';
  mediaType: string;
  url: string;
  filename?: string;
}

interface SourceLikePart {
  url: string;
  title?: string;
}

function extractText(parts: UIMessage['parts']): string {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

function extractFiles(parts: UIMessage['parts']): FileLikePart[] {
  return parts.flatMap((part) => (isFilePart(part) ? [part] : []));
}

/** De-duped list of source-url parts — many tools emit the same source repeatedly. */
function extractSources(parts: UIMessage['parts']): SourceLikePart[] {
  const seen = new Set<string>();
  const out: SourceLikePart[] = [];
  for (const part of parts) {
    if (!isSourceUrlPart(part)) continue;
    if (seen.has(part.url)) continue;
    seen.add(part.url);
    out.push({ url: part.url, ...(part.title ? { title: part.title } : {}) });
  }
  return out;
}

/**
 * Status of the provider-native web-search tool, if any. Only surfaces for
 * native web search (distinct tool names like `web_search`); generative-UI
 * tools are handled by the block walker.
 */
function extractSearchState(parts: UIMessage['parts']): 'searching' | 'done' | undefined {
  let sawSearch = false;
  let sawInProgress = false;
  for (const part of parts) {
    const type = (part as { type?: unknown }).type;
    if (typeof type !== 'string') continue;
    if (!type.startsWith('tool-')) continue;
    const name = type.slice('tool-'.length);
    if (isGenerativeUIToolName(name)) continue;
    if (!name.includes('web_search') && !name.includes('webSearch')) continue;
    sawSearch = true;
    const state = (part as { state?: unknown }).state;
    if (state === 'input-streaming' || state === 'input-available') {
      sawInProgress = true;
    }
  }
  if (!sawSearch) return undefined;
  return sawInProgress ? 'searching' : 'done';
}

function isFilePart(
  part: UIMessagePart<unknown, Record<string, never>>,
): part is FileLikePart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'file' &&
    typeof (part as { mediaType?: unknown }).mediaType === 'string' &&
    typeof (part as { url?: unknown }).url === 'string'
  );
}

function isSourceUrlPart(
  part: UIMessagePart<unknown, Record<string, never>>,
): part is SourceUrlPartShape {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'source-url' &&
    typeof (part as { url?: unknown }).url === 'string'
  );
}

type SourceUrlPartShape = { type: 'source-url'; url: string; title?: string; sourceId?: string };
