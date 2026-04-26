import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { OrganizationMark } from '@/features/organization/OrganizationMark';
import {
  NewWorkspaceWizardContext,
  type NewWorkspaceDraft,
  type NewWorkspaceWizardContextValue,
} from './wizard/wizard-state';
import { StepProgress } from './wizard/StepProgress';
import { Step1BasicInfo } from './wizard/Step1BasicInfo';
import { StepPlaceholder } from './wizard/StepPlaceholder';
import { Step3Finalize } from './wizard/Step3Finalize';
import { WorkspacePreviewCard } from './wizard/WorkspacePreviewCard';

/**
 * Full-screen 3-step wizard for creating a new workspace. Guards against
 * non-admins by redirecting back to /workspaces.
 *
 * Steps:
 *   1. Basic info — name + description (designed; live).
 *   2. Placeholder — branding / logo upload will land here.
 *   3. Review & create — real submit to adminOrganization.workspaceCreate.
 *
 * Cancel at any point returns to the picker without a partial save.
 */
export function NewWorkspaceWizardPage() {
  const navigate = useNavigate();
  const me = trpc.health.me.useQuery();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraftState] = useState<NewWorkspaceDraft>({
    name: '',
    description: '',
  });

  const setDraft = useCallback((patch: Partial<NewWorkspaceDraft>) => {
    setDraftState((prev) => ({ ...prev, ...patch }));
  }, []);

  const cancel = useCallback(() => void navigate('/workspaces'), [navigate]);

  const ctx = useMemo<NewWorkspaceWizardContextValue>(
    () => ({
      step,
      draft,
      setDraft,
      goTo: setStep,
      next: () => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s)),
      back: () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s)),
      cancel,
    }),
    [step, draft, setDraft, cancel],
  );

  // Superadmins don't manage workspaces — they're platform tier only.
  if (me.data?.role === 'superadmin') {
    return <Navigate to="/admin/platform" replace />;
  }
  const canAdmin = me.data?.role === 'organization_admin';
  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f9fafb] text-sm text-zinc-500">
        Loading…
      </div>
    );
  }
  if (!canAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f9fafb]">
        <div className="max-w-md rounded-[12px] border border-zinc-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-zinc-900">Admin access required</p>
          <p className="mt-1 text-sm text-zinc-600">
            Only organization admins can create workspaces.
          </p>
          <button
            type="button"
            onClick={cancel}
            className="mt-4 rounded-[10px] border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back to picker
          </button>
        </div>
      </div>
    );
  }

  return (
    <NewWorkspaceWizardContext.Provider value={ctx}>
      <div className="relative min-h-screen bg-[#f9fafb] px-16 py-[117px]">
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel"
          className="absolute right-6 top-6 grid size-9 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-[0px_1px_2px_0px_rgba(16,24,40,0.04)] transition-colors hover:bg-zinc-50"
        >
          <X className="size-4" />
        </button>

        <div className="mx-auto flex max-w-[1280px] items-start justify-between gap-12">
          <div className="flex flex-col gap-[30px]">
            {me.data?.organization && (
              <div className="flex items-center gap-2">
                <OrganizationMark
                  logoUrl={me.data.organization.logoUrl}
                  seed={me.data.organization.id}
                  primaryColor={me.data.organization.primaryColor}
                  size={24}
                  alt={me.data.organization.name}
                />
                <span className="text-sm font-medium leading-5 text-zinc-600">
                  {me.data.organization.name}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-3.5">
              <StepProgress current={step} />
              <h1 className="w-[380px] text-[24px] font-bold leading-8 tracking-[-0.48px] text-zinc-800">
                Create a new workspace
              </h1>
              <p className="text-sm font-medium leading-5 text-neutral-500">
                {stepSubtitle(step)}
              </p>
            </div>

            <div className="pt-2">
              {step === 1 && <Step1BasicInfo />}
              {step === 2 && (
                <StepPlaceholder
                  title="Branding & logo"
                  eta="Coming next — upload a logo and pick a color."
                />
              )}
              {step === 3 && <Step3Finalize />}
            </div>
          </div>

          <WorkspacePreviewCard
            name={draft.name}
            memberCount={0}
            {...(draft.logoDataUrl ? { logoDataUrl: draft.logoDataUrl } : {})}
          />
        </div>
      </div>
    </NewWorkspaceWizardContext.Provider>
  );
}

function stepSubtitle(step: 1 | 2 | 3): string {
  if (step === 1) return 'Give your workspace a name and a short description.';
  if (step === 2) return 'Upload a logo and pick a color (optional).';
  return 'Review the details and create your workspace.';
}
