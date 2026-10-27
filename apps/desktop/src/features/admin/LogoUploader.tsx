import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PiUploadUpStroke } from '@/components/icons/pika/PiUploadUpStroke';
import { WorkspaceGlyph } from '@/features/workspaces/WorkspaceGlyph';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';

/**
 * Generic logo uploader (Figma "Settings · Organization · General · v2"):
 * a large logo tile with an upload badge, where the logo shows, file
 * requirements, and Upload / Remove. Agnostic about whether it's uploading
 * an org or workspace logo: the caller passes two async functions that
 * drive the two-step flow (presign → PUT → commit).
 */
export interface PresignedLogoUpload {
  /** The canonical URL the server expects on commit (e.g. `org://...`). */
  url: string;
  upload: {
    /** Presigned S3 PUT URL. */
    url: string;
    headers: Record<string, string>;
    expiresAt: Date;
  };
}

export interface LogoUploaderProps {
  /** Currently stored URL (already resolved to https). Null = no logo. */
  logoUrl: string | null;
  /** Deterministic seed for the fallback gradient glyph. */
  glyphSeed: string;
  /** Ask the server to presign a PUT URL for this file. */
  onPresign: (file: File) => Promise<PresignedLogoUpload>;
  /** Commit the canonical URL to the entity (org / company). Pass null to clear. */
  onCommit: (url: string | null) => Promise<void>;
  /** Called after any successful write so the caller can invalidate caches. */
  onChanged: () => void;
  label?: string;
  /** Where the logo appears, shown under the label. */
  description?: string;
}

export function LogoUploader({
  logoUrl,
  glyphSeed,
  onPresign,
  onCommit,
  onChanged,
  label = 'Logo',
  description = 'Shown in the sidebar, on the sign-in page and in invite emails.',
}: LogoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const displaySrc = localPreview ?? logoUrl;

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use PNG, JPG, WEBP, SVG, or GIF.');
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

  function openPicker() {
    if (busy) return;
    fileInputRef.current?.click();
  }

  async function clearLogo() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onCommit(null);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove logo');
    } finally {
      setBusy(false);
    }
  }

  const hasLogo = !!(logoUrl || localPreview);

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          aria-label={hasLogo ? 'Change logo' : 'Upload logo'}
          className="group relative size-[104px] shrink-0 cursor-pointer rounded-full outline-none focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed"
        >
          <span className="grid size-full place-items-center overflow-hidden rounded-full border border-border-default bg-bg-subtle">
            {displaySrc ? (
              <img src={displaySrc} alt="" className="size-full object-cover" />
            ) : (
              <WorkspaceGlyph seed={glyphSeed} size={48} />
            )}
            {busy && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-bg-panel/60 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-text-secondary" />
              </span>
            )}
          </span>
          {!busy && (
            <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full border border-border-default bg-bg-panel text-text shadow-[0_2px_6px_rgba(16,24,40,0.12)] transition-transform group-hover:scale-105">
              <PiUploadUpStroke size={16} />
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-copy-14 font-semibold">{label}</p>
          <p className="text-label-13 text-text-secondary">{description}</p>
          <p className="text-label-12 text-text-placeholder">
            PNG, JPG, WEBP, SVG or GIF · square, at least 256 × 256 px · up to 10 MB
          </p>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={openPicker}
              disabled={busy}
              className="flex cursor-pointer items-center gap-1.5 rounded-[10px] border border-border-default bg-bg-panel py-[7px] pr-3 pl-2.5 text-label-13 font-medium text-text outline-none transition-colors hover:bg-hover focus-visible:shadow-[0_0_0_2px_var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PiUploadUpStroke size={16} />
              {busy ? 'Uploading…' : hasLogo ? 'Change logo' : 'Upload logo'}
            </button>
            {hasLogo && !busy && (
              <button
                type="button"
                onClick={() => void clearLogo()}
                className="cursor-pointer rounded-[10px] px-3 py-[7px] text-label-13 font-medium text-text-secondary outline-none transition-colors hover:text-danger-text focus-visible:shadow-[0_0_0_2px_var(--color-text)]"
              >
                Remove
              </button>
            )}
          </div>
        </div>
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
      {error && <p className="text-label-12 text-danger-text">{error}</p>}
    </div>
  );
}
