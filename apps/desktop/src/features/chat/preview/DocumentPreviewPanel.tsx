import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Download, Minus, Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { FileTypeIcon } from '../trace/SourceIcon';
import type { MessageCitation } from '../types';
import { useDocumentPreview, type PreviewTarget } from './DocumentPreviewContext';
import { PdfDocumentView, type PdfViewState } from './PdfDocumentView';

/**
 * The document preview beside the chat (Figma "Document preview - Ready for
 * dev"): the cited file opened at the cited page with the words the answer
 * relies on highlighted, and a floating pill for paging and zoom. The
 * message's other passages open from their citation chips.
 */
export function DocumentPreviewPanel({ target }: { target: PreviewTarget }) {
  const preview = useDocumentPreview();
  const citation = target.citations[target.index];
  const source = trpc.conversations.citationSource.useQuery(
    { citationId: citation?.id ?? '' },
    { enabled: !!citation, staleTime: 10 * 60_000, refetchOnWindowFocus: false },
  );
  const [view, setView] = useState<PdfViewState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [goTo, setGoTo] = useState<{ page: number; seq: number } | null>(null);
  const step = (delta: number) => {
    if (!view) return;
    const page = Math.min(view.pageCount, Math.max(1, view.page + delta));
    setGoTo((g) => ({ page, seq: (g?.seq ?? 0) + 1 }));
  };

  // Presigned URLs differ per request; keep the first one for a file version
  // so stepping between passages of the same file doesn't reload it.
  const fileUrls = useRef(new Map<string, string>());
  const data = source.data;
  const fileKey = citation && data ? `${citation.resourceId}:v${data.versionNumber}` : null;
  if (fileKey && data && !fileUrls.current.has(fileKey)) fileUrls.current.set(fileKey, data.url);
  const fileUrl = fileKey ? fileUrls.current.get(fileKey) : undefined;

  if (!citation || !preview) return null;
  const name = data?.name ?? citation.sourceName;
  const isPdf = data ? data.mimeType === 'application/pdf' : name.toLowerCase().endsWith('.pdf');

  return (
    <section
      aria-label={`Preview of ${name}`}
      className="preview-panel relative flex h-full min-w-0 flex-col border-l border-gray-3 bg-bg-panel"
    >
      <header className="flex shrink-0 items-center gap-3 pt-4 pr-3.5 pb-3.5 pl-5">
        <RoundButton label="Close preview" onClick={preview.close}>
          <X className="size-4" />
        </RoundButton>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileTypeIcon name={name} size={14} />
          <span className="truncate text-label-14 font-medium text-text">{name}</span>
          {data && (
            <span className="shrink-0 text-label-12 text-text-secondary">
              {data.isCurrentVersion
                ? `Updated ${formatDate(data.updatedAt)}`
                : `Cited from v${data.versionNumber} · document has since been updated`}
            </span>
          )}
        </div>
        {data && (
          <RoundButton label="Download" href={data.downloadUrl}>
            <Download className="size-4" />
          </RoundButton>
        )}
      </header>

      <div className="relative isolate min-h-0 flex-1">
        {source.isError ? (
          <Fallback citation={citation} message="This file can't be opened right now." />
        ) : !data || !fileUrl ? (
          <div className="flex h-full justify-center px-8 pt-8">
            <div className="aspect-[1/1.294] w-full max-w-[760px] animate-pulse self-start rounded-[8px] border border-gray-3 bg-gray-2" />
          </div>
        ) : !isPdf || loadFailed ? (
          <Fallback
            citation={citation}
            passage={data.passage}
            downloadUrl={data.downloadUrl}
            message={
              loadFailed
                ? "This PDF couldn't be displayed here."
                : 'Previews are available for PDFs. Here is the cited passage.'
            }
          />
        ) : (
          <PdfDocumentView
            key={fileUrl}
            file={fileUrl}
            pageNumber={data.pageNumber ?? 1}
            passage={data.passage}
            answer={target.answers.get(citation.chunkId) ?? ''}
            zoom={zoom}
            goTo={goTo}
            onState={setView}
            onError={() => setLoadFailed(true)}
          />
        )}
      </div>

      {view && isPdf && !loadFailed && (
        <footer className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-[40px] border border-gray-3 bg-bg-panel py-1.5 pr-1.5 pl-1.5 shadow-[0_4px_24px_-3px_rgba(16,24,40,0.1)]">
            <div className="flex items-center gap-1">
              <PillButton label="Previous page" disabled={view.page <= 1} onClick={() => step(-1)}>
                <ChevronUp className="size-4" />
              </PillButton>
              <PillButton
                label="Next page"
                disabled={view.page >= view.pageCount}
                onClick={() => step(1)}
              >
                <ChevronDown className="size-4" />
              </PillButton>
              <span className="min-w-[92px] pl-1 text-label-13 font-medium text-text tabular-nums">
                Page {view.page} of {view.pageCount}
              </span>
            </div>
            <span aria-hidden className="h-4 w-px bg-gray-4" />
            <div className="flex items-center gap-1">
              <PillButton
                label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, round(z - ZOOM_STEP)))}
              >
                <Minus className="size-4" />
              </PillButton>
              <span className="min-w-[44px] text-center text-label-13 font-medium text-text-secondary tabular-nums">
                {view.percent}%
              </span>
              <PillButton
                label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, round(z + ZOOM_STEP)))}
              >
                <Plus className="size-4" />
              </PillButton>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function Fallback({
  citation,
  passage,
  downloadUrl,
  message,
}: {
  citation: MessageCitation;
  passage?: string;
  downloadUrl?: string;
  message: string;
}) {
  return (
    <div className="h-full overflow-y-auto px-8 pt-8 pb-24">
      <div className="mx-auto flex max-w-[640px] flex-col gap-4">
        <p className="text-copy-14 text-text-secondary">{message}</p>
        <blockquote className="rounded-[12px] border border-gray-3 bg-bg-app px-4 py-3 text-copy-14 whitespace-pre-wrap text-text">
          {passage ?? citation.snippet}
        </blockquote>
        {downloadUrl && (
          <a
            href={downloadUrl}
            className="w-fit rounded-[12px] bg-gray-3 px-3 py-1.5 text-label-13 font-medium text-text hover:bg-gray-4"
          >
            Download file
          </a>
        )}
      </div>
    </div>
  );
}

const roundClass =
  'grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-gray-3 text-text outline-none transition-colors hover:bg-gray-4 focus-visible:shadow-[0_0_0_2px_var(--color-text)]';

function RoundButton({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: ReactNode;
}) {
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className={roundClass}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={roundClass}>
      {children}
    </button>
  );
}

function PillButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 cursor-pointer place-items-center rounded-full text-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-text)]',
        'disabled:cursor-default disabled:text-gray-8 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
