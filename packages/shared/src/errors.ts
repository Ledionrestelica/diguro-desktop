export const ErrorCode = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Scope
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  NOT_ORG_MEMBER: 'NOT_ORG_MEMBER',

  // Resource
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_VERSION_NOT_FOUND: 'RESOURCE_VERSION_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  REPLACE_CANDIDATE: 'REPLACE_CANDIDATE',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_MIME_TYPE: 'UNSUPPORTED_MIME_TYPE',

  // Ingestion
  INGEST_FAILED: 'INGEST_FAILED',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',

  // Chat
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  MODEL_NOT_ALLOWED: 'MODEL_NOT_ALLOWED',

  // Limits / usage
  SPENDING_LIMIT_EXCEEDED: 'SPENDING_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_LIMIT_EXCEEDED',

  // Generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base class for typed domain errors. Services throw these; the tRPC boundary
 * maps them to TRPCError via a single error-mapper (apps/api/src/trpc/error-mapper.ts).
 * Never throw raw strings or untyped Errors from services.
 */
export class DomainError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export class Unauthorized extends DomainError {
  constructor(message = 'Unauthorized') {
    super(ErrorCode.UNAUTHORIZED, message);
  }
}
export class Forbidden extends DomainError {
  constructor(message = 'Forbidden') {
    super(ErrorCode.FORBIDDEN, message);
  }
}
export class ScopeMismatch extends DomainError {
  constructor(message = 'Resource is not in the expected scope') {
    super(ErrorCode.SCOPE_MISMATCH, message);
  }
}
export class NotOrgMember extends DomainError {
  constructor(message = 'User is not a member of this organization') {
    super(ErrorCode.NOT_ORG_MEMBER, message);
  }
}
export class ResourceNotFound extends DomainError {
  constructor(id: string) {
    super(ErrorCode.RESOURCE_NOT_FOUND, `Resource ${id} not found`);
  }
}
export class ResourceVersionNotFound extends DomainError {
  constructor(id: string) {
    super(ErrorCode.RESOURCE_VERSION_NOT_FOUND, `ResourceVersion ${id} not found`);
  }
}
export class DuplicateResource extends DomainError {
  constructor(
    public readonly existingResourceId: string,
    message = 'A resource with this content already exists in scope',
  ) {
    super(ErrorCode.DUPLICATE_RESOURCE, message);
  }
}
export class ChecksumMismatch extends DomainError {
  constructor(message = 'Uploaded file checksum does not match declared SHA-256') {
    super(ErrorCode.CHECKSUM_MISMATCH, message);
  }
}
export class SpendingLimitExceeded extends DomainError {
  constructor(message = 'Monthly spending cap exceeded for this scope') {
    super(ErrorCode.SPENDING_LIMIT_EXCEEDED, message);
  }
}
export class IngestFailed extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(ErrorCode.INGEST_FAILED, message, cause);
  }
}
export class ModelNotAllowed extends DomainError {
  constructor(modelId: string) {
    super(ErrorCode.MODEL_NOT_ALLOWED, `Model ${modelId} is not allowed for this scope`);
  }
}
export class FileTooLarge extends DomainError {
  constructor(message = 'File exceeds maximum allowed size') {
    super(ErrorCode.FILE_TOO_LARGE, message);
  }
}
export class UnsupportedMimeType extends DomainError {
  constructor(mimeType: string) {
    super(ErrorCode.UNSUPPORTED_MIME_TYPE, `Unsupported file type: ${mimeType}`);
  }
}
