import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MessageCitation } from '../types';

export interface PreviewTarget {
  /** Every citation of the message the preview was opened from, by rank. */
  citations: MessageCitation[];
  index: number;
  /** The answer sentence each citation backs up, keyed by chunk id. */
  answers: Map<string, string>;
}

interface DocumentPreviewValue {
  target: PreviewTarget | null;
  open: (citations: MessageCitation[], index: number, answers: Map<string, string>) => void;
  setIndex: (index: number) => void;
  close: () => void;
}

const DocumentPreviewContext = createContext<DocumentPreviewValue | null>(null);

/**
 * Which cited passage the document preview beside the chat is showing. The
 * chat layout owns the state, since it also collapses the sidebar while a
 * document is open.
 */
export function DocumentPreviewProvider({
  target,
  onChange,
  children,
}: {
  target: PreviewTarget | null;
  onChange: (next: PreviewTarget | null) => void;
  children: ReactNode;
}) {
  const value = useMemo<DocumentPreviewValue>(
    () => ({
      target,
      open: (citations, index, answers) => onChange({ citations, index, answers }),
      setIndex: (index) => onChange(target ? { ...target, index } : null),
      close: () => onChange(null),
    }),
    [target, onChange],
  );
  return (
    <DocumentPreviewContext.Provider value={value}>{children}</DocumentPreviewContext.Provider>
  );
}

/** Null outside the chat layout, where citations aren't clickable. */
export function useDocumentPreview(): DocumentPreviewValue | null {
  return useContext(DocumentPreviewContext);
}
