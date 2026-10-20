import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PiSparkleAI02Stroke } from '@/components/icons/pika/PiSparkleAI02Stroke';
import { PiSearchDefaultStroke } from '@/components/icons/pika/PiSearchDefaultStroke';
import { PiChevronDownStroke } from '@/components/icons/pika/PiChevronDownStroke';
import { PiAlertTriangleStroke } from '@/components/icons/pika/PiAlertTriangleStroke';
import { Spinner } from '../sidebar/Spinner';
import { SourceIcon } from './SourceIcon';
import { Collapsible } from './Collapsible';
import { FluidList, useFluidItem } from '@/components/fluid/FluidList';

export type RetrievalResult = {
  chunkId: string;
  source: string;
  page: number | null;
  excerpt: string;
  score: number;
};

export type RetrievalCall = {
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  query: string | null;
  results: RetrievalResult[];
  errorText: string | null;
};

const VISIBLE_SOURCES = 3;

/**
 * Figma "Retrieval & steps trace": one summary line for every
 * `search_documents` call in a turn, expanding into the queries it ran and
 * the documents it found. Live while searching, collapsed once done.
 */
export function RetrievalTrace({
  calls,
  scopeLabel,
}: {
  calls: RetrievalCall[];
  scopeLabel: string;
}) {
  const searching = calls.some(
    (c) => c.state === 'input-streaming' || c.state === 'input-available',
  );
  const failed = calls.length > 0 && calls.every((c) => c.state === 'output-error');
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const queries = [...new Set(calls.map((c) => c.query).filter((q): q is string => !!q))];
  const documents = groupByDocument(calls.flatMap((c) => c.results));
  const passages = documents.reduce((n, d) => n + d.passages, 0);
  const noResults = !searching && !failed && documents.length === 0;
  const expanded = searching || open;
  const target = scopeLabel ? ` ${scopeLabel}` : '';

  let summary: ReactNode;
  if (searching) {
    summary = (
      <SummaryLine icon={<Spinner size={14} className="text-text" />} title={`Searching${target}`}>
        {documents.length > 0 &&
          `· ${documents.length} ${documents.length === 1 ? 'source' : 'sources'} so far`}
      </SummaryLine>
    );
  } else if (failed) {
    summary = (
      <SummaryLine
        icon={<PiAlertTriangleStroke size={14} className="text-warning-text" />}
        title="Search failed"
      >
        {calls[0]?.errorText ? `· ${calls[0].errorText}` : null}
      </SummaryLine>
    );
  } else if (noResults) {
    summary = (
      <SummaryLine
        icon={<PiSearchDefaultStroke size={14} className="text-text-secondary" />}
        title={`Searched${target}`}
      >
        · no matching passages
      </SummaryLine>
    );
  } else {
    summary = (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex cursor-pointer items-center gap-2 rounded-[6px] text-left outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
      >
        <SummaryLine
          icon={<PiSparkleAI02Stroke size={14} className="text-ai-sparkle" />}
          title={`Searched${target}`}
        >
          · {passages} {passages === 1 ? 'passage' : 'passages'} from {documents.length}{' '}
          {documents.length === 1 ? 'document' : 'documents'}
        </SummaryLine>
        <PiChevronDownStroke
          size={14}
          className={cn(
            'text-text-secondary transition-transform duration-200 ease-out group-hover:text-text',
            !open && '-rotate-90',
          )}
        />
      </button>
    );
  }

  const shown = showAll ? documents : documents.slice(0, VISIBLE_SOURCES);
  const hidden = documents.length - shown.length;
  const hasBody = queries.length > 0 || documents.length > 0;

  return (
    <div className="flex flex-col gap-2.5 font-inter">
      {summary}
      {hasBody && !failed && !noResults && (
        <Collapsible open={expanded}>
          <div className="flex flex-col border-l-[1.5px] border-gray-3">
            {queries.length > 0 && <GroupLabel first>Searched for</GroupLabel>}
            {queries.map((q) => (
              <Row key={q}>
                <PiSearchDefaultStroke size={14} className="shrink-0 text-text-secondary" />
                <span className="truncate text-label-14 text-text-secondary">“{q}”</span>
              </Row>
            ))}
            {documents.length > 0 && <GroupLabel>Found in</GroupLabel>}
            <FluidList highlightClassName="rounded-l-none rounded-r-[8px] bg-bg-app">
              {shown.map((doc) => (
                <Row key={doc.name} tall fluidKey={doc.name}>
                  <SourceIcon name={doc.name} />
                  <span className="min-w-0 flex-1 truncate text-label-14 font-medium text-text">
                    {doc.name}
                  </span>
                  <span className="shrink-0 text-label-12 text-text-placeholder">
                    {doc.passages} {doc.passages === 1 ? 'passage' : 'passages'}
                    {doc.pages.length > 0 && ` · p. ${doc.pages.slice(0, 3).join(', ')}`}
                  </span>
                </Row>
              ))}
            </FluidList>
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex w-fit cursor-pointer items-center gap-1.5 pt-2 pb-0.5 pl-3.5 text-label-13 font-medium text-text hover:opacity-70"
              >
                Show {hidden} more
                <PiChevronDownStroke size={14} />
              </button>
            )}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function SummaryLine({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className="shrink-0 text-label-14 font-medium text-text">{title}</span>
      {children && <span className="truncate text-label-14 text-text-secondary">{children}</span>}
    </span>
  );
}

function GroupLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <p
      className={cn(
        'pb-1 pl-3.5 text-label-12 font-medium text-text-placeholder',
        first ? 'pt-1.5' : 'pt-3',
      )}
    >
      {children}
    </p>
  );
}

function Row({
  children,
  tall = false,
  fluidKey,
}: {
  children: ReactNode;
  tall?: boolean;
  /** Joins the surrounding FluidList (the "Found in" documents). */
  fluidKey?: string;
}) {
  const fluidItem = useFluidItem(fluidKey);
  return (
    <div
      ref={fluidItem.ref}
      className={cn(
        'relative flex items-center gap-2.5 pr-2 pl-3.5 animate-in fade-in-0 slide-in-from-left-1 duration-300',
        tall ? 'h-[34px]' : 'h-[30px]',
      )}
    >
      {children}
    </div>
  );
}

type DocumentGroup = { name: string; passages: number; pages: number[] };

function groupByDocument(results: RetrievalResult[]): DocumentGroup[] {
  const map = new Map<string, DocumentGroup>();
  const seen = new Set<string>();
  for (const r of results) {
    // The same passage can come back from several queries — count it once.
    if (seen.has(r.chunkId)) continue;
    seen.add(r.chunkId);
    const doc = map.get(r.source) ?? { name: r.source, passages: 0, pages: [] };
    doc.passages += 1;
    if (r.page !== null && !doc.pages.includes(r.page)) doc.pages.push(r.page);
    map.set(r.source, doc);
  }
  for (const doc of map.values()) doc.pages.sort((a, b) => a - b);
  return [...map.values()].sort((a, b) => b.passages - a.passages);
}
