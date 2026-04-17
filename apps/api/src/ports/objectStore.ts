/**
 * Abstract object store — presigned PUT/GET, delete, list-by-prefix. Concrete
 * implementations live in `adapters/` (S3 today, MinIO-compatible via the same
 * adapter, others later). Services depend on this interface, never on a
 * concrete adapter.
 */
export interface ObjectStore {
  /** Generate a time-limited PUT URL the client can upload to directly. */
  presignPut(args: PresignPutArgs): Promise<PresignedPut>;
  /** Generate a time-limited GET URL for reading an object. */
  presignGet(args: PresignGetArgs): Promise<string>;
  /** Delete a single object. Swallows 404 — idempotent. */
  delete(key: string): Promise<void>;
  /** Delete every object under a prefix. Returns the count deleted. */
  deletePrefix(prefix: string): Promise<number>;
}

export interface PresignPutArgs {
  key: string;
  contentType: string;
  contentLength: number;
  /** Optional SHA-256 the server expects the upload to match. */
  checksumSha256?: string;
  /** TTL in seconds. Default 10 minutes. */
  expiresInSeconds?: number;
}

export interface PresignGetArgs {
  key: string;
  /** TTL in seconds. Default 1 hour. */
  expiresInSeconds?: number;
  /** Optional content-disposition override for downloads. */
  downloadAs?: string;
}

export interface PresignedPut {
  url: string;
  /** Headers the client MUST send with the PUT request for the signature to match. */
  headers: Record<string, string>;
  expiresAt: Date;
}
