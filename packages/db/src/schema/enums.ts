import { pgEnum } from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['OWNER', 'ADMIN', 'MEMBER']);

export const ingestStatus = pgEnum('ingest_status', [
  'PENDING_UPLOAD',
  'PENDING',
  'EXTRACTING',
  'CHUNKING',
  'EMBEDDING',
  'DONE',
  'FAILED',
]);

export const ocrStatus = pgEnum('ocr_status', ['NONE', 'PENDING', 'DONE', 'FAILED']);

export const entityType = pgEnum('entity_type', [
  'PERSON',
  'ORG',
  'DATE',
  'MONEY',
  'LOCATION',
  'CUSTOM',
]);

export const messageRoleEnum = pgEnum('message_role', ['USER', 'ASSISTANT', 'TOOL']);

export const usageType = pgEnum('usage_type', [
  'CHAT',
  'EMBED',
  'RERANK',
  'OCR',
  'SUMMARY',
  'REWRITE',
]);

export const reconciliationFinding = pgEnum('reconciliation_finding', [
  'ORPHAN_S3_OBJECT',
  'MISSING_S3_OBJECT',
  'CHECKSUM_MISMATCH',
  'SIZE_MISMATCH',
  'DANGLING_CURRENT_VERSION',
]);
