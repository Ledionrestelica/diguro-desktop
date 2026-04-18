import type { ReactNode } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type ToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

/**
 * Shared card frame for every generative-UI tool. Keeps the visual language
 * consistent — each tool component wraps its content in <ToolCard>.
 */
export function ToolCard({
  title,
  description,
  eyebrow,
  children,
  padded = true,
  className,
}: {
  title?: string;
  description?: string;
  /** Small uppercase label above the title (e.g. "Chart", "Table"). */
  eyebrow?: string;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'w-full max-w-[760px] gap-0 overflow-hidden border-zinc-200 bg-white shadow-none',
        className,
      )}
    >
      {(eyebrow ?? title ?? description) !== undefined && (
        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {eyebrow}
              </p>
            )}
            {title && (
              <h3 className="truncate text-[15px] font-semibold leading-tight text-zinc-900">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
            )}
          </div>
        </div>
      )}
      <div className={cn(padded && 'px-5 py-4')}>{children}</div>
    </Card>
  );
}

export function ToolSkeleton({ eyebrow }: { eyebrow: string }) {
  return (
    <Card className="w-full max-w-[760px] gap-0 overflow-hidden border-zinc-200 bg-white shadow-none">
      <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4">
        <Skeleton className="size-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            {eyebrow}
          </p>
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="space-y-2 px-5 py-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
      </div>
    </Card>
  );
}

export function ToolError({ eyebrow, message }: { eyebrow: string; message?: string }) {
  return (
    <Card className="w-full max-w-[760px] gap-0 overflow-hidden border-red-200 bg-red-50/40 shadow-none">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-red-100 text-red-600">
          <AlertCircle className="size-4" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
            {eyebrow} failed
          </p>
          <p className="mt-1 text-sm text-red-800">
            {message ?? "Couldn't render this output."}
          </p>
        </div>
      </div>
    </Card>
  );
}
