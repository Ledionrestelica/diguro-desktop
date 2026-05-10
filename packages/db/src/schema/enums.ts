import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * System role assigned on the user row. Three tiers:
 *   - superadmin         — platform operators (the 3 of us). Not scoped to an organization.
 *   - organization_admin — admin of a specific organization (tenant); manages users + workspaces inside it.
 *   - user               — regular member of an organization (or unaffiliated awaiting invite).
 *
 * Distinct enum from member_role (workspace-level OWNER/ADMIN/MEMBER) to avoid
 * name collision and let each axis evolve independently.
 */
export const systemRole = pgEnum('system_role', [
  'superadmin',
  'organization_admin',
  'user',
]);

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
  'CONTEXTUALIZE',
  'TITLE',
]);

/**
 * Which corpus a conversation's retrieval tool searches.
 *   - `organization` — every org-scoped resource the user's org has uploaded.
 *   - `workspace`    — only files uploaded INSIDE the active workspace.
 *   - `user`         — only the user's personal library.
 * Switchable per-conversation via the composer toggle. Retrieval never
 * crosses scopes (CLAUDE.md invariant).
 */
export const retrievalScope = pgEnum('retrieval_scope', ['organization', 'workspace', 'user']);

export const reconciliationFinding = pgEnum('reconciliation_finding', [
  'ORPHAN_S3_OBJECT',
  'MISSING_S3_OBJECT',
  'CHECKSUM_MISMATCH',
  'SIZE_MISMATCH',
  'DANGLING_CURRENT_VERSION',
]);
