import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { apiAuth } from '@/lib/api-auth';
import { useAuth } from '@/app/auth-context';
import { PlanStep, type Plan } from './PlanStep';
import { OrgProfileStep } from './OrgProfileStep';
import { SourcesStep } from './SourcesStep';
import { UploadStep } from './UploadStep';
import { InviteStep } from './InviteStep';
import { AllSetStep } from './AllSetStep';
import { useFileUploads } from './useFileUploads';

/**
 * First-run onboarding after sign-up (Figma Onboarding steps 3–6):
 *   organization: plan → organization profile → sources (→ upload) → invite → all set
 *   personal:     plan → sources (→ upload) → all set
 * The organization is created when the profile step is submitted, so the
 * later steps can upload to it and invite into it.
 */

type Step = 'plan' | 'org-profile' | 'sources' | 'upload' | 'invite' | 'done';

export type OnboardingMe = {
  name: string;
  organization: { name: string; logoUrl: string | null } | null;
};

export function OnboardingFlow({
  me,
  onFinished,
}: {
  me: OnboardingMe;
  onFinished: (plan: Plan) => void;
}) {
  // Someone who already created their organization (then reloaded) resumes
  // at the sources step instead of being asked to create another.
  const [plan, setPlan] = useState<Plan | null>(me.organization ? 'organization' : null);
  const [step, setStep] = useState<Step>(me.organization ? 'sources' : 'plan');
  const [orgName, setOrgName] = useState(me.organization?.name ?? '');
  const [invited, setInvited] = useState<string[]>([]);
  const [finishError, setFinishError] = useState<string | null>(null);

  const { signOut } = useAuth();
  const complete = trpc.onboarding.complete.useMutation();
  const scope = plan === 'personal' ? 'personal' : 'organization';
  const uploads = useFileUploads(scope);

  async function finish() {
    setFinishError(null);
    try {
      await complete.mutateAsync();
      onFinished(plan ?? 'organization');
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  switch (step) {
    case 'plan':
      return (
        <PlanStep
          initial={plan}
          onBack={() => void apiAuth.signOut().finally(signOut)}
          onContinue={(next) => {
            setPlan(next);
            setStep(next === 'organization' ? 'org-profile' : 'sources');
          }}
        />
      );
    case 'org-profile':
      return (
        <OrgProfileStep
          existing={me.organization}
          onBack={() => setStep('plan')}
          onDone={(name) => {
            setOrgName(name);
            setStep('sources');
          }}
        />
      );
    case 'sources':
      return (
        <SourcesStep
          scope={scope}
          uploadedCount={uploads.readyCount}
          onBrowse={() => setStep('upload')}
          onBack={() => setStep(scope === 'organization' ? 'org-profile' : 'plan')}
          onContinue={() => setStep(scope === 'organization' ? 'invite' : 'done')}
        />
      );
    case 'upload':
      return (
        <UploadStep
          scope={scope}
          orgName={scope === 'organization' ? orgName : null}
          uploads={uploads}
          onDone={() => setStep('sources')}
        />
      );
    case 'invite':
      return (
        <InviteStep
          orgName={orgName}
          onBack={() => setStep('sources')}
          onDone={(emails) => {
            setInvited((prev) => [...prev, ...emails]);
            setStep('done');
          }}
        />
      );
    case 'done':
      return (
        <AllSetStep
          scope={scope}
          firstName={me.name.trim().split(/\s+/)[0] ?? ''}
          uploadedCount={uploads.readyCount}
          invitedEmails={invited}
          finishing={complete.isPending}
          error={finishError}
          onBack={() => setStep(scope === 'organization' ? 'invite' : 'sources')}
          onFinish={() => void finish()}
        />
      );
  }
}
