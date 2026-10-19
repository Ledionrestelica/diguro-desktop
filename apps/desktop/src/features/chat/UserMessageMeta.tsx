import { useEffect, useState } from 'react';
import { PiCheckTickDoubleStroke } from '@/components/icons/pika/PiCheckTickDoubleStroke';
import { PiCopyDefaultStroke } from '@/components/icons/pika/PiCopyDefaultStroke';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';

/** Under a user bubble: "4 mins ago ✓✓ copy" (Figma "Chat - Final"). */
export function UserMessageMeta({
  text,
  createdAt,
}: {
  text: string;
  createdAt?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!createdAt) return;
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [createdAt]);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 font-inter text-gray-8">
      {createdAt && <span className="text-label-12 font-medium">{relativeTime(createdAt)}</span>}
      <PiCheckTickDoubleStroke size={14} ariaLabel="Sent" />
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy message'}
        title={copied ? 'Copied' : 'Copy'}
        className="cursor-pointer rounded-[4px] outline-none hover:text-text-secondary focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
      >
        {copied ? <PiCheckTickSingleStroke size={14} /> : <PiCopyDefaultStroke size={14} />}
      </button>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
