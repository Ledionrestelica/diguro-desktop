import { FileText } from 'lucide-react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { ToolError, ToolSkeleton, type ToolState } from './shared';
import { Card } from '@/components/ui/card';

const DocumentCardInput = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  excerpt: z.string().optional(),
  resourceId: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  tags: z.array(z.string()).max(6).optional(),
});

export function DocumentCardTool({
  input,
  state,
}: {
  input: unknown;
  state: ToolState;
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <ToolSkeleton eyebrow="Document" />;
  }
  if (state === 'output-error') return <ToolError eyebrow="Document" />;
  const parsed = DocumentCardInput.safeParse(input);
  if (!parsed.success)
    return <ToolError eyebrow="Document" message="Invalid document data." />;
  const data = parsed.data;

  return (
    <Card className="w-full max-w-[760px] gap-0 overflow-hidden border-zinc-200 bg-white py-0 shadow-none">
      <div className="flex items-start gap-4 p-5">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
          <FileText className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-zinc-900">
            {data.title}
          </h3>
          {data.subtitle && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{data.subtitle}</p>
          )}
          {data.excerpt && (
            <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-700">
              {data.excerpt}
            </p>
          )}
          {(data.tags?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.tags?.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="border-zinc-200 bg-zinc-50 text-[11px] font-normal text-zinc-600"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {data.pageNumber !== undefined && (
            <p className="mt-3 text-[11px] uppercase tracking-wider text-zinc-400">
              Page {data.pageNumber}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
