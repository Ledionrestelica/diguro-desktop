import type { ObjectStore, PresignedPut } from '../../ports/objectStore.ts';
import {
  FileTooLarge,
  Forbidden,
  UnsupportedMimeType,
} from '@diguro/shared/errors';

/**
 * Chat attachments live under `chat/<userId>/<conversationId>/<uuid>.<ext>`.
 * They are NOT Resources — no chunking, no embeddings, no reconciliation.
 * Lifetime is bound to the conversation; deleting the conversation wipes
 * every object under its prefix.
 *
 * The URL we store on `FilePart.url` is `s3://<bucket-logical>/<key>` — the
 * bucket name is not encoded in the URL (it comes from config). This keeps
 * the stored URL storage-agnostic: swap providers later by re-pointing
 * `chat:` URIs to a different adapter, no DB migration required.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_PREFIXES = ['image/'] as const;
export const ALLOWED_MIME_EXACT = new Set<string>([
  'application/pdf',
]);

export const CHAT_URL_SCHEME = 'chat://';

export interface PresignChatAttachmentInput {
  userId: string;
  conversationId: string;
  filename: string;
  contentType: string;
  contentLength: number;
}

export interface PresignChatAttachmentResult {
  /** Canonical URL stored on the message, e.g. `chat://<userId>/<convId>/<uuid>`. */
  url: string;
  /** Presigned PUT the client uses to upload bytes. */
  upload: PresignedPut;
}

export async function presignChatAttachment(
  deps: { objectStore: ObjectStore },
  input: PresignChatAttachmentInput,
): Promise<PresignChatAttachmentResult> {
  if (input.contentLength <= 0 || input.contentLength > MAX_ATTACHMENT_BYTES) {
    throw new FileTooLarge(
      `Chat attachments must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`,
    );
  }
  if (!isAllowedMime(input.contentType)) {
    throw new UnsupportedMimeType(input.contentType);
  }

  const id = crypto.randomUUID();
  const ext = extensionFromFilename(input.filename);
  const key = chatAttachmentKey({
    userId: input.userId,
    conversationId: input.conversationId,
    id,
    ext,
  });
  const upload = await deps.objectStore.presignPut({
    key,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });

  return {
    url: `${CHAT_URL_SCHEME}${input.userId}/${input.conversationId}/${id}${ext}`,
    upload,
  };
}

export interface ResolveChatAttachmentInput {
  userId: string;
  url: string;
}

/**
 * Turn a stored `chat://` URL into a presigned GET URL the client or the
 * model can fetch. Throws Forbidden if the URL doesn't belong to the caller.
 */
export async function resolveChatAttachmentUrl(
  deps: { objectStore: ObjectStore },
  input: ResolveChatAttachmentInput,
): Promise<string> {
  const parsed = parseChatUrl(input.url);
  if (parsed.userId !== input.userId) throw new Forbidden();
  return deps.objectStore.presignGet({
    key: chatAttachmentKey(parsed),
  });
}

/**
 * Rewrite any `chat://` URL on FileParts into a presigned GET URL. Non-chat
 * URLs pass through untouched. Used server-side before handing messages to
 * the model, and before returning messages to the client for display.
 *
 * Returns a new parts array; does not mutate input.
 */
export async function resolveAttachmentUrlsInParts<
  T extends { type: string; url?: unknown },
>(
  deps: { objectStore: ObjectStore },
  input: { userId: string; parts: readonly T[] },
): Promise<T[]> {
  const out: T[] = [];
  for (const raw of input.parts) {
    if (
      raw.type !== 'file' ||
      typeof raw.url !== 'string' ||
      !raw.url.startsWith(CHAT_URL_SCHEME)
    ) {
      out.push(raw);
      continue;
    }
    try {
      const resolved = await resolveChatAttachmentUrl(deps, {
        userId: input.userId,
        url: raw.url,
      });
      out.push({ ...raw, url: resolved });
    } catch {
      out.push(raw);
    }
  }
  return out;
}

export async function deleteConversationAttachments(
  deps: { objectStore: ObjectStore },
  input: { userId: string; conversationId: string },
): Promise<number> {
  const prefix = `chat/${input.userId}/${input.conversationId}/`;
  return deps.objectStore.deletePrefix(prefix);
}

function parseChatUrl(url: string): {
  userId: string;
  conversationId: string;
  id: string;
  ext: string;
} {
  if (!url.startsWith(CHAT_URL_SCHEME)) {
    throw new Forbidden('Not a chat attachment URL');
  }
  const remainder = url.slice(CHAT_URL_SCHEME.length);
  const [userId, conversationId, rest] = remainder.split('/', 3);
  if (!userId || !conversationId || !rest) {
    throw new Forbidden('Malformed chat attachment URL');
  }
  const dotIdx = rest.lastIndexOf('.');
  const id = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
  const ext = dotIdx === -1 ? '' : rest.slice(dotIdx);
  return { userId, conversationId, id, ext };
}

function chatAttachmentKey(p: {
  userId: string;
  conversationId: string;
  id: string;
  ext: string;
}): string {
  return `chat/${p.userId}/${p.conversationId}/${p.id}${p.ext}`;
}

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function extensionFromFilename(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  const ext = name.slice(idx).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
}
