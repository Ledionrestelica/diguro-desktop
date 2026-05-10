import { and, asc, eq, isNull, schema, type Db } from '@diguro/db';
import { Forbidden, ResourceNotFound } from '@diguro/shared/errors';

/**
 * Organization-scoped file folders. Polymorphic scope on the table allows
 * future workspace/user folders, but the services here only expose the
 * organization variant — add sibling services when other scopes need CRUD.
 *
 * Nesting: parentId is a self-soft-reference (no FK). Cycle prevention is
 * enforced in `moveFolder` by walking ancestry before committing.
 */

export interface OrgFolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

/** Flat list of every folder in the organization — the UI builds the tree. */
export async function listOrganizationFolders(
  deps: { db: Db },
  input: { organizationId: string },
): Promise<OrgFolderRow[]> {
  return deps.db
    .select({
      id: schema.fileFolders.id,
      name: schema.fileFolders.name,
      parentId: schema.fileFolders.parentId,
      createdAt: schema.fileFolders.createdAt,
    })
    .from(schema.fileFolders)
    .where(eq(schema.fileFolders.organizationId, input.organizationId))
    .orderBy(asc(schema.fileFolders.name));
}

export async function createOrganizationFolder(
  deps: { db: Db },
  input: { organizationId: string; name: string; parentId: string | null },
): Promise<{ id: string }> {
  if (input.parentId) {
    await assertFolderInOrg(deps, { organizationId: input.organizationId, folderId: input.parentId });
  }
  const id = crypto.randomUUID();
  await deps.db.insert(schema.fileFolders).values({
    id,
    organizationId: input.organizationId,
    name: input.name.trim(),
    parentId: input.parentId,
  });
  return { id };
}

export async function renameOrganizationFolder(
  deps: { db: Db },
  input: { organizationId: string; folderId: string; name: string },
): Promise<void> {
  const res = await deps.db
    .update(schema.fileFolders)
    .set({ name: input.name.trim() })
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.organizationId, input.organizationId),
      ),
    )
    .returning({ id: schema.fileFolders.id });
  if (res.length === 0) throw new ResourceNotFound(input.folderId);
}

export async function moveOrganizationFolder(
  deps: { db: Db },
  input: { organizationId: string; folderId: string; parentId: string | null },
): Promise<void> {
  if (input.parentId === input.folderId) {
    throw new Forbidden('A folder cannot be its own parent');
  }
  await assertFolderInOrg(deps, { organizationId: input.organizationId, folderId: input.folderId });
  if (input.parentId) {
    await assertFolderInOrg(deps, { organizationId: input.organizationId, folderId: input.parentId });
    await assertNoCycle(deps, { organizationId: input.organizationId, folderId: input.folderId, newParentId: input.parentId });
  }
  await deps.db
    .update(schema.fileFolders)
    .set({ parentId: input.parentId })
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.organizationId, input.organizationId),
      ),
    );
}

/**
 * Delete an organization folder. Files + subfolders inside it are re-parented
 * to the folder's parent (default: root). We never cascade-delete files here —
 * explicit file deletion goes through `removeOrganizationResource`.
 */
export async function deleteOrganizationFolder(
  deps: { db: Db },
  input: { organizationId: string; folderId: string },
): Promise<void> {
  const folder = await assertFolderInOrg(deps, {
    organizationId: input.organizationId,
    folderId: input.folderId,
  });
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.resources)
      .set({ folderId: folder.parentId })
      .where(
        and(
          eq(schema.resources.organizationId, input.organizationId),
          eq(schema.resources.folderId, input.folderId),
        ),
      );
    await tx
      .update(schema.fileFolders)
      .set({ parentId: folder.parentId })
      .where(
        and(
          eq(schema.fileFolders.organizationId, input.organizationId),
          eq(schema.fileFolders.parentId, input.folderId),
        ),
      );
    await tx
      .delete(schema.fileFolders)
      .where(
        and(
          eq(schema.fileFolders.id, input.folderId),
          eq(schema.fileFolders.organizationId, input.organizationId),
        ),
      );
  });
}

/**
 * Find or create a folder with this name under the given parent. Used by
 * directory drag-drop to materialize a `{name → id}` map while preserving
 * idempotency — repeating the same drop twice doesn't duplicate folders.
 */
export async function ensureOrganizationFolder(
  deps: { db: Db },
  input: { organizationId: string; name: string; parentId: string | null },
): Promise<{ id: string }> {
  const trimmed = input.name.trim();
  const existing = await deps.db
    .select({ id: schema.fileFolders.id })
    .from(schema.fileFolders)
    .where(
      and(
        eq(schema.fileFolders.organizationId, input.organizationId),
        eq(schema.fileFolders.name, trimmed),
        input.parentId
          ? eq(schema.fileFolders.parentId, input.parentId)
          : isNull(schema.fileFolders.parentId),
      ),
    )
    .limit(1);
  const hit = existing[0];
  if (hit) return { id: hit.id };
  return createOrganizationFolder(deps, {
    organizationId: input.organizationId,
    name: trimmed,
    parentId: input.parentId,
  });
}

async function assertFolderInOrg(
  deps: { db: Db },
  input: { organizationId: string; folderId: string },
): Promise<{ id: string; parentId: string | null }> {
  const rows = await deps.db
    .select({ id: schema.fileFolders.id, parentId: schema.fileFolders.parentId })
    .from(schema.fileFolders)
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.folderId);
  return row;
}

async function assertNoCycle(
  deps: { db: Db },
  input: { organizationId: string; folderId: string; newParentId: string },
): Promise<void> {
  const all = await listOrganizationFolders(deps, { organizationId: input.organizationId });
  const byId = new Map(all.map((f) => [f.id, f]));
  let cursor: string | null | undefined = input.newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === input.folderId) {
      throw new Forbidden('Cannot move a folder into its own descendant');
    }
    if (seen.has(cursor)) return;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

/* ============================================================
 * Workspace-scoped folder operations.
 *
 * Mirrors the organization variants above but scoped by `workspaceId`.
 * The `fileFolders` table already supports polymorphic scope (organization
 * / workspace / user) via a CHECK constraint that enforces exactly one is
 * set, so the same schema rows are used — only the WHERE clauses differ.
 * ============================================================ */

export interface WorkspaceFolderRow {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export async function listWorkspaceFolders(
  deps: { db: Db },
  input: { workspaceId: string },
): Promise<WorkspaceFolderRow[]> {
  return deps.db
    .select({
      id: schema.fileFolders.id,
      name: schema.fileFolders.name,
      parentId: schema.fileFolders.parentId,
      createdAt: schema.fileFolders.createdAt,
    })
    .from(schema.fileFolders)
    .where(eq(schema.fileFolders.workspaceId, input.workspaceId))
    .orderBy(asc(schema.fileFolders.name));
}

export async function createWorkspaceFolder(
  deps: { db: Db },
  input: { workspaceId: string; name: string; parentId: string | null },
): Promise<{ id: string }> {
  if (input.parentId) {
    await assertFolderInWorkspace(deps, {
      workspaceId: input.workspaceId,
      folderId: input.parentId,
    });
  }
  const id = crypto.randomUUID();
  await deps.db.insert(schema.fileFolders).values({
    id,
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    parentId: input.parentId,
  });
  return { id };
}

export async function renameWorkspaceFolder(
  deps: { db: Db },
  input: { workspaceId: string; folderId: string; name: string },
): Promise<void> {
  const res = await deps.db
    .update(schema.fileFolders)
    .set({ name: input.name.trim() })
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.fileFolders.id });
  if (res.length === 0) throw new ResourceNotFound(input.folderId);
}

export async function moveWorkspaceFolder(
  deps: { db: Db },
  input: { workspaceId: string; folderId: string; parentId: string | null },
): Promise<void> {
  if (input.parentId === input.folderId) {
    throw new Forbidden('A folder cannot be its own parent');
  }
  await assertFolderInWorkspace(deps, {
    workspaceId: input.workspaceId,
    folderId: input.folderId,
  });
  if (input.parentId) {
    await assertFolderInWorkspace(deps, {
      workspaceId: input.workspaceId,
      folderId: input.parentId,
    });
    await assertNoWorkspaceCycle(deps, {
      workspaceId: input.workspaceId,
      folderId: input.folderId,
      newParentId: input.parentId,
    });
  }
  await deps.db
    .update(schema.fileFolders)
    .set({ parentId: input.parentId })
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.workspaceId, input.workspaceId),
      ),
    );
}

export async function deleteWorkspaceFolder(
  deps: { db: Db },
  input: { workspaceId: string; folderId: string },
): Promise<void> {
  const folder = await assertFolderInWorkspace(deps, {
    workspaceId: input.workspaceId,
    folderId: input.folderId,
  });
  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.resources)
      .set({ folderId: folder.parentId })
      .where(
        and(
          eq(schema.resources.workspaceId, input.workspaceId),
          eq(schema.resources.folderId, input.folderId),
        ),
      );
    await tx
      .update(schema.fileFolders)
      .set({ parentId: folder.parentId })
      .where(
        and(
          eq(schema.fileFolders.workspaceId, input.workspaceId),
          eq(schema.fileFolders.parentId, input.folderId),
        ),
      );
    await tx
      .delete(schema.fileFolders)
      .where(
        and(
          eq(schema.fileFolders.id, input.folderId),
          eq(schema.fileFolders.workspaceId, input.workspaceId),
        ),
      );
  });
}

export async function ensureWorkspaceFolder(
  deps: { db: Db },
  input: { workspaceId: string; name: string; parentId: string | null },
): Promise<{ id: string }> {
  const trimmed = input.name.trim();
  const existing = await deps.db
    .select({ id: schema.fileFolders.id })
    .from(schema.fileFolders)
    .where(
      and(
        eq(schema.fileFolders.workspaceId, input.workspaceId),
        eq(schema.fileFolders.name, trimmed),
        input.parentId
          ? eq(schema.fileFolders.parentId, input.parentId)
          : isNull(schema.fileFolders.parentId),
      ),
    )
    .limit(1);
  const hit = existing[0];
  if (hit) return { id: hit.id };
  return createWorkspaceFolder(deps, {
    workspaceId: input.workspaceId,
    name: trimmed,
    parentId: input.parentId,
  });
}

async function assertFolderInWorkspace(
  deps: { db: Db },
  input: { workspaceId: string; folderId: string },
): Promise<{ id: string; parentId: string | null }> {
  const rows = await deps.db
    .select({ id: schema.fileFolders.id, parentId: schema.fileFolders.parentId })
    .from(schema.fileFolders)
    .where(
      and(
        eq(schema.fileFolders.id, input.folderId),
        eq(schema.fileFolders.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new ResourceNotFound(input.folderId);
  return row;
}

async function assertNoWorkspaceCycle(
  deps: { db: Db },
  input: { workspaceId: string; folderId: string; newParentId: string },
): Promise<void> {
  const all = await listWorkspaceFolders(deps, { workspaceId: input.workspaceId });
  const byId = new Map(all.map((f) => [f.id, f]));
  let cursor: string | null | undefined = input.newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === input.folderId) {
      throw new Forbidden('Cannot move a folder into its own descendant');
    }
    if (seen.has(cursor)) return;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}
