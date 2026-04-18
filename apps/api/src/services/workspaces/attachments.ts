import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import {
  FileTooLarge,
  Forbidden,
  UnsupportedMimeType,
} from '@diguro/shared/errors';

/**
 * Workspace-scoped attachments (currently: workspace logo). S3 path layout:
 *
 *   workspace/<workspaceId>/logo/<uuid>.<ext>
 *
 * URL scheme stored on the row: `workspace://<workspaceId>/logo/<uuid>.<ext>`.
 * Parallel to organization-attachments but scoped to the WORKSPACE, not the
 * organization. Each workspace admin can upload a workspace-specific logo
 * independent of the parent organization brand.
 */

export const MAX_WORKSPACE_LOGO_BYTES = 10 * 1024 * 1024;

export const ALLOWED_WORKSPACE_LOGO_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]);

export const WORKSPACE_URL_SCHEME = 'workspace://';

export interface PresignWorkspaceLogoInput {
  workspaceId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface PresignWorkspaceLogoResult {
  url: string;
  upload: PresignedPut;
}

export async function presignWorkspaceLogo(
  deps: { objectStore: ObjectStore },
  input: PresignWorkspaceLogoInput,
): Promise<PresignWorkspaceLogoResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_WORKSPACE_LOGO_BYTES) {
    throw new FileTooLarge(
      `Logo must be between 1 byte and ${MAX_WORKSPACE_LOGO_BYTES} bytes`,
    );
  }
  if (!ALLOWED_WORKSPACE_LOGO_MIME.has(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const id = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const key = workspaceLogoKey({ workspaceId: input.workspaceId, id, ext });
  const upload = await deps.objectStore.presignPut({
    key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });
  return {
    url: `${WORKSPACE_URL_SCHEME}${input.workspaceId}/logo/${id}${ext}`,
    upload,
  };
}

export async function resolveWorkspaceLogoUrl(
  deps: { objectStore: ObjectStore },
  input: { workspaceId: string; url: string },
): Promise<string> {
  const parsed = parseWorkspaceUrl(input.url);
  if (parsed.workspaceId !== input.workspaceId) {
    throw new Forbidden('Workspace attachment URL does not match workspace');
  }
  return deps.objectStore.presignGet({ key: workspaceLogoKey(parsed) });
}

export async function deleteWorkspaceAttachment(
  deps: { objectStore: ObjectStore },
  input: { workspaceId: string; url: string },
): Promise<void> {
  if (!input.url.startsWith(WORKSPACE_URL_SCHEME)) return;
  const parsed = parseWorkspaceUrl(input.url);
  if (parsed.workspaceId !== input.workspaceId) return;
  await deps.objectStore.delete(workspaceLogoKey(parsed));
}

function parseWorkspaceUrl(url: string): {
  workspaceId: string;
  id: string;
  ext: string;
} {
  if (!url.startsWith(WORKSPACE_URL_SCHEME)) {
    throw new Forbidden('Not a workspace attachment URL');
  }
  const remainder = url.slice(WORKSPACE_URL_SCHEME.length);
  const match = /^([^/]+)\/logo\/([^/]+?)(\.[a-z0-9]{1,8})?$/i.exec(remainder);
  if (!match) throw new Forbidden('Malformed workspace attachment URL');
  return {
    workspaceId: match[1]!,
    id: match[2]!,
    ext: match[3] ?? '',
  };
}

function workspaceLogoKey(p: { workspaceId: string; id: string; ext: string }): string {
  return `workspace/${p.workspaceId}/logo/${p.id}${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
