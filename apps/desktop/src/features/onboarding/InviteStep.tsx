import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { TextField } from '@/components/ui/text-field';
import { DsButton } from '@/components/ui/ds-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PiEnvelopeDefaultStroke } from '@/components/icons/pika/PiEnvelopeDefaultStroke';
import { PiChevronBigDownStroke } from '@/components/icons/pika/PiChevronBigDownStroke';
import { PiLockCloseStroke } from '@/components/icons/pika/PiLockCloseStroke';
import { OnboardingShell } from './OnboardingShell';
import { SourceList, SourceRow } from './SourceRow';

type Role = 'organization_admin' | 'user';
const ROLE_LABEL: Record<Role, string> = { organization_admin: 'Admin', user: 'Member' };

type Invitee = { email: string; role: Role; error?: string };

type InviteStepProps = {
  orgName: string;
  onBack: () => void;
  onDone: (invitedEmails: string[]) => void;
};

export function InviteStep({ orgName, onBack, onDone }: InviteStepProps) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [sending, setSending] = useState(false);
  const inviteCreate = trpc.adminOrganization.inviteCreate.useMutation();

  function add(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    const emails = draft
      .split(/[\s,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) return;
    const invalid = emails.find((v) => !/^\S+@\S+\.\S+$/.test(v));
    if (invalid) {
      setDraftError(`“${invalid}” isn’t a valid email address.`);
      return;
    }
    setInvitees((prev) => [
      ...prev,
      ...emails
        .filter((v) => !prev.some((p) => p.email === v))
        .map((email) => ({ email, role: 'user' as const })),
    ]);
    setDraft('');
    setDraftError(null);
  }

  async function sendAll() {
    if (draft.trim()) {
      add();
      return;
    }
    setSending(true);
    const sent: string[] = [];
    const failed: Invitee[] = [];
    for (const invitee of invitees) {
      try {
        await inviteCreate.mutateAsync({ email: invitee.email, role: invitee.role });
        sent.push(invitee.email);
      } catch (err) {
        failed.push({ ...invitee, error: err instanceof Error ? err.message : 'Couldn’t invite' });
      }
    }
    setSending(false);
    if (failed.length > 0) {
      setInvitees(failed);
      return;
    }
    onDone(sent);
  }

  return (
    <OnboardingShell
      segment={4}
      title="Invite your team"
      subtitle={`Add teammates to ${orgName}. They’ll get an email invite to join.`}
      topOffset={84}
      onBack={onBack}
      onContinue={() => void sendAll()}
      continueLabel={invitees.length > 0 ? 'Send invites' : 'Skip for now'}
      loading={sending}
    >
      <div className="flex items-start gap-3.5">
        <TextField
          label="Email address"
          hideLabel
          type="email"
          icon={<PiEnvelopeDefaultStroke />}
          placeholder="name@company.com"
          autoComplete="off"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(e);
          }}
          error={draftError}
          className="flex-1"
        />
        <DsButton variant="primary" size="md" onClick={() => add()} disabled={!draft.trim()}>
          Add
        </DsButton>
      </div>

      {invitees.length > 0 && (
        <SourceList label="People to invite">
          {invitees.map((invitee) => (
            <SourceRow
              key={invitee.email}
              tile={<span className="text-label-16 font-medium">{initials(invitee.email)}</span>}
              title={invitee.email}
              caption={
                invitee.error ? (
                  <span className="text-label-13 text-danger-text">{invitee.error}</span>
                ) : undefined
              }
              trailing={
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[8px] bg-bg-subtle px-3 text-button-14 text-text outline-none hover:bg-bg-subtle-hover focus-visible:shadow-[0_0_0_3px_var(--color-selection)]">
                    {ROLE_LABEL[invitee.role]}
                    <PiChevronBigDownStroke size={18} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="font-inter">
                    {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onSelect={() =>
                          setInvitees((prev) =>
                            prev.map((p) => (p.email === invitee.email ? { ...p, role } : p)),
                          )
                        }
                      >
                        {ROLE_LABEL[role]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        setInvitees((prev) => prev.filter((p) => p.email !== invitee.email))
                      }
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
          ))}
        </SourceList>
      )}

      <p className="-mt-4 flex items-center gap-2 text-label-13 text-text-secondary">
        <PiLockCloseStroke size={16} className="shrink-0" />
        Admins can manage members and sources. Members can search and chat.
      </p>
    </OnboardingShell>
  );
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : local.slice(0, 2);
  return letters.toUpperCase();
}
