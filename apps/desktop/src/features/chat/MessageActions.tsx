import { Copy, MoreHorizontal, RefreshCw, Share } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MessageActions() {
  return (
    <div className="flex w-fit items-center gap-3.5 rounded-full bg-white py-3 pl-4 pr-3 shadow-xs">
      <ActionButton icon={<Copy className="size-[18px]" />} label="Copy" />
      <ActionButton icon={<Share className="size-[18px]" />} label="Share" />
      <ActionButton icon={<RefreshCw className="size-[18px]" />} label="Regenerate" />
      <ActionButton icon={<MoreHorizontal className="size-[18px]" />} label="More" />
    </div>
  );
}

function ActionButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'grid size-[18px] place-items-center text-zinc-700 transition-colors hover:text-zinc-900',
      )}
    >
      {icon}
    </button>
  );
}
