import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { TextField } from '@/components/ui/text-field';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { cn } from '@/lib/utils';
import { OnboardingShell } from './OnboardingShell';
import { OrgLogo } from './OrgLogo';
import { LogoCropDialog } from './LogoCropDialog';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MIN_LOGO_PX = 256;

type Logo = { blob: Blob; url: string; label: string };

type OrgProfileStepProps = {
  /** Set once the organization exists (e.g. after coming back with Back). */
  existing: { name: string; logoUrl: string | null } | null;
  onBack: () => void;
  onDone: (orgName: string) => void;
};

export function OrgProfileStep({ existing, onBack, onDone }: OrgProfileStepProps) {
  const [name, setName] = useState(existing?.name ?? '');
  const [logo, setLogo] = useState<Logo | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropLabel, setCropLabel] = useState('');
  const [removedExistingLogo, setRemovedExistingLogo] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Guards a retry after a failed logo upload from creating a second org.
  const created = useRef(existing !== null);
  const fileInput = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const createOrganization = trpc.onboarding.createOrganization.useMutation();
  const presignLogo = trpc.adminOrganization.logoPresignUpload.useMutation();
  const updateBranding = trpc.adminOrganization.organizationUpdateBranding.useMutation();

  useEffect(
    () => () => {
      if (logo) URL.revokeObjectURL(logo.url);
    },
    [logo],
  );

  const shownLogoUrl = logo?.url ?? (removedExistingLogo ? null : (existing?.logoUrl ?? null));
  const nameError = name.trim() ? null : 'Enter your organization’s name.';

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError('Use a PNG, JPG or SVG image.');
      return;
    }
    const size = await imageSize(file).catch(() => null);
    if (!size) {
      setLogoError('That image couldn’t be read.');
      return;
    }
    if (file.type !== 'image/svg+xml' && Math.min(size.w, size.h) < MIN_LOGO_PX) {
      setLogoError(`Use an image at least ${MIN_LOGO_PX} × ${MIN_LOGO_PX} px.`);
      return;
    }
    setCropLabel(`${file.name} · ${size.w} × ${size.h}`);
    setCropFile(file);
  }

  async function submit() {
    setShowErrors(true);
    if (nameError) return;
    setError(null);
    setSaving(true);
    try {
      if (!created.current) {
        await createOrganization.mutateAsync({ name: name.trim() });
        created.current = true;
      }

      let logoUrl: string | null | undefined;
      if (logo) {
        const presigned = await presignLogo.mutateAsync({
          filename: 'logo.png',
          contentType: 'image/png',
          contentLength: logo.blob.size,
        });
        const put = await fetch(presigned.upload.url, {
          method: 'PUT',
          body: logo.blob,
          headers: presigned.upload.headers,
        });
        if (!put.ok) throw new Error(`Logo upload failed (${put.status})`);
        logoUrl = presigned.url;
      } else if (removedExistingLogo) {
        logoUrl = null;
      }

      const nameChanged = existing && existing.name !== name.trim();
      if (nameChanged || logoUrl !== undefined) {
        await updateBranding.mutateAsync({
          ...(nameChanged ? { name: name.trim() } : {}),
          ...(logoUrl !== undefined ? { logoUrl } : {}),
        });
      }
      await utils.health.me.invalidate();
      onDone(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingShell
      segment={2}
      title="Set up your organization"
      subtitle="This is how your team will see Iserana. You can change it later in Settings."
      topOffset={163}
      onBack={onBack}
      onContinue={() => void submit()}
      loading={saving}
      error={error}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {shownLogoUrl ? (
            <OrgLogo src={shownLogoUrl} name={name} className="size-[72px] rounded-[16px]" />
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Upload logo"
              className="flex size-[72px] shrink-0 cursor-pointer items-center justify-center rounded-[16px] border border-dashed border-border-input bg-bg-raised text-text-secondary outline-none hover:border-border-hover focus-visible:shadow-[0_0_0_3px_var(--color-selection)]"
            >
              <PiUploadUpStroke size={22} />
            </button>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-label-14 font-medium">Organization logo</p>
            <p
              className={cn(
                'truncate text-label-13',
                logoError ? 'text-danger-text' : 'text-text-secondary',
              )}
            >
              {logoError ??
                (logo?.label ||
                  (shownLogoUrl ? 'Current logo' : 'PNG, JPG or SVG, at least 256 × 256 px.'))}
            </p>
            <div className="flex gap-1 pt-1.5">
              <SmallButton onClick={() => fileInput.current?.click()} outlined>
                {shownLogoUrl ? 'Replace' : 'Upload logo'}
              </SmallButton>
              {shownLogoUrl && (
                <SmallButton
                  onClick={() => {
                    setLogo(null);
                    setRemovedExistingLogo(true);
                  }}
                >
                  Remove
                </SmallButton>
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <TextField
          label="Organization name"
          placeholder="e.g. Acme"
          autoFocus={!existing}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          helper="Shown in the sidebar and on invitations."
          error={showErrors ? nameError : null}
        />
      </div>

      {(name.trim() || shownLogoUrl) && (
        <div className="flex flex-col gap-2.5">
          <p className="text-label-13 font-medium text-text-placeholder">Preview</p>
          <div className="flex items-center gap-2.5 rounded-[12px] border border-border px-3.5 py-3">
            <OrgLogo
              src={shownLogoUrl}
              name={name}
              className="size-6 rounded-[6px]"
              letterClassName="text-label-12 font-semibold"
            />
            <span className="min-w-0 flex-1 truncate text-label-14 font-medium">
              {name.trim() || 'Your organization'}
            </span>
          </div>
        </div>
      )}

      <LogoCropDialog
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onSave={(blob) => {
          setLogo({ blob, url: URL.createObjectURL(blob), label: cropLabel });
          setRemovedExistingLogo(false);
          setCropFile(null);
        }}
      />
    </OnboardingShell>
  );
}

function SmallButton({
  children,
  onClick,
  outlined = false,
}: {
  children: string;
  onClick: () => void;
  outlined?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[34px] cursor-pointer items-center rounded-[8px] px-3.5 text-button-14 outline-none focus-visible:shadow-[0_0_0_3px_var(--color-selection)]',
        outlined
          ? 'border border-border-input bg-bg-panel text-text hover:bg-hover'
          : 'text-text-secondary hover:bg-hover hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('unreadable image'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
