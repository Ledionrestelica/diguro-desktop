import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useNewWorkspaceWizard } from './wizard-state';

/**
 * Temporary body for wizard steps whose design hasn't landed yet. Keeps the
 * shell navigable (Back / Next) so the 3-step flow is testable end-to-end.
 */
export function StepPlaceholder({
  title,
  eta,
}: {
  title: string;
  eta: string;
}) {
  const { back, next, step } = useNewWorkspaceWizard();
  const isLast = step === 3;

  return (
    <div className="flex w-[450px] flex-col gap-6">
      <div className="rounded-[12px] border border-dashed border-zinc-300 bg-white/60 p-6">
        <p className="text-sm font-medium text-zinc-800">{title}</p>
        <p className="mt-1 text-sm text-zinc-500">{eta}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors hover:bg-zinc-50"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={next}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-cyan-500 px-3 py-3 text-sm font-medium text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors hover:bg-cyan-600"
          >
            Next
            <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
