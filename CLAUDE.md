# Diguro Desktop

Context for Claude Code sessions. This file captures the architectural decisions made during planning so future sessions don't re-derive them.

## What this repo is

A from-scratch rewrite of a multi-organization **and** multi-user-personal RAG application, split into two deployables:

- **`apps/api`** — the single source of truth backend (Bun + Hono + tRPC + Better-Auth + Drizzle + Postgres + S3 + Inngest).
- **`apps/desktop`** — an Electron + Vite + React thin client that talks to the API.

The existing Next.js app lives at `/Users/ledionrestelica/ai-chat` (sibling working directory). It is **reference only** — the schema and features are "inspired by" it, not ported. A fresh Postgres database is used; a one-time data migration is planned for later.

## Phased plan

1. **Phase 1 (this repo):** Ship the API backend and the Electron desktop app.
2. **Phase 2 (separate repo, later):** Rewrite the existing Next.js web app as a Vite + React client pointing at the same API. End state = one backend, two thin clients (desktop + web).

**Day-1 backend decisions that matter for phase 2** (designed for both clients from the start, even though only desktop consumes in phase 1):

- Dual auth: Better-Auth configured with both **cookie sessions** (future web) and **bearer tokens** (desktop, via the `bearer` plugin). Same server, same session model, different transport.
- CORS allowlist (no wildcards). Include the future web origin and Electron's `app://` / `file://` origins.
- Every tRPC procedure is client-agnostic. Desktop-only concerns (local file paths, OS integration) live in the Electron main process, not in the API.

## Locked stack decisions

| Concern | Choice | Rationale |
|---|---|---|
| Desktop shell | Electron | Mature auth patterns (`BrowserWindow`, `safeStorage`), battle-tested auto-updater, biggest ecosystem. Tauri's bundle-size win doesn't matter for a cloud-backed app. |
| API framework | Hono + tRPC | Fast, small, works with Better-Auth handler pattern, end-to-end TS type safety on AI-SDK streams + Drizzle queries. |
| Runtime | **Bun** | Fastest JS API runtime; Drizzle + Better-Auth + AI-SDK all supported. Near-zero cold starts. |
| ORM | **Drizzle** | Typed `vector()` column (no `$queryRaw` for retrieval), composable SQL-ish query builder, CHECK constraints + partial indexes in the schema file, readable generated migrations. Chosen over Prisma because hybrid search + pgvector is the hot path here. |
| Database | **Neon Postgres** | Serverless pooler, pgvector built-in, branching for dev, generous tier. |
| Auth | Better-Auth | Plugins enabled: `organization`, `admin`, `bearer`. Cookie sessions for future web, bearer tokens for desktop. |
| LLM providers (chat) | Anthropic + OpenAI + Google Gemini | Multi-provider from day 1 via AI-SDK registry. Add more by registering providers. |
| Embeddings | **Voyage-3-large** | Current SOTA for English retrieval. 1024 dim. **Locked** — changing = re-embed everything. |
| Reranker | **Cohere Rerank 3** | One API call, massive quality delta vs. word-overlap reranking. |
| OCR (v1) | GPT-5 Vision via AI-SDK | Simple, reuses LLM budget. Upgrade path: self-hosted OCR later. |
| Job queue | **Inngest** | Typed multi-step workflows, retries per step, generous free tier. |
| Redis | Upstash | Rate limiting (sliding window) + hot caches. |
| File storage | AWS S3 (source of truth for bytes) | Per-org prefix, versioned paths, presigned PUT uploads, SHA-256 checksum for dedup/integrity. See "File storage" section. |
| PDF viewer | `react-pdf` | Mature, supports citation highlighting via page + offset overlays. |
| API deploy | **Fly.io** | Persistent Bun process, `min_machines_running = 1`, co-located region with Neon. |
| Desktop distribution | `electron-builder` | Signed installers for macOS (Apple Developer cert) + Windows (EV cert). Auto-updates via `electron-updater`. |

## Resource scoping (org vs user)

Every document-like entity in the system is **polymorphically scoped**: it belongs to either an Organization or a User, never both, never neither. This applies to:

- `Resource` (files)
- `FileFolder`
- `Conversation` (always has a userId owner; `organizationId` being null means "personal chat over user's files")
- `ChatFolder`
- `TokenUsage` / `SpendingLimit`

Enforced with nullable `organizationId` + `userId` columns plus a DB-level `CHECK` constraint (`(organization_id IS NOT NULL) <> (user_id IS NOT NULL)` or similar depending on the table). Drizzle's `check()` helper expresses these directly in the schema file — no separate migration-only SQL step needed.

**Retrieval never crosses scopes.** A user-scoped conversation only searches that user's personal files. An org-scoped conversation only searches that org's files. "Share a personal file to my org" is a v2 feature (would require a file-share table and an authorization rethink).

**Rationale:** one polymorphic `Resource` model avoids duplicating the whole ingestion pipeline, chunk/embedding storage, and RAG code across two separate "PersonalResource" / "OrgResource" tables. The cost is a pair of nullable FKs and a CHECK constraint — acceptable.

## File storage: S3 as source of truth

S3 is authoritative for the file bytes. Postgres is the metadata index + full version history. The two are kept consistent by funneling all write operations through the API and running a periodic reconciliation job.

**Invariants (enforced by code, verified by reconciliation):**

1. Every `ResourceVersion` row maps to exactly one S3 object.
2. Every S3 object under a scope's prefix maps to exactly one `ResourceVersion` row.
3. `ResourceVersion.sha256` matches the SHA-256 of the S3 object at `ResourceVersion.s3Key`.
4. `ResourceVersion.fileSize` matches the S3 object's `ContentLength`.
5. `Resource.currentVersionId` points to an existing `ResourceVersion` of the same `Resource`.

**S3 path layout:**

```
bucket/
  org/<orgId>/
    resources/<resourceId>/
      v<version>/original.<ext>       // immutable per version
  user/<userId>/
    resources/<resourceId>/
      v<version>/original.<ext>       // personal files
```

Version numbers are monotonically increasing integers starting at 1. Replacing a file creates a new `ResourceVersion` + S3 object at a new path — old versions stay forever unless hard-deleted. Old S3 objects past a retention window (default 30 days after the version stops being current) are eligible for a separate cleanup job, but the `ResourceVersion` metadata row stays so citations resolve.

**Checksums (SHA-256):**

- **Computed client-side** on the desktop before upload (streams the file through `crypto.subtle.digest`). Saves bandwidth on duplicate uploads.
- **Verified server-side** after upload via S3's `x-amz-checksum-sha256` header — we don't trust the client alone.
- **Uniqueness (active-file dedup):** application-level check in `resources.initiateUpload` inside a transaction — "does any Resource in this scope have its `currentVersion.sha256 = X`?". If yes, return `{ status: "duplicate", existingResourceId }`. Old archived versions with the same sha256 don't block — only the current state does. Enforced with `SELECT … FOR UPDATE` to prevent races.
- **Replace detection:** uploading a file with the same logical name but different sha256 is a replace candidate — UI surfaces the existing resource and asks: replace (new version) or upload as new (separate Resource).

**Upload flow (end-to-end):**

```
1. Desktop computes SHA-256 of selected file locally.
2. tRPC resources.initiateUpload({ scope, name, mimeType, fileSize, sha256, folderId? })
   scope = { kind: "org", organizationId } | { kind: "user" }  (userId comes from ctx)
   API within a transaction:
     - any Resource in this scope with currentVersion.sha256 = X?
           → return { status: "duplicate", existingResourceId }
     - any Resource in this scope with matching name but different sha256?
           → return { status: "replace_candidate", existingResourceId }
     - otherwise → create Resource row (currentVersionId = null for now)
                   create ResourceVersion row (versionNumber=1, ingestStatus=PENDING_UPLOAD)
                   link Resource.currentVersionId = resourceVersion.id
                   return { status: "ok", resourceId, versionId, presignedUrl, s3Key }
3. Desktop PUTs file to S3 with x-amz-checksum-sha256 header.
4. tRPC resources.confirmUpload({ versionId })
   API does HeadObject, verifies size + checksum.
     - mismatch → delete S3 object, mark ResourceVersion FAILED, return error.
     - ok       → ResourceVersion.ingestStatus=PENDING, emit Inngest event "resource.uploaded".
5. Ingestion pipeline runs against the ResourceVersion.
```

**Replace flow:**

```
1. tRPC resources.initiateReplace({ resourceId, sha256, fileSize, mimeType })
   - create new ResourceVersion (versionNumber = currentVersion.versionNumber + 1,
     ingestStatus=PENDING_UPLOAD) — Resource.currentVersionId is NOT updated yet
   - presigned URL for the new version path
2. Desktop PUTs new bytes to S3.
3. tRPC resources.confirmReplace({ versionId })
   - HeadObject → verify checksum + size
   - flip Resource.currentVersionId to the new version
   - set Resource.lastReplacedAt = now()
   - emit "resource.uploaded" Inngest event → ingestion runs for new version
   - OLD version's Chunk / Embedding / Entity rows are NOT deleted — they stay archived
     so Citations on historical messages still resolve to their exact source.
4. New version's chunks get created by ingestion. Only the current version is indexed for search.
```

**Citation stability across replaces:** because chunks belong to a specific `ResourceVersion` (not to the logical `Resource`), a citation made against v1 still resolves to v1's chunk after the resource is replaced with v2. The UI shows "cited from v1 — document has since been updated" when the chunk's version isn't current. This is the main reason for doing full version history from day 1: citations become stable, permanent references, not orphan candidates.

**Archive policy:**
- `ResourceVersion` rows are **never** auto-deleted.
- Chunks / Embeddings / Entities for non-current versions stay indefinitely (for citation resolution).
- S3 objects for non-current versions past retention window (default 30 days) are eligible for a separate GC job that tombstones them in Postgres first (set `ResourceVersion.s3Deleted = true`), so citations show "source file no longer available" instead of a broken reference.
- Hard-deleting a `Resource` cascades to all its versions, chunks, embeddings, entities, and S3 objects. Only orgAdmin / user-owner can hard-delete.

**Reconciliation job (Inngest, scheduled daily per org):**

- List S3 under `org/<orgId>/resources/`
- Compare against `Resource` rows where `organizationId = orgId`
- Flag:
  - S3 objects with no matching Resource row → orphan (log, alert, do not delete automatically)
  - Resource rows whose s3Key returns 404 → broken (log, alert, mark `ingestStatus = FAILED`)
  - Resource with sha256 that doesn't match S3 object's checksum → tampered/corrupted (alert)
- Never deletes without operator approval. Writes findings to a `ReconciliationReport` table surfaced in admin UI.

**Dashboard list query:** always reads from Postgres (fast, indexed, org-scoped). Never lists S3 on read path. Reconciliation is the mechanism that keeps them in sync, not on-demand S3 lists.

## Speed-first principles

Latency dies by a thousand cuts. Five rules:

1. **Parallelize every independent stage.** Per chat turn, fan these out concurrently: query rewrite (Haiku 4.5 ~300ms), vector search, keyword (tsvector) search, conversation history load. Only rerank + model generation are serial. Target first-token-out < 1.2s.
2. **Small/fast models for the plumbing.** Query rewriting, intent classification, conversation-title generation → Haiku 4.5 or GPT-5-nano. Never the main chat model.
3. **Stream everything.** AI-SDK `streamText` with `experimental_transform: smoothStream`. Stream tokens **and** tool-call deltas to the desktop. The renderer shows tool states (`calling` → `executing` → `result`) inline as they arrive.
4. **No cold starts.** Bun + Fly.io with `min_machines_running = 1`. Drizzle pool (`postgres-js`) reused across requests. Neon's pooler keeps DB connections hot.
5. **Pre-compute at ingest, not at query.** Contextual prefixes, summaries, entity extraction — all in Inngest jobs. Query time does as little work as possible.

## RAG strategy (v1)

Diagnosis of why the existing app's RAG is unreliable:
- Chunks lose document-level context (no "which contract / which section" signal).
- Jaccard word-overlap "reranking" gives near-zero lift.
- Pre-retrieval + a single optional tool call can't handle multi-part questions.
- No query rewriting → literal user phrasing rarely matches document phrasing.
- No metadata filtering → every search hits the whole corpus.
- Image-heavy PDFs are rejected outright.

**v1 retrieval pipeline** (addresses all of the above):

1. **Query rewrite.** Fast model rewrites user question into 1–3 retrieval queries.
2. **Hybrid search.** Vector (Voyage-3-large cosine) + keyword (tsvector) in parallel. Retrieve top 50 candidates.
3. **Rerank.** Cohere Rerank 3 → top 8.
4. **Agentic retrieval loop.** Main chat model runs with tools [`search`, `viewDocument`]. `stepCountIs(5–8)` allows multi-step retrieval when needed. Tools take optional filter args (`folderId`, `resourceIds`, `dateRange`).
5. **Parent-document retrieval.** Index small chunks (~400 tokens) for matching, return surrounding section (~1500 tokens) for context. Preserves precision + usable context.
6. **Contextual retrieval (Anthropic technique).** Each chunk is embedded with a 1–2 sentence LLM-generated contextual prefix describing how it relates to the overall document. ~35% retrieval-failure reduction. Cost at ingest, free at query.
7. **OCR for image PDFs.** GPT-5 Vision pass during ingestion (later: self-hosted).

**v2+ ideas (do NOT build yet, but schema is shaped for them):**

- Semantic/late chunking
- ColBERT-style multi-vector retrieval
- GraphRAG / entity-relationship extraction for multi-hop queries
- Contradiction detection across docs
- Timeline extraction
- Annotations (user highlights + notes)
- Tables-as-data (extract during parsing, query via code-interpreter-style tool)

## Model flexibility

AI-SDK provider registry. Resolution order at request time: **user preference → org default → system fallback**.

```
Organization.defaultChatModelId     // org-wide default (e.g. "anthropic/claude-sonnet-4-6")
Organization.defaultRewriteModelId  // cheap model for query rewrite, titles, etc.
Organization.allowedModelIds        // string[] gate — admins restrict what members may pick
User.preferredChatModelId           // nullable override
```

Stored as `"provider/model"` strings so adding providers is a no-migration change.

**Embeddings and reranker are NOT user-selectable.** One embedding model (Voyage-3-large) is locked per database — changing requires full re-embed. One reranker (Cohere) is standard.

## Citation & tool-call UX

The feature that makes the app feel intelligent. Target UX:

```
┌─ Assistant ─────────────────────────────────────┐
│  🔍 Searching "late fee policy" in Contracts…  │ ← tool call streamed
│  ✓ Found 6 passages across 2 documents          │ ← tool result summary
│                                                  │
│  The late fee policy allows a 10-day grace      │
│  period [1], after which 1.5% per month         │ ← inline citation chip
│  applies [2].                                    │
│                                                  │
│  Sources:                                        │
│  [1] Vendor Agreement – Acme.pdf, p. 4          │ ← click → opens PDF at
│  [2] Service Contract v2.docx, p. 7             │    highlighted passage
└──────────────────────────────────────────────────┘
```

Implementation:

- AI-SDK tool parts stream with `state: 'input-streaming' | 'input-available' | 'output-available'`. Renderer reads the stream and shows tool state live.
- Citations rendered from `[CIT:chunkId]` markers in model output (prompted), resolved client-side to `Citation` rows (docId, page, chunkId, snippet).
- Clicking a citation chip opens `react-pdf` at the cited page with a highlight overlay driven by chunk `startOffset` / `endOffset` or pixel coordinates from PDF extraction.
- Citations are **first-class DB rows** (`Citation` table), not embedded in the message JSON blob.

## Schema (Drizzle, final)

Notes:
- Roles are Postgres enums (`pgEnum`), never free strings.
- `Message.parts` is a Zod-validated discriminated union stored as `jsonb`.
- `Embedding` is 1:1 with `Chunk` — splitting them lets us re-embed with a new model later without losing chunk offsets.
- `Chunk` / `Entity` FK to `ResourceVersion`, not `Resource` — every chunk belongs to a specific version so citations are stable across replaces.
- `Citation` is its own table (queryable: "which sources did the model cite for this org this month").
- `AuditEvent` is append-only.
- **Polymorphic scope:** `Resource`, `FileFolder`, `Conversation`, `ChatFolder`, `TokenUsage`, `SpendingLimit` all have nullable `organization_id` + `user_id` columns with a DB `CHECK` constraint enforcing exactly-one-is-set (Drizzle's `check()` helper expresses this in the schema file, no separate SQL migration step).
- **Vector index:** embeddings column uses an **HNSW** index for cosine similarity (`vector_cosine_ops`). Drizzle `.using('hnsw', ...)` handles it.

Shown below in a condensed Drizzle-flavored pseudocode (real files live under `packages/db/src/schema/` split by concern — `auth.ts`, `org.ts`, `resource.ts`, `chat.ts`, `usage.ts`, `recon.ts`).

```ts
// === enums (pgEnum) ===
export const memberRole    = pgEnum('member_role',    ['OWNER','ADMIN','MEMBER']);
export const ingestStatus  = pgEnum('ingest_status',  ['PENDING_UPLOAD','PENDING','EXTRACTING','CHUNKING','EMBEDDING','DONE','FAILED']);
export const ocrStatus     = pgEnum('ocr_status',     ['NONE','PENDING','DONE','FAILED']);
export const entityType    = pgEnum('entity_type',    ['PERSON','ORG','DATE','MONEY','LOCATION','CUSTOM']);
export const messageRole   = pgEnum('message_role',   ['USER','ASSISTANT','TOOL']);
export const usageType     = pgEnum('usage_type',     ['CHAT','EMBED','RERANK','OCR','SUMMARY','REWRITE']);
export const reconFinding  = pgEnum('reconciliation_finding', ['ORPHAN_S3_OBJECT','MISSING_S3_OBJECT','CHECKSUM_MISMATCH','SIZE_MISMATCH','DANGLING_CURRENT_VERSION']);

// === Better-Auth managed tables ===
// users, sessions, accounts, verifications — structure driven by Better-Auth's drizzle adapter.
// User extensions: preferredChatModelId text | null, maxPersonalResources integer default 100.

// === Organization ===
export const organizations = pgTable('organizations', {
  id:                   text('id').primaryKey(),
  name:                 text('name').notNull(),
  slug:                 text('slug').notNull().unique(),
  backgroundColor:      text('background_color'),
  buttonColor:          text('button_color'),
  logoUrl:              text('logo_url'),
  systemPrompt:         text('system_prompt'),
  tone:                 text('tone'),
  defaultChatModelId:   text('default_chat_model_id'),
  defaultRewriteModelId:text('default_rewrite_model_id'),
  allowedModelIds:      text('allowed_model_ids').array().notNull().default(sql`'{}'`),
  maxMembers:           integer('max_members').notNull().default(10),
  maxResources:         integer('max_resources').notNull().default(500),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
});

export const members = pgTable('members', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:         text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:           memberRole('role').notNull(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  uniq: uniqueIndex('members_org_user').on(t.organizationId, t.userId),
}));

// === Resource (logical file, polymorphic scope) ===
export const resources = pgTable('resources', {
  id:                text('id').primaryKey(),
  organizationId:    text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:            text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  folderId:          text('folder_id'),
  name:              text('name').notNull(),
  currentVersionId:  text('current_version_id').unique(), // self-deferred FK set after version insert
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  lastReplacedAt:    timestamp('last_replaced_at'),
}, t => ({
  scopeCheck: check('resources_scope_exclusive',
    sql`(${t.organizationId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`),
  orgIdx:  index('resources_org_created_idx').on(t.organizationId, t.createdAt),
  userIdx: index('resources_user_created_idx').on(t.userId, t.createdAt),
}));

// === ResourceVersion (immutable binary, one per uploaded version) ===
export const resourceVersions = pgTable('resource_versions', {
  id:            text('id').primaryKey(),
  resourceId:    text('resource_id').notNull().references(() => resources.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  sha256:        text('sha256').notNull(),
  s3Key:         text('s3_key').notNull(),
  mimeType:      text('mime_type').notNull(),
  fileSize:      integer('file_size').notNull(),
  pageCount:     integer('page_count'),
  uploaderId:    text('uploader_id').notNull().references(() => users.id),
  ocrStatus:     ocrStatus('ocr_status').notNull().default('NONE'),
  ingestStatus:  ingestStatus('ingest_status').notNull().default('PENDING_UPLOAD'),
  summary:       text('summary'),
  keyPoints:     text('key_points').array().notNull().default(sql`'{}'`),
  s3Deleted:     boolean('s3_deleted').notNull().default(false),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, t => ({
  versionUniq: uniqueIndex('resource_versions_resource_version').on(t.resourceId, t.versionNumber),
  createdIdx:  index('resource_versions_resource_created_idx').on(t.resourceId, t.createdAt),
}));
// Active-scope dedup (currentVersion.sha256 uniqueness per scope) is enforced
// at the application layer inside a tx with SELECT ... FOR UPDATE — not a DB constraint.

// === FileFolder (polymorphic scope) ===
export const fileFolders = pgTable('file_folders', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:         text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  parentId:       text('parent_id'),
  name:           text('name').notNull(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  scopeCheck: check('file_folders_scope_exclusive',
    sql`(${t.organizationId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`),
}));

// === Chunk + Embedding (FK to ResourceVersion) ===
export const chunks = pgTable('chunks', {
  id:                text('id').primaryKey(),
  resourceVersionId: text('resource_version_id').notNull().references(() => resourceVersions.id, { onDelete: 'cascade' }),
  chunkIndex:        integer('chunk_index').notNull(),
  text:              text('text').notNull(),
  contextualPrefix:  text('contextual_prefix'),
  startOffset:       integer('start_offset').notNull(),
  endOffset:         integer('end_offset').notNull(),
  pageNumber:        integer('page_number'),
  parentSectionId:   text('parent_section_id'),
}, t => ({
  idx: index('chunks_rv_idx').on(t.resourceVersionId, t.chunkIndex),
  // tsvector index for keyword search added via SQL migration:
  //   CREATE INDEX chunks_text_tsv_idx ON chunks USING gin (to_tsvector('english', text));
}));

export const embeddings = pgTable('embeddings', {
  chunkId: text('chunk_id').primaryKey().references(() => chunks.id, { onDelete: 'cascade' }),
  vector:  vector('vector', { dimensions: 1024 }).notNull(),   // Voyage-3-large dim
}, t => ({
  hnsw: index('embeddings_vector_hnsw').using('hnsw', t.vector.op('vector_cosine_ops')),
}));

export const entities = pgTable('entities', {
  id:                text('id').primaryKey(),
  resourceVersionId: text('resource_version_id').notNull().references(() => resourceVersions.id, { onDelete: 'cascade' }),
  type:              entityType('type').notNull(),
  value:             text('value').notNull(),
  normalizedValue:   text('normalized_value').notNull(),
  mentions:          jsonb('mentions').notNull(),              // [{chunkId, start, end}]
});

// === Chat (polymorphic: userId always set, orgId null => personal) ===
export const conversations = pgTable('conversations', {
  id:             text('id').primaryKey(),
  userId:         text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  folderId:       text('folder_id'),
  title:          text('title').notNull(),
  modelId:        text('model_id'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  userIdx: index('conversations_user_created_idx').on(t.userId, t.createdAt),
  orgIdx:  index('conversations_org_created_idx').on(t.organizationId, t.createdAt),
}));

export const chatFolders = pgTable('chat_folders', {
  id:             text('id').primaryKey(),
  userId:         text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name:           text('name').notNull(),
});

export const messages = pgTable('messages', {
  id:             text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role:           messageRole('role').notNull(),
  parts:          jsonb('parts').notNull(),                    // Zod-validated discriminated union
  modelId:        text('model_id'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  convIdx: index('messages_conv_created_idx').on(t.conversationId, t.createdAt),
}));

export const citations = pgTable('citations', {
  id:        text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  chunkId:   text('chunk_id').notNull().references(() => chunks.id, { onDelete: 'restrict' }),
  rank:      integer('rank').notNull(),
  snippet:   text('snippet').notNull(),
}, t => ({
  msgIdx: index('citations_message_idx').on(t.messageId),
}));

// === Observability & limits ===
export const tokenUsage = pgTable('token_usage', {
  id:               text('id').primaryKey(),
  organizationId:   text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  userId:           text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:             usageType('type').notNull(),
  provider:         text('provider').notNull(),
  model:            text('model').notNull(),
  promptTokens:     integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  costMicrodollars: integer('cost_microdollars').notNull(),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
}, t => ({
  orgIdx:  index('token_usage_org_created_idx').on(t.organizationId, t.createdAt),
  userIdx: index('token_usage_user_created_idx').on(t.userId, t.createdAt),
}));

export const spendingLimits = pgTable('spending_limits', {
  id:                     text('id').primaryKey(),
  organizationId:         text('organization_id').unique().references(() => organizations.id, { onDelete: 'cascade' }),
  userId:                 text('user_id').unique().references(() => users.id, { onDelete: 'cascade' }),
  monthlyCapMicrodollars: bigint('monthly_cap_microdollars', { mode: 'bigint' }).notNull(),
}, t => ({
  scopeCheck: check('spending_limits_scope_exclusive',
    sql`(${t.organizationId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`),
}));

export const auditEvents = pgTable('audit_events', {
  id:             text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  userId:         text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action:         text('action').notNull(),
  targetType:     text('target_type'),
  targetId:       text('target_id'),
  metadata:       jsonb('metadata'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, t => ({
  orgIdx:  index('audit_org_created_idx').on(t.organizationId, t.createdAt),
  userIdx: index('audit_user_created_idx').on(t.userId, t.createdAt),
}));

export const reconciliationReports = pgTable('reconciliation_reports', {
  id:                text('id').primaryKey(),
  organizationId:    text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  userId:            text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  finding:           reconFinding('finding').notNull(),
  resourceId:        text('resource_id'),
  resourceVersionId: text('resource_version_id'),
  s3Key:             text('s3_key'),
  details:           jsonb('details').notNull(),
  resolvedAt:        timestamp('resolved_at'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
}, t => ({
  orgIdx:  index('recon_org_created_idx').on(t.organizationId, t.createdAt),
  userIdx: index('recon_user_created_idx').on(t.userId, t.createdAt),
}));
```

**Migrations** use `drizzle-kit generate` + `drizzle-kit migrate`. The HNSW vector index and GIN tsvector index on `chunks.text` are added via raw SQL statements in the first migration (pgvector + pg_trgm extensions are enabled there too).

Additive later (do not include in v1 migration): `ExtractionTemplate`, `Annotation`, `Timeline` tables.

## Code quality & architecture

Non-negotiable principles for this codebase. All PRs/commits must uphold these:

### Layered architecture (ports & adapters)

The API is organized in strict layers with a one-way dependency direction: **delivery → services → domain ← ports ← adapters**. Nothing below depends on anything above it.

- **domain/** — pure business logic. No I/O, no framework imports, no Drizzle, no HTTP. Types, invariants, errors, small pure functions. Fully unit-testable with zero setup.
- **services/** — use cases that orchestrate the domain and call ports. One file per use case (`uploadInitiate.ts`, `chatSend.ts`, etc.). No framework/HTTP concerns. Takes ports as parameters.
- **ports/** — TypeScript interfaces for external systems (`ObjectStore`, `ChatProvider`, `EmbedProvider`, `RerankProvider`, `OcrProvider`, `Queue`). Services depend on these interfaces, never on concrete adapters.
- **adapters/** — concrete implementations of ports. `S3ObjectStore`, `AnthropicChatProvider`, `VoyageEmbedProvider`, `CohereRerankProvider`, `InngestQueue`, etc.
- **trpc/** and **inngest/** — thin delivery layer. A tRPC procedure is ~5–10 lines: validate input → call service → map errors. No business logic in routers.

Why: swapping providers (OCR, chat models, reranker) becomes a one-line adapter change. Tests use fake adapters. No tangled concerns.

### Type safety

- **Strict TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **Branded ID types** in `packages/shared`: `OrgId`, `UserId`, `ResourceId`, `ChunkId`, `MessageId`, `CitationId`. Raw strings never leak across function boundaries. Parsers convert and validate at creation.
- **No `any`, no `as` casts** except at the tRPC ↔ AI-SDK boundary where third-party type gaps force them — isolated to named utilities in `lib/`.
- **Drizzle inferred types for DB rows**, domain types for logic — distinct. Map between them at the service boundary. Raw DB row types never leak into tRPC outputs directly.

### Validation at every boundary

Trust nothing from outside the API. Validate at these lines:

- **tRPC inputs** — Zod schema on every `.input()`.
- **Inngest event payloads** — Zod schema per event type, validated on handler entry.
- **Files uploaded to S3** — validate after `HeadObject`: mime sniff (not `Content-Type` header alone), magic-byte check, max size (configurable per org), sha256 match.
- **External API responses** — Voyage, Cohere, OpenAI, Anthropic, Google responses go through Zod parsers. Malformed responses fail fast, not silently.
- **DB JSONB fields** — `Message.parts`, `Entity.mentions`, `AuditEvent.metadata`, `ReconciliationReport.details` all have Zod schemas in `packages/shared`. Read paths parse before use; write paths validate before insert.

### Authorization model

Every tRPC procedure composes from a middleware chain. No ad-hoc auth checks inside procedures.

```
publicProcedure         // unauthenticated (sign-in, sign-up only)
authedProcedure         // valid session, any role
orgProcedure            // authed + member of orgId in input, attaches { org, member } to ctx
orgAdminProcedure       // orgProcedure + member.role in (OWNER, ADMIN)
orgOwnerProcedure       // orgProcedure + member.role == OWNER
systemAdminProcedure    // authed + User.role in (admin, superadmin)
scopedProcedure         // authed + input carries a Scope discriminator
                        // (org → verifies membership; user → verifies scope.userId === ctx.user.id)
                        // attaches { scope } to ctx — services accept Scope, never raw ids
resourceProcedure       // scopedProcedure + loads Resource + asserts Resource scope matches ctx.scope
```

All data access is scoped through `ctx.scope` — either `{ kind: "org", org, member }` or `{ kind: "user", user }`. No service function accepts a raw orgId or userId parameter; the `Scope` value object comes from middleware and carries the authorization proof with it. Scope isolation is an invariant, not a convention.

### Errors

- **Typed domain error classes** in `domain/errors.ts`: `ResourceNotFound`, `DuplicateResource`, `UnauthorizedForOrg`, `SpendingLimitExceeded`, `IngestFailed`, etc. Each has a stable error code.
- **Single error mapper** at the tRPC boundary converts domain errors → `TRPCError` with correct HTTP codes and error shapes.
- **No throwing strings, no catching `Error` and swallowing**. Unknown errors propagate; known errors are typed.

### File hygiene

- **Max file length ~300 lines.** If a file grows beyond that, split by concern.
- **One exported thing per file** when the thing is non-trivial (a service, a router, a complex component).
- **No barrel files that re-export everything** — they defeat tree-shaking and make imports ambiguous. Explicit imports only.
- **Colocate tests** next to source (`uploadInitiate.ts` + `uploadInitiate.test.ts`).

### Desktop code quality

- **No prop drilling beyond 2 levels.** Lift to context, a hook, or a store (Zustand) when needed.
- **Feature folders, not type folders.** `src/features/chat/` contains the chat components, hooks, and types — not `components/`, `hooks/`, `types/` split by kind.
- **tRPC React Query client is the only data-fetching primitive.** No `fetch` calls in the renderer. No ad-hoc `useEffect`+`setState` data loading.

### Explicit non-goals (don't add these)

- **No `Result<T, E>` / neverthrow library.** Typed exceptions + single error mapper is simpler and enough.
- **No dependency injection container** (InversifyJS, tsyringe). Plain function parameters and a small context-builder function are sufficient.
- **No mediator/CQRS pattern.** Overkill for this scope.
- **No generic "repository" abstraction** over Drizzle. Drizzle is already a composable query layer; wrapping it adds noise. Specialized queries (hybrid search RRF, parent-doc retrieval) live in `adapters/drizzle/` as named functions, not as a generic repository pattern.

The point is clean seams, not ceremony.

## Project structure

```
diguro-desktop/
├── apps/
│   ├── api/                     Bun + Hono + tRPC + Better-Auth
│   │   ├── src/
│   │   │   ├── index.ts         entry (HTTP server bootstrap)
│   │   │   ├── context.ts       tRPC context shape + builder
│   │   │   │
│   │   │   ├── domain/          pure logic — no I/O, no framework
│   │   │   │   ├── ids.ts       branded ID types + zod parsers
│   │   │   │   ├── errors.ts    typed domain error classes
│   │   │   │   └── ...          invariants, value objects
│   │   │   │
│   │   │   ├── services/        use cases — orchestrate domain + ports
│   │   │   │   ├── resources/   uploadInitiate, confirmUpload, replace, delete, list
│   │   │   │   ├── chat/        send, list, loadHistory
│   │   │   │   ├── ingestion/   extract, chunk, contextualize, embed, summarize, extractEntities
│   │   │   │   ├── rag/         rewriteQuery, hybridSearch, rerank, retrieve
│   │   │   │   ├── usage/       track, checkLimits
│   │   │   │   └── recon/       reconcileOrg
│   │   │   │
│   │   │   ├── ports/           interfaces (no implementations)
│   │   │   │   ├── objectStore.ts
│   │   │   │   ├── chatProvider.ts
│   │   │   │   ├── embedProvider.ts
│   │   │   │   ├── rerankProvider.ts
│   │   │   │   ├── ocrProvider.ts
│   │   │   │   └── queue.ts
│   │   │   │
│   │   │   ├── adapters/        port implementations
│   │   │   │   ├── s3/
│   │   │   │   ├── providers/   anthropic, openai, google, voyage, cohere
│   │   │   │   ├── inngest/
│   │   │   │   └── drizzle/     specialized queries (hybrid search, RRF, parent-doc retrieval)
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── config.ts    Better-Auth setup (org + admin + bearer plugins)
│   │   │   │   └── middleware.ts tRPC procedure builders (authed/org/orgAdmin/…)
│   │   │   │
│   │   │   ├── trpc/            delivery layer (thin)
│   │   │   │   ├── root.ts
│   │   │   │   ├── error-mapper.ts
│   │   │   │   └── routers/     resources, chat, org, user, admin
│   │   │   │
│   │   │   ├── inngest/         delivery for async events
│   │   │   │   └── functions/   resource-uploaded, reconcile-s3, …
│   │   │   │
│   │   │   └── lib/             cross-cutting: logger, config, crypto
│   │   └── package.json
│   │
│   └── desktop/                 Electron + Vite + React
│       ├── electron/            main process: auth keychain, safeStorage, updater, IPC
│       ├── src/
│       │   ├── app/             shell (router, providers)
│       │   ├── features/        feature folders (chat, resources, auth, settings)
│       │   ├── components/      shared primitives only (not feature-specific)
│       │   ├── lib/             tRPC client, API base URL resolver
│       │   └── hooks/           truly cross-feature hooks only
│       └── package.json
│
├── packages/
│   ├── db/                      Drizzle schema (split by concern), drizzle-kit config, migrations, typed query helpers
│   ├── trpc/                    router type export for the client
│   └── shared/                  Zod schemas, branded IDs, error codes (consumed by api + desktop)
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Monorepo tooling: **pnpm workspaces + Turborepo**.

## Ingestion pipeline (Inngest)

Triggered by `resource.uploaded` after confirm — S3 object exists and is checksum-verified. The target is a specific `ResourceVersion`, not the logical Resource. Each step retries independently. Status streams to the desktop via tRPC subscription.

```
event: "resource.uploaded" { versionId }
  1. load ResourceVersion + parent Resource + download bytes from S3 (streamed)
  2. ingestStatus = EXTRACTING
     extract text:
       - PDF  → pdf-parse (text layer present) OR GPT-5 Vision (if image-heavy/OCR needed)
       - DOCX → mammoth
       - XLSX/XLS/CSV → xlsx lib, CSV → markdown table
       - HTML/MD/TXT/JSON → plain / cheerio
  3. ingestStatus = CHUNKING
     sentence-aware chunking (~400 tokens, overlap 2 sentences;
     record startOffset, endOffset, pageNumber, parentSectionId)
     → Chunk rows FK'd to this ResourceVersion
  4. contextual prefix per chunk (Haiku 4.5, batched, parallel) — prepended before embedding
  5. ingestStatus = EMBEDDING
     embed via Voyage-3-large (batched 100 per request)
  6. entity extraction (Haiku, structured output via generateObject → Entity rows on this version)
  7. document summary + key points (Sonnet) → ResourceVersion.summary / keyPoints
  8. ingestStatus = DONE; emit "resource.ready"

Search indexing: only the CURRENT version of each Resource is included in hybrid search.
Non-current versions' chunks stay in the DB but are excluded from retrieval queries
(join filter: Chunk.resourceVersionId = Resource.currentVersionId).

On failure at any step:
  - set ResourceVersion.ingestStatus = FAILED, store error on AuditEvent
  - do NOT delete the S3 object (user may retry)
  - UI shows "Ingest failed — retry / replace / delete"
```

## Reconciliation job (Inngest, scheduled)

Runs daily per scope (each org + each user with personal files). Detects drift between Postgres and S3 without auto-mutating either side.

```
event: "recon.run" { scope: { kind: "org", organizationId } | { kind: "user", userId } }
  prefix = scope is org  → `org/<orgId>/resources/`
         | scope is user → `user/<userId>/resources/`

  1. list all S3 objects under prefix
  2. load all ResourceVersion rows whose Resource matches scope (and s3Deleted = false)
  3. compare:
       - S3 object with no matching ResourceVersion (by s3Key)
          → ORPHAN_S3_OBJECT
       - ResourceVersion with missing S3 object (HeadObject 404) and s3Deleted = false
          → MISSING_S3_OBJECT + ResourceVersion.ingestStatus = FAILED
       - ResourceVersion.sha256 != S3 object's checksum
          → CHECKSUM_MISMATCH
       - ResourceVersion.fileSize != S3 object's ContentLength
          → SIZE_MISMATCH
       - Resource.currentVersionId points to a version that doesn't exist
          → DANGLING_CURRENT_VERSION
  4. Report surfaced in admin UI. Resolution is manual.
  5. Separate scheduled job handles retention cleanup of old non-current versions
     (set ResourceVersion.s3Deleted = true, then delete the S3 object).
```

## Chat request flow (speed-tuned)

```
1. Desktop → tRPC chat.send (streaming)
2. In parallel:
   a. Rewrite query (Haiku 4.5, ~300ms)
   b. Load conversation history (cached)
3. Hybrid search: vector + tsvector in parallel (~80ms on Neon)
4. Cohere Rerank 3 top 50 → top 8 (~150ms)
5. streamText with chosen model + tools [search, viewDocument]
6. Stream tokens + tool deltas to desktop
7. onFinish: single transaction persists Message + Citation rows, then fire-and-forget TokenUsage + AuditEvent
```

First-token target: ~1.2s.

## v1 feature scope (locked)

**Ship:**
- Two scopes from day 1: **organization-scoped files + chats** and **user-scoped personal files + chats**
- Upload files (PDF/DOCX/XLSX/TXT/MD/CSV; OCR via GPT-5 Vision for image PDFs)
- Client-side SHA-256 + checksum-verified S3 upload flow (active-file dedup within scope)
- Replace flow with **full `ResourceVersion` history from day 1** — old chunks/embeddings retained, only current version indexed for retrieval, citations resolve to the exact version they were made against
- Ingest pipeline (contextual chunking, embedding, doc summary, entity extraction) — runs per version
- Chat with agentic RAG (query rewrite → hybrid search → Cohere rerank → multi-step tool calls → cited answer). Retrieval is scope-isolated: org chat searches org files, personal chat searches user files. No cross-scope retrieval in v1.
- File folders + metadata filtering in search (per scope)
- Model picker (org default, org-allowed list, user override; for personal scope only user override applies)
- Usage tracking + spending limits (per org and per user)
- Audit log
- Daily reconciliation job per scope (Postgres ↔ S3 drift detection)
- Retention cleanup job for old non-current versions (tombstones + S3 delete past retention window)
- Desktop-native PDF viewer with citation highlights (including "cited from v1 — document has since been updated")
- Multi-org, Better-Auth admin + organization plugins

**Punt to v1.1:**
- Document comparison tool (dedicated tool that loads two docs in full, structured diff via `generateObject`)
- Structured extraction templates (define a schema, run across N docs, get a table)
- Conversation folders
- **Cross-scope sharing** — "promote this personal file to my org" or "let teammate view this personal file". Requires a file-share table and an authorization rethink.

**Punt to v2:**
- Annotations, timelines, contradiction detection
- Tables as first-class structured queryable data
- Self-hosted OCR
- Semantic chunking, ColBERT multi-vector retrieval, GraphRAG

**Explicitly dropped from scope:**
- Web crawling (present in the existing app; not ported)

## Containerization & deployment

**What gets containerized:** `apps/api` only. `apps/desktop` ships as a signed Electron installer (macOS `.dmg`/`.pkg`, Windows `.exe`), never a container.

### Dockerfile for `apps/api` (multi-stage)

```
# stage 1: deps — install pnpm + fetch workspace deps with cache mounts
# stage 2: build — compile TS, prune dev deps
# stage 3: runtime — oven/bun:1-slim, non-root user, only production artifacts
```

- **Base image:** `oven/bun:1-slim` (Debian slim, ~80 MB). Avoid `oven/bun:alpine` — Drizzle's `postgres-js` and some native deps can misbehave on musl.
- **Non-root user:** `USER bun` for the runtime stage.
- **Health check:** `HEALTHCHECK CMD bun run health || exit 1` hits the `health.ping` tRPC procedure via a small script.
- **Entrypoint:** `bun run src/index.ts`. Migrations run as a separate container/command (`bun run db:migrate`), not on startup — keeps the app container stateless and avoids racing multiple instances.
- **Image stays under ~150 MB** in practice.

### `docker-compose.yml` for local dev

Single file at the repo root. Purpose: spin up a full local stack without any external accounts.

```
services:
  postgres:     image: pgvector/pgvector:pg16    # has pgvector pre-installed
                volumes: [pgdata:/var/lib/postgresql/data]
                ports:   ["5432:5432"]
                env:     POSTGRES_PASSWORD, POSTGRES_DB=diguro
  redis:        image: redis:7-alpine
                ports:   ["6379:6379"]
  minio:        image: minio/minio                # S3-compatible for local file storage
                ports:   ["9000:9000", "9001:9001"]
                env:     MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
  inngest-dev:  image: inngest/inngest:latest     # local event dev server
                command: inngest-cli dev -u http://host.docker.internal:3000/api/inngest
                ports:   ["8288:8288"]
```

Dev loop: `docker compose up -d` → `bun run db:migrate` → `bun run dev` in `apps/api` (runs natively on Bun for fast HMR, talks to containerized services). The API container built from the Dockerfile is only used for prod-parity testing and for the actual prod deploy.

### Environment-driven configuration

No hardcoded endpoints. `apps/api` reads from env (validated at boot via a Zod schema in `lib/config.ts`):

```
DATABASE_URL                    postgres://...   (Neon prod, local postgres in dev)
REDIS_URL                       redis://...
S3_ENDPOINT                     https://s3.amazonaws.com  (or http://minio:9000 locally)
S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, VOYAGE_API_KEY, COHERE_API_KEY
BETTER_AUTH_SECRET, BETTER_AUTH_URL
ALLOWED_ORIGINS                 comma-separated CORS allowlist
```

Missing env on boot → the API refuses to start with a helpful error. No silent fallbacks.

### Deployment targets

- **Prod API:** Fly.io. `fly.toml` defines regions (co-located with Neon), `min_machines_running = 1`, health checks, auto-scale rules. `fly deploy` builds the Dockerfile, pushes, rolls out.
- **DB:** Neon Postgres (managed, pgvector available).
- **Redis:** Upstash (managed, no container ops).
- **S3:** AWS S3 (managed bucket + scoped IAM).
- **Inngest:** managed cloud (no self-host needed).
- **Migrations:** run as a Fly machine command (`fly ssh console -C "bun run db:migrate"`) or a one-shot job before deploys. Never on app boot.

### CI (later, not in v1 scaffolding)

GitHub Actions builds the API Docker image on every merge to main, pushes to GHCR, and triggers `fly deploy`. Desktop installers are built on macOS + Windows runners, signed, notarized, published to a release channel consumed by `electron-updater`.

## Auth on desktop

- Better-Auth `bearer` plugin enabled alongside cookie sessions.
- Token stored in OS keychain via Electron's `safeStorage`.
- System-browser OAuth flow is NOT required for v1 (bearer + email/password is enough). Custom URL scheme (`diguro://auth/callback`) is a v1.1 upgrade if SSO becomes a requirement.

## What NOT to replicate from the existing app

Audited at `/Users/ledionrestelica/ai-chat`. Avoid these patterns:

- `Message.parts` as unvalidated JSON blob — we use Zod discriminated unions.
- `Organization.metadata` string-JSON — we use typed columns / JSONB.
- Raw `executeRawUnsafe` bulk insert for embeddings — use Drizzle's typed batch `insert().values([...])` with the `vector()` column; raw SQL only for things Drizzle can't express (e.g. advanced index DDL).
- String roles — we use `pgEnum` everywhere.
- Citations embedded in message parts — we use a `Citation` table.
- Storing full document text on `Resource.fullText` — files live in S3; re-fetch when needed.
- Fire-and-forget message persistence during streaming — we finalize in `onFinish` in a single transaction.
- Web crawling via SSE from a single POST handler — dropped entirely.
- Jaccard word-overlap reranking — replaced with Cohere Rerank 3.
- Image-PDF rejection — replaced with GPT-5 Vision OCR branch.

## What IS worth replicating

- Better-Auth with `organization` + `admin` plugins — solid multi-tenant pattern.
- pgvector + tsvector hybrid search with RRF fusion — add a real reranker on top.
- Sentence-aware chunking with char offsets — enables source highlighting.
- Usage tracking (microdollars) + monthly spending limits — ship day 1.
- Upstash sliding-window rate limiting.
- Per-org customization (systemPrompt, tone, branding).

## Scaffolding order

When we pick up scaffolding:

1. **Monorepo init** — pnpm workspaces + Turborepo, strict `tsconfig.base.json`, shared ESLint + Prettier configs.
2. **`packages/shared`** — branded ID types, Zod schemas for message parts / citations / tool calls / Inngest events, error codes.
3. **`packages/db`** — Drizzle schema files (split by concern) + drizzle-kit config + Neon/Postgres connection + first migration (enables `pgvector` + `pg_trgm` extensions, creates all tables, HNSW vector index, GIN tsvector index).
4. **`apps/api` skeleton** — Bun + Hono + tRPC + Better-Auth bootstrapped; layered folder structure created but mostly empty; one smoke-test procedure (`health.ping`). Verify strict TS, error mapper, context builder all work.
5. **Auth middleware chain** — `publicProcedure` / `authedProcedure` / `orgProcedure` / `orgAdminProcedure` / `resourceProcedure` implemented and covered by tests.
6. **Ports defined, first adapter written** — `ObjectStore` port + `S3ObjectStore` adapter with presigned URL generation. No services using it yet.
7. **`apps/desktop` skeleton** — Electron + Vite + React + tRPC client + bearer token flow via `safeStorage`. Sign-up and sign-in pages.
8. **End-to-end smoke test** — sign up on desktop → create org → call an org-scoped tRPC procedure → see result. This validates the full auth + org scoping pipeline before any feature work.

Only after #8 works: implement the first real feature vertical (upload + ingest + list).

## Environment & accounts the user will need

When the time comes (not all at once):
- Neon (Postgres)
- Upstash (Redis)
- Inngest
- AWS S3 (bucket + IAM user with scoped policy)
- Anthropic API key
- OpenAI API key
- Google Gemini API key
- Voyage AI API key
- Cohere API key
- Fly.io (for API deploy)
- Apple Developer Program (for macOS code signing, ~$99/yr)
- Windows EV code-signing cert (or Azure Trusted Signing)

## Conventions for this repo

- Default to writing no comments unless the "why" is non-obvious.
- Don't add backwards-compat shims — there is no legacy to be compatible with.
- Don't add feature flags for features that aren't shipped.
- Strict TypeScript everywhere. `noUncheckedIndexedAccess: true`.
- Zod at system boundaries (API inputs, DB JSONB columns, external APIs). Trust internal types.
- Prefer editing existing files to creating new ones.
