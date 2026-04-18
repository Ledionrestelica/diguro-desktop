import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WorkspaceGlyph } from '@/features/workspaces/WorkspaceGlyph';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/gif';

/**
 * Generic logo uploader — matches the Figma layout (238×171 card, 50px
 * gradient placeholder centered in the top 133px, full-width "Upload logo"
 * button along the bottom). Agnostic about whether it's uploading an org,
 * company, or user logo: the caller passes two async functions that
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
}

export function LogoUploader({
  logoUrl,
  glyphSeed,
  onPresign,
  onCommit,
  onChanged,
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium leading-5 text-black">Organization logo</p>

      <div className="flex items-start gap-4">
        <div className="flex flex-col items-stretch gap-2">
          <div className="relative h-[171px] w-[238px] overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
            <div className="flex h-[133px] items-center justify-center">
              {displaySrc ? (
                <img
                  src={displaySrc}
                  alt="Logo"
                  className="size-[70px] rounded-full object-cover"
                />
              ) : (
                <WorkspaceGlyph seed={glyphSeed} size={50} />
              )}
              {busy && (
                <div className="absolute inset-x-0 top-0 flex h-[133px] items-center justify-center bg-white/60 backdrop-blur-sm">
                  <Loader2 className="size-5 animate-spin text-zinc-500" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={openPicker}
              disabled={busy}
              className={cn(
                'flex h-[38px] w-full items-center justify-center gap-2 border-t border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition-colors',
                busy ? 'cursor-not-allowed opacity-60' : 'hover:bg-zinc-50',
              )}
            >
              {busy ? 'Uploading…' : 'Upload logo'}
              {!busy && <Upload className="size-4" />}
            </button>

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

          <p className="text-sm font-medium leading-5 text-zinc-500">
            Recommended size 1:1, up to 10MB
          </p>
        </div>

        {(logoUrl || localPreview) && !busy && (
          <button
            type="button"
            onClick={() => void clearLogo()}
            className="inline-flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600"
          >
            <Trash2 className="size-3.5" />
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
