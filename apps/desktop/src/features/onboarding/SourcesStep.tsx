import { PiGlobeStroke } from '@/components/icons/pika/PiGlobeStroke';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { PiLockCloseStroke } from '@/components/icons/pika/PiLockCloseStroke';
import { PiCheckTickSingleStroke } from '@/components/icons/pika/PiCheckTickSingleStroke';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OnboardingShell } from './OnboardingShell';
import { RowButton, SourceList, SourceRow } from './SourceRow';
import { SOURCES } from './sources';

type SourcesStepProps = {
  scope: 'organization' | 'personal';
  uploadedCount: number;
  onBrowse: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export function SourcesStep({
  scope,
  uploadedCount,
  onBrowse,
  onBack,
  onContinue,
}: SourcesStepProps) {
  const personal = scope === 'personal';
  const sources = SOURCES.filter((s) => !personal || !s.teamOnly);

  return (
    <OnboardingShell
      segment={personal ? 2 : 3}
      title={personal ? 'Connect your files' : 'Connect your sources'}
      subtitle={
        personal
          ? 'Only you can see what you add. Iserana answers from your own files.'
          : 'Iserana answers from the files you connect. Start with one, you can add more later.'
      }
      topOffset={163}
      onBack={onBack}
      onContinue={onContinue}
    >
      <SourceList label="Sources">
        {sources.map((source) => (
          <SourceRow
            key={source.id}
            tile={
              source.logo ? (
                <img src={source.logo} alt="" className="size-6 object-contain" />
              ) : (
                <PiGlobeStroke size={20} className="text-blue-9" />
              )
            }
            title={source.name}
            caption={<Caption>{source.description}</Caption>}
            trailing={
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <RowButton disabled>{source.action}</RowButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">Coming soon</TooltipContent>
              </Tooltip>
            }
          />
        ))}
        <SourceRow
          tile={<PiUploadUpStroke size={20} className="text-text" />}
          tileClassName="border-0 bg-bg-subtle"
          title="Upload from computer"
          caption={<Caption>PDF, Word, Excel or CSV</Caption>}
          trailing={
            uploadedCount > 0 ? (
              <button
                type="button"
                onClick={onBrowse}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-success-subtle py-1.5 pr-3 pl-2.5 text-label-13 font-medium text-success-text outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
              >
                <PiCheckTickSingleStroke size={14} />
                {uploadedCount} {uploadedCount === 1 ? 'file' : 'files'}
              </button>
            ) : (
              <RowButton onClick={onBrowse}>Browse</RowButton>
            )
          }
        />
      </SourceList>

      <p className="-mt-4 flex items-center gap-2 text-label-13 text-text-secondary">
        <PiLockCloseStroke size={16} className="shrink-0" />
        {personal
          ? 'Private to you. Team tools like Slack become available if you join an organization.'
          : 'Read-only access. You choose which folders Iserana reads next.'}
      </p>
    </OnboardingShell>
  );
}

function Caption({ children }: { children: string }) {
  return <span className="truncate text-label-13 text-text-secondary">{children}</span>;
}
