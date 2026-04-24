import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { z } from 'zod';
import { ToolCard, ToolError, ToolSkeleton, type ToolState } from './shared';

const ChartInput = z.object({
  kind: z.enum(['bar', 'line', 'pie', 'area']),
  title: z.string(),
  description: z.string().optional(),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
  series: z
    .array(z.object({ label: z.string(), value: z.number().finite() }))
    .min(1)
    .max(50),
  currency: z.string().max(3).optional(),
});

/**
 * A muted, chart-agnostic palette. Categorical pie slices walk this list; bar/
 * line/area use just the first color. Keeping the palette short and tonal
 * avoids the rainbow look that cheap chart libraries fall into by default.
 */
const PALETTE: readonly string[] = [
  '#18181b',
  '#52525b',
  '#a1a1aa',
  '#d4d4d8',
  '#71717a',
  '#27272a',
  '#3f3f46',
  '#e4e4e7',
];
/** The "primary" palette color the chart uses when only one series is drawn.
 *  Indexing `PALETTE[0]` on its own returns `string | undefined` under
 *  `noUncheckedIndexedAccess`, which recharts' typed props don't allow. */
const PRIMARY: string = '#18181b';

export function ChartTool({ input, state }: { input: unknown; state: ToolState }) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <ToolSkeleton eyebrow="Chart" />;
  }
  if (state === 'output-error') {
    return <ToolError eyebrow="Chart" />;
  }
  const parsed = ChartInput.safeParse(input);
  if (!parsed.success) return <ToolError eyebrow="Chart" message="Invalid chart data." />;

  return <ChartBody data={parsed.data} />;
}

function ChartBody({ data }: { data: z.infer<typeof ChartInput> }) {
  const formatValue = useMemo(() => {
    return (v: number): string => {
      if (data.currency) return `${data.currency}${formatNumber(v)}`;
      return formatNumber(v);
    };
  }, [data.currency]);

  return (
    <ToolCard
      eyebrow={kindLabel(data.kind)}
      title={data.title}
      {...(data.description ? { description: data.description } : {})}
    >
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(data, formatValue)}
        </ResponsiveContainer>
      </div>
    </ToolCard>
  );
}

function renderChart(
  data: z.infer<typeof ChartInput>,
  formatValue: (v: number) => string,
) {
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgba(228, 228, 231, 0.3)' }}
      contentStyle={{
        borderRadius: 8,
        border: '1px solid rgb(228, 228, 231)',
        fontSize: 12,
        padding: '6px 10px',
      }}
      formatter={(v: unknown) => {
        if (typeof v === 'number') return formatValue(v);
        if (typeof v === 'string') return v;
        return String(v ?? '');
      }}
    />
  );

  const axisProps = {
    tick: { fill: 'rgb(113, 113, 122)', fontSize: 11 },
    axisLine: { stroke: 'rgb(228, 228, 231)' },
    tickLine: { stroke: 'rgb(228, 228, 231)' },
  } as const;

  if (data.kind === 'bar') {
    return (
      <BarChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(244, 244, 245)" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatValue} />
        {tooltip}
        <Bar dataKey="value" fill={PRIMARY} radius={[6, 6, 0, 0]} />
      </BarChart>
    );
  }
  if (data.kind === 'line') {
    return (
      <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(244, 244, 245)" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatValue} />
        {tooltip}
        <Line
          type="monotone"
          dataKey="value"
          stroke={PRIMARY}
          strokeWidth={2}
          dot={{ fill: PRIMARY, r: 3 }}
        />
      </LineChart>
    );
  }
  if (data.kind === 'area') {
    return (
      <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.25} />
            <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(244, 244, 245)" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={formatValue} />
        {tooltip}
        <Area
          type="monotone"
          dataKey="value"
          stroke={PRIMARY}
          strokeWidth={2}
          fill="url(#area-fill)"
        />
      </AreaChart>
    );
  }
  return (
    <PieChart>
      {tooltip}
      <Pie
        data={data.series}
        dataKey="value"
        nameKey="label"
        innerRadius={50}
        outerRadius={90}
        paddingAngle={2}
      >
        {data.series.map((_, idx) => (
          <Cell
            key={idx}
            fill={PALETTE[idx % PALETTE.length] ?? PRIMARY}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ))}
      </Pie>
      <Legend
        verticalAlign="bottom"
        iconType="circle"
        iconSize={8}
        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
      />
    </PieChart>
  );
}

function kindLabel(kind: 'bar' | 'line' | 'pie' | 'area'): string {
  if (kind === 'bar') return 'Bar chart';
  if (kind === 'line') return 'Line chart';
  if (kind === 'pie') return 'Pie chart';
  return 'Area chart';
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}
