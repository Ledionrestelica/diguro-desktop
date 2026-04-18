import { ArrowLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useNewWorkspaceWizard } from './wizard-state';

/**
 * Final wizard step — creates the workspace via
 * adminOrganization.workspaceCreate, which atomically inserts the workspace,
 * makes the caller OWNER, and flips the active session workspace. On success
 * we invalidate caches and land on /chat.
 */
export function Step3Finalize() {
  const { back, draft } = useNewWorkspaceWizard();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const create = trpc.adminOrganization.workspaceCreate.useMutation();

  const canSubmit = draft.name.trim().length > 0 && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    const payload: {
      name: string;
      slug: string;
      description?: string;
    } = {
      name: draft.name.trim(),
      slug: toSlug(draft.name),
    };
    const desc = draft.description.trim();
    if (desc.length > 0) payload.description = desc;
    create.mutate(payload, {
      onSuccess: () => {
        void utils.workspaces.myList.invalidate();
        void utils.health.me.invalidate();
        void navigate('/chat');
      },
    });
  }

  return (
    <div className="flex w-[450px] flex-col gap-6">
      <div className="rounded-[12px] border border-zinc-200 bg-white p-5 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)]">
        <p className="text-sm font-semibold text-zinc-900">Review &amp; create</p>
        <p className="mt-1 text-xs text-zinc-500">
          You'll be added as the workspace owner and it will become your active workspace.
        </p>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <ReviewRow label="Name" value={draft.name.trim() || '—'} />
          <ReviewRow
            label="Description"
            value={draft.description.trim() || <span className="text-zinc-400">None</span>}
          />
        </dl>
      </div>

      {create.error && (
        <p className="text-sm text-red-600">
          {(create.error as { message: string }).message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-700 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors hover:bg-zinc-50 disabled:opacity-60"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-cyan-500 px-3 py-3 text-sm font-medium text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors',
            canSubmit ? 'hover:bg-cyan-600' : 'cursor-not-allowed opacity-60',
          )}
        >
          <Check className="size-4" />
          {create.isPending ? 'Creating…' : 'Create workspace'}
        </button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="flex-1 text-sm text-zinc-800">{value}</dd>
    </div>
  );
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
