import { z } from 'zod';
import { cn } from '@/lib/utils';
import { ToolCard, ToolError, ToolSkeleton, type ToolState } from './shared';

const ComparisonRow = z.object({
  label: z.string(),
  value: z.string(),
  emphasis: z.enum(['neutral', 'added', 'removed', 'changed']).optional(),
});

const ComparisonSide = z.object({
  label: z.string(),
  subtitle: z.string().optional(),
  rows: z.array(ComparisonRow).max(50),
});

const ComparisonInput = z.object({
  title: z.string(),
  description: z.string().optional(),
  left: ComparisonSide,
  right: ComparisonSide,
});

export function ComparisonTool({
  input,
  state,
}: {
  input: unknown;
  state: ToolState;
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <ToolSkeleton eyebrow="Comparison" />;
  }
  if (state === 'output-error') return <ToolError eyebrow="Comparison" />;
  const parsed = ComparisonInput.safeParse(input);
  if (!parsed.success)
    return <ToolError eyebrow="Comparison" message="Invalid comparison data." />;
  const { left, right, ...rest } = parsed.data;

  return (
    <ToolCard
      eyebrow="Comparison"
      title={rest.title}
      {...(rest.description ? { description: rest.description } : {})}
      padded={false}
    >
      <div className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Column side={left} />
        <Column side={right} />
      </div>
    </ToolCard>
  );
}

function Column({ side }: { side: z.infer<typeof ComparisonSide> }) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <p className="text-sm font-semibold text-zinc-900">{side.label}</p>
        {side.subtitle && <p className="text-xs text-zinc-500">{side.subtitle}</p>}
      </div>
      <dl className="divide-y divide-zinc-50">
        {side.rows.map((row, i) => (
          <div
            key={i}
            className={cn('flex items-start gap-4 px-5 py-3', emphasisBg(row.emphasis))}
          >
            <dt className="w-2/5 shrink-0 text-xs uppercase tracking-wider text-zinc-500">
              {row.label}
            </dt>
            <dd className={cn('flex-1 text-sm leading-5', emphasisText(row.emphasis))}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function emphasisBg(e?: 'neutral' | 'added' | 'removed' | 'changed'): string {
  if (e === 'added') return 'bg-emerald-50/60';
  if (e === 'removed') return 'bg-red-50/60';
  if (e === 'changed') return 'bg-amber-50/60';
  return '';
}

function emphasisText(e?: 'neutral' | 'added' | 'removed' | 'changed'): string {
  if (e === 'added') return 'text-emerald-800';
  if (e === 'removed') return 'text-red-800 line-through decoration-red-400/50';
  if (e === 'changed') return 'text-amber-900';
  return 'text-zinc-800';
}
