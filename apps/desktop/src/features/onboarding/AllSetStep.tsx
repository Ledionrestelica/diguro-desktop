import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { PiLockCloseStroke } from '@/components/icons/pika/PiLockCloseStroke';
import { ONBOARDING_SEGMENTS, OnboardingShell } from './OnboardingShell';
import { SourceList, SourceRow } from './SourceRow';

type AllSetStepProps = {
  scope: 'organization' | 'personal';
  firstName: string;
  uploadedCount: number;
  invitedEmails: string[];
  finishing: boolean;
  error: string | null;
  onBack: () => void;
  onFinish: () => void;
};

export function AllSetStep({
  scope,
  firstName,
  uploadedCount,
  invitedEmails,
  finishing,
  error,
  onBack,
  onFinish,
}: AllSetStepProps) {
  const hasRows = uploadedCount > 0 || invitedEmails.length > 0;

  return (
    <OnboardingShell
      segment={ONBOARDING_SEGMENTS}
      title={firstName ? `You’re all set, ${firstName}` : 'You’re all set'}
      subtitle={
        uploadedCount > 0
          ? 'Iserana is reading your files now. You can start asking right away, answers get better as more files are ready.'
          : 'Add files whenever you’re ready. Iserana answers from what you add.'
      }
      topOffset={136}
      badge={
        <span className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <PiCheckTickSingleStroke size={26} />
        </span>
      }
      onBack={onBack}
      onContinue={onFinish}
      continueLabel="Open Iserana"
      loading={finishing}
      error={error}
    >
      {hasRows && (
        <SourceList label="Setup summary">
          {uploadedCount > 0 && (
            <SourceRow
              tile={<PiUploadUpStroke size={20} className="text-text" />}
              tileClassName="border-0 bg-bg-subtle"
              title="Uploaded files"
              caption={
                <span className="text-label-13 text-text-secondary">
                  {uploadedCount} {uploadedCount === 1 ? 'file' : 'files'} · Reading
                </span>
              }
              trailing={<Check />}
            />
          )}
          {invitedEmails.length > 0 && (
            <SourceRow
              tile={<PiEnvelopeDefaultStroke size={20} className="text-text" />}
              tileClassName="border-0 bg-bg-subtle"
              title="Team"
              caption={
                <span className="truncate text-label-13 text-text-secondary">
                  {inviteSummary(invitedEmails)}
                </span>
              }
              trailing={<Check />}
            />
          )}
        </SourceList>
      )}

      {uploadedCount > 0 && (
        <p
          className={`flex items-start gap-2 text-label-13 text-text-secondary ${hasRows ? '-mt-4' : ''}`}
        >
          <PiLockCloseStroke size={16} className="shrink-0" />
          {scope === 'personal'
            ? 'Only you can see these files.'
            : 'Reading continues in the background. We’ll let you know when it’s done.'}
        </p>
      )}
    </OnboardingShell>
  );
}

function Check() {
  return <PiCheckTickSingleStroke size={18} className="shrink-0 text-success" ariaLabel="Done" />;
}

function inviteSummary(emails: string[]): string {
  const names = emails.map((e) => {
    const local = e.split('@')[0] ?? e;
    const first = local.split(/[._-]+/)[0] ?? local;
    return first.charAt(0).toUpperCase() + first.slice(1);
  });
  if (names.length === 1) return `Invite sent to ${names[0]}`;
  if (names.length === 2) return `Invites sent to ${names[0]} and ${names[1]}`;
  return `Invites sent to ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
