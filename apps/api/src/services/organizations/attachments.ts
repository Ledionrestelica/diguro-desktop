import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import {
  FileTooLarge,
  Forbidden,
  UnsupportedMimeType,
} from '@diguro/shared/errors';

/**
 * Organization-scoped attachments (currently: organization logo). S3 path:
 *
 *   organization/<organizationId>/logo/<uuid>.<ext>
 *
 * URL scheme stored on the row: `organization://<organizationId>/logo/<uuid>.<ext>`.
 * The scheme keeps the reference storage-agnostic — the bucket is not in
 * the URL. The server resolves these to presigned HTTPS URLs on read so
 * every member of the org can render the logo without exposing the bucket.
 */

export const MAX_LOGO_BYTES = 10 * 1024 * 1024;

export const ALLOWED_LOGO_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]);

export const ORGANIZATION_URL_SCHEME = 'organization://';

export interface PresignOrganizationLogoInput {
  organizationId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface PresignOrganizationLogoResult {
  url: string;
  upload: PresignedPut;
}

export async function presignOrganizationLogo(
  deps: { objectStore: ObjectStore },
  input: PresignOrganizationLogoInput,
): Promise<PresignOrganizationLogoResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_LOGO_BYTES) {
    throw new FileTooLarge(
      `Logo must be between 1 byte and ${MAX_LOGO_BYTES} bytes`,
    );
  }
  if (!ALLOWED_LOGO_MIME.has(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const id = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const key = organizationLogoKey({ organizationId: input.organizationId, id, ext });
  const upload = await deps.objectStore.presignPut({
    key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });
  return {
    url: `${ORGANIZATION_URL_SCHEME}${input.organizationId}/logo/${id}${ext}`,
    upload,
  };
}

export async function resolveOrganizationLogoUrl(
  deps: { objectStore: ObjectStore },
  input: { organizationId: string; url: string },
): Promise<string> {
  const parsed = parseOrganizationUrl(input.url);
  if (parsed.organizationId !== input.organizationId) {
    throw new Forbidden('Organization attachment URL does not match organization');
  }
  return deps.objectStore.presignGet({ key: organizationLogoKey(parsed) });
}

export async function deleteOrganizationAttachment(
  deps: { objectStore: ObjectStore },
  input: { organizationId: string; url: string },
): Promise<void> {
  if (!input.url.startsWith(ORGANIZATION_URL_SCHEME)) return;
  const parsed = parseOrganizationUrl(input.url);
  if (parsed.organizationId !== input.organizationId) return;
  await deps.objectStore.delete(organizationLogoKey(parsed));
}

function parseOrganizationUrl(url: string): {
  organizationId: string;
  id: string;
  ext: string;
} {
  if (!url.startsWith(ORGANIZATION_URL_SCHEME)) {
    throw new Forbidden('Not an organization attachment URL');
  }
  const remainder = url.slice(ORGANIZATION_URL_SCHEME.length);
  const match = /^([^/]+)\/logo\/([^/]+?)(\.[a-z0-9]{1,8})?$/i.exec(remainder);
  if (!match) throw new Forbidden('Malformed organization attachment URL');
  return {
    organizationId: match[1]!,
    id: match[2]!,
    ext: match[3] ?? '',
  };
}

function organizationLogoKey(p: {
  organizationId: string;
  id: string;
  ext: string;
}): string {
  return `organization/${p.organizationId}/logo/${p.id}${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
