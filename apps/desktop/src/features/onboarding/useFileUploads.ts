import { useCallback, useRef, useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { trpc } from '@/lib/trpc';

/**
 * Uploads files straight to S3 as they're added (initiate → PUT with
 * progress → confirm), for either the caller's organization or their
 * personal library. Mirrors the API's accepted types and size limit so bad
 * files are rejected before any request.
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
};

export const UPLOAD_ACCEPT = Object.keys(MIME_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',');

export type UploadState =
  | { kind: 'uploading'; progress: number }
  | { kind: 'ready'; resourceId: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'failed'; reason: string };

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  extension: string;
  state: UploadState;
};

export function useFileUploads(scope: 'organization' | 'personal') {
  const [items, setItems] = useState<UploadItem[]>([]);
  const requests = useRef(new Map<string, XMLHttpRequest>());

  const orgInitiate = trpc.adminOrganization.filesInitiateUpload.useMutation();
  const orgConfirm = trpc.adminOrganization.filesConfirmUpload.useMutation();
  const orgRemove = trpc.adminOrganization.filesRemove.useMutation();
  const meInitiate = trpc.me.filesInitiateUpload.useMutation();
  const meConfirm = trpc.me.filesConfirmUpload.useMutation();
  const meRemove = trpc.me.filesRemove.useMutation();

  const initiate = scope === 'organization' ? orgInitiate : meInitiate;
  const confirm = scope === 'organization' ? orgConfirm : meConfirm;
  const remove = scope === 'organization' ? orgRemove : meRemove;

  const update = useCallback((id: string, state: UploadState) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, state } : item)));
  }, []);

  const uploadOne = useCallback(
    async (id: string, file: File, contentType: string) => {
      try {
        const presigned = await initiate.mutateAsync({
          filename: file.name,
          contentType,
          contentLength: file.size,
        });
        await putWithProgress(
          presigned.upload.url,
          file,
          presigned.upload.headers,
          (p) => update(id, { kind: 'uploading', progress: p }),
          (xhr) => requests.current.set(id, xhr),
        );
        requests.current.delete(id);
        await confirm.mutateAsync({ versionId: presigned.versionId });
        update(id, { kind: 'ready', resourceId: presigned.resourceId });
      } catch (err) {
        requests.current.delete(id);
        if (err instanceof UploadAborted) return;
        update(id, { kind: 'failed', reason: failureReason(err) });
      }
    },
    [initiate, confirm, update],
  );

  const add = useCallback(
    (files: Iterable<File>) => {
      for (const file of files) {
        const id = crypto.randomUUID();
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const contentType = MIME_BY_EXTENSION[extension];
        const base = { id, name: file.name, size: file.size, extension };
        if (!contentType) {
          const reason = file.type.startsWith('image/')
            ? 'Images aren’t supported yet'
            : 'This file type isn’t supported';
          setItems((prev) => [...prev, { ...base, state: { kind: 'rejected', reason } }]);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setItems((prev) => [
            ...prev,
            { ...base, state: { kind: 'rejected', reason: 'Larger than 50 MB' } },
          ]);
          continue;
        }
        setItems((prev) => [...prev, { ...base, state: { kind: 'uploading', progress: 0 } }]);
        void uploadOne(id, file, contentType);
      }
    },
    [uploadOne],
  );

  const dismiss = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      requests.current.get(id)?.abort();
      if (item?.state.kind === 'ready') remove.mutate({ resourceId: item.state.resourceId });
      setItems((prev) => prev.filter((i) => i.id !== id));
    },
    [items, remove],
  );

  const readyCount = items.filter((i) => i.state.kind === 'ready').length;
  const busy = items.some((i) => i.state.kind === 'uploading');

  return { items, add, dismiss, readyCount, busy };
}

class UploadAborted extends Error {}

/** Domain errors (limits, unsupported type) are worth showing verbatim;
 *  server faults aren't. */
function failureReason(err: unknown): string {
  if (err instanceof TRPCClientError) {
    const code: unknown =
      err.data && typeof err.data === 'object' ? Reflect.get(err.data, 'code') : null;
    return code === 'INTERNAL_SERVER_ERROR' ? 'Couldn’t save this file. Try again.' : err.message;
  }
  return err instanceof Error ? err.message : 'Upload failed';
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  onStart: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.onabort = () => reject(new UploadAborted());
    onStart(xhr);
    xhr.send(file);
  });
}
