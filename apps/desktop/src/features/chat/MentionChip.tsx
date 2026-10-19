import { FileTypeIcon } from './trace/SourceIcon';

/** Inline file chip (Figma "Chat - Final" chat box): sits in the text flow
 *  of the composer and of the sent user bubble. */
export function MentionChip({ name }: { name: string }) {
  return (
    <span
      title="The assistant answers from this file only"
      className="mx-0.5 inline-flex h-6 max-w-64 items-center gap-1 rounded-[8px] border border-gray-3 bg-bg-panel py-[3px] pr-1.5 pl-1 align-middle text-label-12 font-medium text-text shadow-[0_2px_4px_rgba(36,36,36,0.03)] select-none"
    >
      <FileTypeIcon name={name} size={12} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Text with the first `token` (`#File name`) drawn as a `MentionChip`. */
export function MentionText({ text, token }: { text: string; token: string | null }) {
  const start = token ? text.indexOf(token) : -1;
  if (!token || start < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <MentionChip name={token.slice(1)} />
      {text.slice(start + token.length)}
    </>
  );
}
