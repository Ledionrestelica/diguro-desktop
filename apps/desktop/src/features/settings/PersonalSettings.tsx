import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Personal settings tab — edits the signed-in user's own profile (avatar +
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
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (profile.error || !profile.data) {
    return (
      <p className="text-sm text-red-600">
        {profile.error?.message ?? 'Could not load your profile.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
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

      <Section
        label="Full name"
        hint="Shown to your workspace and on your messages."
      >
        <div className="flex max-w-[420px] items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveName();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSaveName}
            disabled={!dirty || update.isPending}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Section>

      <Section label="Email" hint="Used to sign in. Contact an admin to change it.">
        <Input value={profile.data.email} readOnly disabled className="max-w-[420px]" />
      </Section>

      {update.isError && (
        <p className="text-sm text-red-600">Couldn’t save — please try again.</p>
      )}
    </div>
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-black">Profile photo</p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => !busy && fileInputRef.current?.click()}
          disabled={busy}
          aria-label="Change profile photo"
          className="group relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-lg font-medium text-zinc-700"
        >
          {displaySrc ? (
            <img src={displaySrc} alt="" className="size-full object-cover" />
          ) : (
            <span>{avatarInitials(name, email)}</span>
          )}
          <span
            className={cn(
              'absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity',
              !busy && 'group-hover:opacity-100',
            )}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
          </span>
        </button>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => !busy && fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? 'Uploading…' : 'Upload photo'}
            </Button>
            {(imageUrl || localPreview) && !busy && (
              <button
                type="button"
                onClick={() => void clearAvatar()}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">PNG, JPG, WEBP, or GIF, up to 10MB.</p>
        </div>

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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-black">{label}</p>
        {hint && <p className="text-sm text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
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
