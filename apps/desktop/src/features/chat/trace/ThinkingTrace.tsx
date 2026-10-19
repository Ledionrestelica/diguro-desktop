import { useEffect, useState } from 'react';
import { Spinner } from '../sidebar/Spinner';

/** Live "Thinking · 2s" line (Figma steps trace, state 06) shown while the
 *  model works before any answer text arrives. */
export function ThinkingTrace({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      role="status"
      className="flex items-center gap-2 font-inter animate-in fade-in-0 duration-300"
    >
      <Spinner size={14} className="text-text" />
      <span className="thinking-shimmer text-label-14 font-medium">{label}</span>
      {seconds > 0 && <span className="text-label-14 text-text-secondary">· {seconds}s</span>}
    </div>
  );
}
