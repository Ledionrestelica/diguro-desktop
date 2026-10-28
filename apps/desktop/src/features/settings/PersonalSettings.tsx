import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SettingsRow, SettingsSection } from '@/features/admin/SettingsSection';
import { dsButtonClass } from '@/components/ui/ds-button';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Settings · Account · Profile — edits the signed-in user's own profile (avatar +
 * display name). Email is shown read-only; changing the login email is an
 * auth-verification flow, not a plain profile edit. Persists via
 * `me.updateProfile` / `me.avatarPresignUpload`.
 */
export function PersonalSettings() {
  const profile = trpc.me.profileGet.useQuery();
  const update = trpc.me.updateProfile.useMutation();
  const presign = trpc.me.avatarPresignUpload.useMutation();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');

  useEffect(() => {
    if (profile.data) setName(profile.data.name);
  }, [profile.data]);

  const dirty = useMemo(
    () => !!profile.data && name.trim() !== profile.data.name.trim() && name.trim().length > 0,
    [profile.data, name],
  );

  function invalidate() {
    void utils.me.profileGet.invalidate();
    void utils.health.me.invalidate();
  }

  function handleSaveName() {
    if (!dirty) return;
    update.mutate({ name: name.trim() }, { onSuccess: invalidate });
  }

  if (profile.isLoading) {
    return <p className="text-label-13 text-text-secondary">Loading…</p>;
  }
  if (profile.error || !profile.data) {
    return (
      <p className="text-label-13 text-danger-text">
        {profile.error?.message ?? 'Could not load your profile.'}
      </p>
    );
  }

  return (
    <>
      <SettingsSection title="About you">
        <SettingsRow label="Photo" hint="Shown next to your messages and files.">
          <AvatarUploader
            imageUrl={profile.data.image}
            name={profile.data.name}
            email={profile.data.email}
            onPresign={async (file) =>
              presign.mutateAsync({
                filename: file.name,
                contentType: file.type,
                contentLength: file.size,
              })
            }
            onCommit={async (url) => {
              await update.mutateAsync({ image: url });
            }}
            onChanged={invalidate}
          />
        </SettingsRow>
        <SettingsRow label="Full name" hint="Shown to your workspace and on your messages.">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveName();
                }
              }}
              className="h-8 w-[220px]"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={!dirty || update.isPending}
              className={dsButtonClass({ variant: 'primary' })}
            >
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </SettingsRow>
        <SettingsRow label="Email" hint="Used to sign in. Ask an admin to change it.">
          <span className="text-copy-14 text-text-secondary">{profile.data.email}</span>
        </SettingsRow>
      </SettingsSection>

      {update.isError && (
        <p className="text-label-13 text-danger-text">Couldn’t save. Please try again.</p>
      )}
    </>
  );
}

interface AvatarUploaderProps {
  imageUrl: string | null;
  name: string;
  email: string;
  onPresign: (file: File) => Promise<{
    url: string;
    upload: { url: string; headers: Record<string, string> };
  }>;
  onCommit: (url: string | null) => Promise<void>;
  onChanged: () => void;
}

function AvatarUploader({
  imageUrl,
  name,
  email,
  onPresign,
  onCommit,
  onChanged,
}: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );

  const displaySrc = localPreview ?? imageUrl;

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use PNG, JPG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File must be under 10MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previewUrl);
    setBusy(true);
    try {
      const presigned = await onPresign(file);
      const putRes = await fetch(presigned.upload.url, {
        method: 'PUT',
        body: file,
        headers: presigned.upload.headers,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      await onCommit(presigned.url);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      URL.revokeObjectURL(previewUrl);
      setLocalPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function clearAvatar() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onCommit(null);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove photo');
    } finally {
      setBusy(false);
    }
  }

  const hasPhoto = !!(imageUrl || localPreview);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Change profile photo"
          className="group relative mr-1 grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-gray-4 text-label-14 font-semibold text-text outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
        >
          {displaySrc ? (
            <img src={displaySrc} alt="" className="size-full object-cover" />
          ) : (
            <span>{avatarInitials(name, email)}</span>
          )}
          <span
            className={cn(
              'absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity',
              busy ? 'opacity-100' : 'group-hover:opacity-100',
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <PiUploadUpStroke size={16} />}
          </span>
        </button>
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          disabled={busy}
          className={dsButtonClass()}
        >
          {busy ? 'Uploading…' : hasPhoto ? 'Change' : 'Upload photo'}
        </button>
        {hasPhoto && !busy && (
          <button
            type="button"
            onClick={() => void clearAvatar()}
            className={dsButtonClass({ variant: 'danger' })}
          >
            Remove
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-label-12 text-danger-text">{error}</p>}
    </div>
  );
}

function avatarInitials(name: string, email: string): string {
  const source = name.trim() || email.split('@')[0] || '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
  }
  return (source.slice(0, 2) || '·').toUpperCase();
}
