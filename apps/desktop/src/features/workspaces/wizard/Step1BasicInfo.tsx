import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNewWorkspaceWizard } from './wizard-state';

const MAX_NAME = 120;
const MAX_DESC = 500;

export function Step1BasicInfo() {
  const { draft, setDraft, next } = useNewWorkspaceWizard();
  const canAdvance = draft.name.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Workspace name" required>
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft({ name: e.target.value.slice(0, MAX_NAME) })}
          placeholder="Enter your workspace name"
          className="w-[301px] rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium leading-5 text-zinc-900 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none placeholder:text-zinc-500 focus:border-zinc-400"
        />
      </Field>

      <Field
        label="Description"
        hint="(optional)"
        sub="Shown on the workspace picker — helps teammates know what this space is for."
      >
        <textarea
          value={draft.description}
          onChange={(e) =>
            setDraft({ description: e.target.value.slice(0, MAX_DESC) })
          }
          placeholder="What will this workspace be used for?"
          rows={6}
          className="h-[166px] w-[450px] resize-none rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium leading-5 text-zinc-900 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] outline-none placeholder:text-zinc-500 focus:border-zinc-400"
        />
        <div className="flex w-[450px] justify-end">
          <span className="text-xs text-zinc-400">
            {draft.description.length} / {MAX_DESC}
          </span>
        </div>
      </Field>

      <button
        type="button"
        disabled={!canAdvance}
        onClick={next}
        className={cn(
          'inline-flex w-[450px] items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-cyan-500 px-3 py-3 text-sm font-medium leading-5 text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors',
          canAdvance ? 'hover:bg-cyan-600' : 'cursor-not-allowed opacity-60',
        )}
      >
        Next
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  sub,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium leading-5 text-black">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1 font-medium text-zinc-500">{hint}</span>}
      </p>
      {children}
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
