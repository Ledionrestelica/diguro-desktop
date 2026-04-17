import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Mic, Plus, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onStop?: () => void;
  /** Set while a response is streaming; disables send, exposes Stop. */
  streaming?: boolean;
  disabled?: boolean;
}

/**
 * Chat composer. Auto-growing textarea inside a rounded card with a subtle
 * blurred gradient glow behind it. Enter submits, Shift+Enter inserts newline.
 * While `streaming`, the plus/mic buttons collapse to a single Stop button.
 */
export function Composer({ onSend, onStop, streaming = false, disabled = false }: Props) {
  const [value, setValue] = useState('');

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled || streaming) return;
    onSend(trimmed);
    setValue('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[756px]">
      <div className="pointer-events-none absolute inset-x-0 -bottom-6 top-6 -z-0 overflow-hidden rounded-[35px] opacity-70 blur-[10px]">
        <div
          className="size-full"
          style={{
            backgroundImage:
              'linear-gradient(90deg, rgba(106, 169, 210, 0.8) 0%, rgba(235, 208, 249, 0.8) 33%, rgba(193, 230, 255, 0.8) 66%, rgba(198, 229, 245, 0.8) 100%)',
          }}
        />
      </div>

      <form
        onSubmit={submit}
        className="relative z-10 flex min-h-[128px] flex-col rounded-3xl border border-zinc-200 bg-[#fafafa] px-6 py-5"
      >
        <textarea
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Chat with AI"
          className="flex-1 resize-none bg-transparent text-base leading-6 text-zinc-800 outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />

        <div className="flex items-center justify-end gap-2 pt-4">
          {streaming ? (
            <CircleIconButton label="Stop" onClick={() => onStop?.()}>
              <Square className="size-3.5 fill-current" />
            </CircleIconButton>
          ) : (
            <>
              <CircleIconButton label="Attach" onClick={() => {}} disabled>
                <Plus className="size-4" />
              </CircleIconButton>
              <CircleIconButton label="Voice input" onClick={() => {}} disabled>
                <Mic className="size-4" />
              </CircleIconButton>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function CircleIconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}
