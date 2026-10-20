import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cn } from '@/lib/utils';
import { MentionChip } from './MentionChip';

export interface MentionedFile {
  id: string;
  name: string;
}

export interface ComposerInputHandle {
  /** Drops the file chip in place of the typed `#query`, or at the caret. */
  insertMention: (file: MentionedFile) => void;
  clear: () => void;
  focus: () => void;
}

interface Props {
  disabled?: boolean | undefined;
  placeholder: string;
  /** `text` carries the chip as `#File name`; `mention` is the chip's file. */
  onChange: (text: string, mention: MentionedFile | null) => void;
  /** The `#query` being typed at the caret, or null when there is none. */
  onMentionQuery: (query: string | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Runs first; call `preventDefault` to take over (pasted files). */
  onPaste: (e: ClipboardEvent<HTMLDivElement>) => void;
  onBlur: () => void;
}

type MentionRange = { node: Text; start: number; end: number };

/**
 * The chat box's text field. A contenteditable rather than a textarea so a
 * picked file can sit inline as a chip (Figma "Chat - Final"). The chip is a
 * non-editable span, so the browser moves past it and deletes it whole.
 * One file per message: picking another replaces it.
 */
export const ComposerInput = forwardRef<ComposerInputHandle, Props>(function ComposerInput(
  { disabled, placeholder, onChange, onMentionQuery, onKeyDown, onPaste, onBlur },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mentionRangeRef = useRef<MentionRange | null>(null);
  // The + menu's picker takes focus, so remember where the caret was.
  const lastRangeRef = useRef<Range | null>(null);

  function emitChange() {
    const root = rootRef.current;
    if (!root) return;
    const { text, mention } = serialize(root);
    // An emptied field keeps a stray <br>; clear it so the placeholder shows.
    if (text.trim() === '' && !mention && root.innerHTML !== '') root.innerHTML = '';
    onChange(text, mention);
  }

  function trackCaret() {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    lastRangeRef.current = range.cloneRange();
    mentionRangeRef.current = mentionAtCaret(selection);
    onMentionQuery(
      mentionRangeRef.current
        ? mentionRangeRef.current.node.data.slice(
            mentionRangeRef.current.start + 1,
            mentionRangeRef.current.end,
          )
        : null,
    );
  }

  function insertNodes(range: Range, nodes: Node[]) {
    range.deleteContents();
    for (const node of [...nodes].reverse()) range.insertNode(node);
    const last = nodes[nodes.length - 1];
    if (!last) return;
    const caret = document.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(caret);
  }

  useImperativeHandle(ref, () => ({
    insertMention(file) {
      const root = rootRef.current;
      if (!root) return;
      root.focus();
      for (const old of root.querySelectorAll('[data-mention-id]')) old.remove();

      let range: Range;
      const typed = mentionRangeRef.current;
      if (typed && root.contains(typed.node) && typed.end <= typed.node.length) {
        range = document.createRange();
        range.setStart(typed.node, typed.start);
        range.setEnd(typed.node, typed.end);
      } else if (lastRangeRef.current && root.contains(lastRangeRef.current.startContainer)) {
        range = lastRangeRef.current;
      } else {
        range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
      }
      insertNodes(range, [createChip(file), document.createTextNode(' ')]);
      mentionRangeRef.current = null;
      onMentionQuery(null);
      emitChange();
    },
    clear() {
      if (rootRef.current) rootRef.current.innerHTML = '';
      mentionRangeRef.current = null;
      lastRangeRef.current = null;
      onChange('', null);
    },
    focus() {
      rootRef.current?.focus();
    },
  }));

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-multiline
      aria-label="Message"
      aria-disabled={disabled || undefined}
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={() => {
        emitChange();
        trackCaret();
      }}
      onKeyUp={trackCaret}
      onMouseUp={trackCaret}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onPaste={(e) => {
        onPaste(e);
        if (e.defaultPrevented) return;
        // Plain text only: rich pastes would bring their own markup in.
        e.preventDefault();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        insertNodes(selection.getRangeAt(0), [
          document.createTextNode(e.clipboardData.getData('text/plain')),
        ]);
        emitChange();
        trackCaret();
      }}
      className={cn(
        'max-h-60 w-full overflow-y-auto text-label-13 leading-5 font-medium break-words whitespace-pre-wrap text-text outline-none',
        'empty:before:pointer-events-none empty:before:text-text-placeholder empty:before:content-[attr(data-placeholder)]',
        disabled && 'opacity-50',
      )}
    />
  );
});

function createChip(file: MentionedFile): HTMLElement {
  const holder = document.createElement('span');
  holder.innerHTML = renderToStaticMarkup(<MentionChip name={file.name} />);
  const chip = holder.firstElementChild;
  if (!(chip instanceof HTMLElement)) throw new Error('MentionChip rendered no element');
  chip.contentEditable = 'false';
  chip.dataset['mentionId'] = file.id;
  chip.dataset['mentionName'] = file.name;
  return chip;
}

/** `#query` right before a collapsed caret, if `#` starts a word. */
function mentionAtCaret(selection: Selection): MentionRange | null {
  if (!selection.isCollapsed) return null;
  const node = selection.anchorNode;
  if (!(node instanceof Text)) return null;
  const before = node.data.slice(0, selection.anchorOffset);
  const match = before.match(/(?:^|\s)#([^\s#]*)$/);
  if (!match || match[1] === undefined) return null;
  return {
    node,
    start: selection.anchorOffset - match[1].length - 1,
    end: selection.anchorOffset,
  };
}

/** The field as plain text, with the chip written as `#File name`. */
function serialize(root: HTMLElement): { text: string; mention: MentionedFile | null } {
  let text = '';
  let mention: MentionedFile | null = null;
  const walk = (parent: Node) => {
    for (const node of parent.childNodes) {
      if (node instanceof Text) {
        text += node.data;
      } else if (node instanceof HTMLElement) {
        const { mentionId, mentionName } = node.dataset;
        if (mentionId && mentionName) {
          mention = { id: mentionId, name: mentionName };
          text += `#${mentionName}`;
        } else if (node.tagName === 'BR') {
          text += '\n';
        } else {
          if (text !== '' && !text.endsWith('\n')) text += '\n';
          walk(node);
        }
      }
    }
  };
  walk(root);
  return { text, mention };
}
