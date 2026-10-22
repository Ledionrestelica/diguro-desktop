import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { findHighlight } from './passageMatch';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PAGE_GAP = 16;
const PAD = 32;
const PAD_BOTTOM = 96;
const MAX_FIT_WIDTH = 760;

export interface PdfViewState {
  page: number;
  pageCount: number;
  /** Rendered size against the PDF's own size, in percent. */
  percent: number;
}

/**
 * A PDF as a vertical column of pages, opened at the cited page with the
 * words the answer relies on highlighted (Figma "Document preview -
 * Highlight"). Pages mount only near the viewport, so long documents stay
 * light. `zoom` scales the fit-to-width size; `goTo` scrolls to a page.
 */
export function PdfDocumentView({
  file,
  pageNumber,
  passage,
  answer,
  zoom,
  goTo,
  onState,
  onError,
}: {
  file: string;
  pageNumber: number;
  passage: string;
  answer: string;
  zoom: number;
  goTo: { page: number; seq: number } | null;
  onState: (state: PdfViewState) => void;
  onError: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [visible, setVisible] = useState({ from: 1, to: 1 });
  const [targetText, setTargetText] = useState<{ page: number; items: string[] } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitWidth = Math.max(0, Math.min(containerWidth - PAD * 2, MAX_FIT_WIDTH));
  const width = Math.round(fitWidth * zoom);
  const height = pageSize ? (width * pageSize.height) / pageSize.width : width * 1.294;
  const stride = height + PAGE_GAP;
  const percent = pageSize ? Math.round((width / pageSize.width) * 100) : 100;

  // Scroll events fire many times per frame; read the position once per
  // frame and only re-render when the mounted pages or the counter change.
  const frame = useRef(0);
  const last = useRef({ from: 0, to: 0, page: 0, percent: 0, pageCount: 0 });
  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el || pageCount === 0 || stride <= 0) return;
    const top = el.scrollTop - PAD;
    const from = clamp(Math.floor(top / stride), 1, pageCount);
    const to = clamp(Math.floor((top + el.clientHeight) / stride) + 2, 1, pageCount);
    const page = clamp(Math.floor((top + el.clientHeight / 2) / stride) + 1, 1, pageCount);
    const prev = last.current;
    if (from !== prev.from || to !== prev.to) setVisible({ from, to });
    if (page !== prev.page || percent !== prev.percent || pageCount !== prev.pageCount) {
      onState({ page, pageCount, percent });
    }
    last.current = { from, to, page, percent, pageCount };
  }, [pageCount, stride, percent, onState]);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(sync);
  }, [sync]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Keep the same spot in view when zooming.
  const prevStride = useRef(stride);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prevStride.current > 0 && prevStride.current !== stride) {
      el.scrollTop = (el.scrollTop - PAD) * (stride / prevStride.current) + PAD;
    }
    prevStride.current = stride;
    sync();
  }, [stride, sync]);

  // Bring the highlight into view once per opened passage, after it renders.
  const marked = useRef(false);
  const onTextRendered = useCallback(() => {
    if (marked.current) return;
    const mark = scrollRef.current?.querySelector('.pdf-cite-mark');
    if (!mark) return;
    marked.current = true;
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  // Open at the cited page once the layout is known.
  const opened = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const key = `${pageNumber}:${passage}`;
    if (!el || !pageSize || width === 0 || opened.current === key) return;
    opened.current = key;
    marked.current = false;
    el.scrollTop = PAD + (pageNumber - 1) * stride - 24;
    sync();
  }, [pageNumber, passage, pageSize, width, stride, sync]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !goTo) return;
    el.scrollTo({ top: PAD + (goTo.page - 1) * stride - 16, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request scrolls
  }, [goTo]);

  async function onLoad(pdf: PDFDocumentProxy) {
    setPageCount(pdf.numPages);
    const first = await pdf.getPage(1);
    const { width: w, height: h } = first.getViewport({ scale: 1 });
    setPageSize({ width: w, height: h });
  }

  const ranges = useMemo(
    () =>
      targetText && targetText.page === pageNumber
        ? findHighlight(targetText.items, passage, answer)
        : new Map<number, { start: number; end: number }>(),
    [targetText, pageNumber, passage, answer],
  );
  const onGetText = useCallback(
    ({ items }: { items: ({ str: string } | object)[] }) =>
      setTargetText({
        page: pageNumber,
        items: items.map((item) => ('str' in item ? item.str : '')),
      }),
    [pageNumber],
  );
  const renderText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) => {
      const r = ranges.get(itemIndex);
      if (!r) return escapeHtml(str);
      return (
        escapeHtml(str.slice(0, r.start)) +
        `<mark class="pdf-cite-mark">${escapeHtml(str.slice(r.start, r.end))}</mark>` +
        escapeHtml(str.slice(r.end))
      );
    },
    [ranges],
  );

  const pages: number[] = [];
  for (let p = 1; p <= pageCount; p++) pages.push(p);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-auto overscroll-contain">
      {/* Wider than the panel when zoomed in, so it scrolls sideways too. */}
      <div style={{ minWidth: width + PAD * 2, padding: `${PAD}px ${PAD}px ${PAD_BOTTOM}px` }}>
        <Document
          file={file}
          onLoadSuccess={(pdf) => void onLoad(pdf)}
          onLoadError={onError}
          loading={<PageSkeleton width={fitWidth} height={fitWidth * 1.294} />}
          error={null}
          className="flex flex-col items-center"
        >
          {width > 0 &&
            pages.map((p) => {
              const isTarget = p === pageNumber;
              const mounted = isTarget || (p >= visible.from && p <= visible.to);
              return (
                <div
                  key={p}
                  className="pdf-page shrink-0 overflow-hidden rounded-[8px] border border-gray-3 bg-white shadow-[0_4px_24px_-3px_rgba(16,24,40,0.1)]"
                  style={{ width, height, marginBottom: PAGE_GAP }}
                >
                  {mounted && (
                    <Page
                      pageNumber={p}
                      width={width}
                      renderAnnotationLayer={false}
                      loading={null}
                      {...(isTarget
                        ? {
                            onGetTextSuccess: onGetText,
                            customTextRenderer: renderText,
                            onRenderTextLayerSuccess: onTextRendered,
                          }
                        : {})}
                    />
                  )}
                </div>
              );
            })}
        </Document>
      </div>
    </div>
  );
}

function PageSkeleton({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="animate-pulse rounded-[8px] border border-gray-3 bg-gray-2"
      style={{ width, height }}
    />
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
