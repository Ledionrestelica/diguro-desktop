import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import {
  FileTooLarge,
  Forbidden,
  UnsupportedMimeType,
} from '@diguro/shared/errors';

/**
 * User-scoped attachments (currently: profile avatar). S3 path layout:
 *
 *   user/<userId>/avatar/<uuid>.<ext>
 *
 * URL scheme stored on `users.image`: `avatar://<userId>/avatar/<uuid>.<ext>`.
 * Parallel to organization-/workspace-attachments but scoped to the USER.
 * The scheme keeps the reference storage-agnostic; the server resolves it to
 * a presigned HTTPS URL on read so the avatar renders without exposing the
 * bucket. (`users.image` may also hold a plain https:// URL from an OAuth
 * provider — those are passed through untouched.)
 */

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export const ALLOWED_AVATAR_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const AVATAR_URL_SCHEME = 'avatar://';

export interface PresignAvatarInput {
  userId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface PresignAvatarResult {
  url: string;
  upload: PresignedPut;
}

export async function presignUserAvatar(
  deps: { objectStore: ObjectStore },
  input: PresignAvatarInput,
): Promise<PresignAvatarResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_AVATAR_BYTES) {
    throw new FileTooLarge(
      `Avatar must be between 1 byte and ${MAX_AVATAR_BYTES} bytes`,
    );
  }
  if (!ALLOWED_AVATAR_MIME.has(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const id = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const key = avatarKey({ userId: input.userId, id, ext });
  const upload = await deps.objectStore.presignPut({
    key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });
  return {
    url: `${AVATAR_URL_SCHEME}${input.userId}/avatar/${id}${ext}`,
    upload,
  };
}

export async function resolveUserAvatarUrl(
  deps: { objectStore: ObjectStore },
  input: { userId: string; url: string },
): Promise<string> {
  const parsed = parseAvatarUrl(input.url);
  if (parsed.userId !== input.userId) {
    throw new Forbidden('Avatar attachment URL does not match user');
  }
  return deps.objectStore.presignGet({ key: avatarKey(parsed) });
}

export async function deleteUserAvatar(
  deps: { objectStore: ObjectStore },
  input: { userId: string; url: string },
): Promise<void> {
  if (!input.url.startsWith(AVATAR_URL_SCHEME)) return;
  const parsed = parseAvatarUrl(input.url);
  if (parsed.userId !== input.userId) return;
  await deps.objectStore.delete(avatarKey(parsed));
}

function parseAvatarUrl(url: string): {
  userId: string;
  id: string;
  ext: string;
} {
  if (!url.startsWith(AVATAR_URL_SCHEME)) {
    throw new Forbidden('Not an avatar attachment URL');
  }
  const remainder = url.slice(AVATAR_URL_SCHEME.length);
  const match = /^([^/]+)\/avatar\/([^/]+?)(\.[a-z0-9]{1,8})?$/i.exec(remainder);
  if (!match) throw new Forbidden('Malformed avatar attachment URL');
  return {
    userId: match[1]!,
    id: match[2]!,
    ext: match[3] ?? '',
  };
}

function avatarKey(p: { userId: string; id: string; ext: string }): string {
  return `user/${p.userId}/avatar/${p.id}${p.ext}`;
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
