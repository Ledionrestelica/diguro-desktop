import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PiArrowUpStroke } from '@/components/icons/pika/PiArrowUpStroke';

/** Figma "Chat Send Button": empty (nothing to send), ready, thinking. */
export type SendButtonState = 'empty' | 'ready' | 'thinking';

/**
 * The chat box's send / stop button (Figma "Chat Send Button"). While a
 * reply streams, a darker arc travels round the ring (Thinking 1 → 4) and
 * the button stops the reply. Styles and motion live in motion.css.
 */
export function SendButton({
  state,
  uploading = false,
  onStop,
}: {
  state: SendButtonState;
  /** Files still uploading: shows a spinner and stays disabled. */
  uploading?: boolean;
  onStop?: () => void;
}) {
  const thinking = state === 'thinking';
  const label = thinking ? 'Stop' : uploading ? 'Uploading…' : 'Send';
  let icon: ReactNode = <PiArrowUpStroke size={16} />;
  if (thinking) icon = <span aria-hidden className="size-[9.33px] rounded-[2.5px] bg-current" />;
  else if (uploading) icon = <Loader2 className="size-4 animate-spin" />;

  return (
    <button
      type={thinking ? 'button' : 'submit'}
      aria-label={label}
      title={label}
      data-state={state}
      disabled={state === 'empty'}
      onClick={thinking ? onStop : undefined}
      className="send-button cursor-pointer outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed"
    >
      <span className="send-button-orb">{icon}</span>
    </button>
  );
}
