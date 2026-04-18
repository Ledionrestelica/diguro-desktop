import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { z } from 'zod';
import { ToolCard, ToolError, ToolSkeleton, type ToolState } from './shared';

const ExtractionField = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'date', 'email', 'url']).default('text'),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  hint: z.string().optional(),
});

const ExtractionFormInput = z.object({
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(ExtractionField).min(1).max(30),
  sourceTitle: z.string().optional(),
});

type FieldT = z.infer<typeof ExtractionField>;

export function ExtractionFormTool({
  input,
  state,
}: {
  input: unknown;
  state: ToolState;
}) {
  if (state === 'input-streaming' || state === 'input-available') {
    return <ToolSkeleton eyebrow="Extraction" />;
  }
  if (state === 'output-error') return <ToolError eyebrow="Extraction" />;
  const parsed = ExtractionFormInput.safeParse(input);
  if (!parsed.success)
    return <ToolError eyebrow="Extraction" message="Invalid extraction data." />;
  const data = parsed.data;

  return (
    <ToolCard
      eyebrow="Extracted fields"
      title={data.title}
      {...(data.description ? { description: data.description } : {})}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {data.fields.map((f) => (
          <Field key={f.key} field={f} />
        ))}
      </dl>
      {data.sourceTitle && (
        <p className="mt-5 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          Extracted from <span className="text-zinc-700">{data.sourceTitle}</span>
        </p>
      )}
    </ToolCard>
  );
}

function Field({ field }: { field: FieldT }) {
  const display = formatValue(field);
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {field.label}
      </dt>
      <dd className="mt-1 flex items-start gap-2">
        <span className="min-w-0 flex-1 break-words text-sm text-zinc-900">
          {display === '' ? <span className="text-zinc-400">—</span> : display}
        </span>
        {display !== '' && <CopyButton value={display} />}
      </dd>
      {field.hint && <p className="mt-1 text-xs text-zinc-400">{field.hint}</p>}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
      aria-label={copied ? 'Copied' : 'Copy value'}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

function formatValue(f: FieldT): string {
  const v = f.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString();
  }
  if (f.type === 'date') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  return v;
}
