import { TRPCError } from '@trpc/server';
import { DomainError, ErrorCode } from '@diguro/shared/errors';

/**
 * Maps domain errors to tRPC errors at the API boundary. Services throw typed
 * `DomainError` subclasses; routers never build `TRPCError` directly.
 */
export function mapDomainError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;

  if (err instanceof DomainError) {
    switch (err.code) {
      case ErrorCode.UNAUTHORIZED:
        return new TRPCError({ code: 'UNAUTHORIZED', message: err.message, cause: err });
      case ErrorCode.FORBIDDEN:
      case ErrorCode.NOT_ORG_MEMBER:
      case ErrorCode.SCOPE_MISMATCH:
      case ErrorCode.MODEL_NOT_ALLOWED:
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case ErrorCode.RESOURCE_NOT_FOUND:
      case ErrorCode.RESOURCE_VERSION_NOT_FOUND:
      case ErrorCode.CONVERSATION_NOT_FOUND:
      case ErrorCode.MESSAGE_NOT_FOUND:
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case ErrorCode.DUPLICATE_RESOURCE:
      case ErrorCode.REPLACE_CANDIDATE:
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case ErrorCode.CHECKSUM_MISMATCH:
      case ErrorCode.FILE_TOO_LARGE:
      case ErrorCode.UNSUPPORTED_MIME_TYPE:
      case ErrorCode.VALIDATION_FAILED:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      case ErrorCode.SPENDING_LIMIT_EXCEEDED:
      case ErrorCode.RESOURCE_LIMIT_EXCEEDED:
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message, cause: err });
      case ErrorCode.INGEST_FAILED:
      case ErrorCode.EXTRACTION_FAILED:
      case ErrorCode.INTERNAL:
      default:
        return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
    }
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: err instanceof Error ? err.message : 'Internal error',
    cause: err,
  });
}
