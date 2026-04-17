import { trpc } from '@/lib/trpc';

/**
 * Resolve a stored attachment URL to something the browser can load.
 *
 * - `chat://…` — canonical S3 reference. Hits tRPC for a presigned GET URL.
 * - `blob:…`, `data:…`, `http(s)://…` — passed through as-is (used during
 *    the upload flow before the server has a `chat://` URL for the bytes).
 *
 * The presigned URL TTL on the server is 60 min; we cache for 45 so a stale
 * URL never reaches the DOM.
 */
export function useAttachmentUrl(url: string | undefined): {
  url: string | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const isChatUrl = typeof url === 'string' && url.startsWith('chat://');
  const query = trpc.chatAttachments.getUrl.useQuery(
    { url: url ?? '' },
    {
      enabled: isChatUrl,
      staleTime: 1000 * 60 * 45,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  );

  if (!url) return { url: undefined, isLoading: false, error: null };
  if (!isChatUrl) return { url, isLoading: false, error: null };
  return {
    url: query.data?.url,
    isLoading: query.isLoading,
    error: query.error,
  };
}
