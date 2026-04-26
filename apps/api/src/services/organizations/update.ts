import { eq, schema, sql, type Db } from '@diguro/db';
import { ResourceNotFound } from '@diguro/shared/errors';

export interface UpdateOrganizationInput {
  id: string;
  name?: string | undefined;
  slug?: string | undefined;
  logoUrl?: string | null | undefined;
  primaryColor?: string | null | undefined;
  maxUsers?: number | undefined;
  maxWorkspaces?: number | undefined;
  maxResourcesPerWorkspace?: number | undefined;
  maxMonthlySpendMicrodollars?: bigint | undefined;
  suspended?: string | null | undefined;
}

export async function updateOrganization(
  deps: { db: Db },
  input: UpdateOrganizationInput,
): Promise<void> {
  const { id, ...rest } = input;
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) update[k] = v;
  }
  if (Object.keys(update).length === 0) return;
  update['updatedAt'] = new Date();

  const res = await deps.db
    .update(schema.organizations)
    .set(update)
    .where(eq(schema.organizations.id, id))
    .returning({ id: schema.organizations.id });

  if (res.length === 0) throw new ResourceNotFound(id);
}

/**
 * Hard-delete an organization and every row that belongs to it.
 *
 * Postgres cascade alone can't process this in one go because the schema
 * intentionally restricts chunk deletion (`citations.chunkId → chunks`,
 * ON DELETE RESTRICT) to keep citations stable across resource replaces.
 * When an organization is deleted, every citation, message, conversation,
 * resource, chunk, embedding, etc. needs to go too — but the restrict on
 * citations.chunk_id blocks the cascade chain at chunks.
 *
 * Strategy: inside one transaction, delete the dependents in the right
 * order, ending with the org row. Each step uses subqueries so we don't
 * materialise huge id lists in app memory.
 */
export async function deleteOrganization(
  deps: { db: Db },
  input: { id: string },
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    // 1. Citations belonging to messages of conversations in this org.
    await tx.execute(sql`
      DELETE FROM ${schema.citations}
      WHERE ${schema.citations.messageId} IN (
        SELECT m.id FROM ${schema.messages} m
        JOIN ${schema.conversations} c ON c.id = m.conversation_id
        WHERE c.organization_id = ${input.id}
      )
    `);

    // 2. Citations whose chunks belong to resources in this org.
    //    (Picks up the historical citations made against now-replaced
    //    resource versions — those chunks would block cascade.)
    await tx.execute(sql`
      DELETE FROM ${schema.citations}
      WHERE ${schema.citations.chunkId} IN (
        SELECT ch.id FROM ${schema.chunks} ch
        JOIN ${schema.resourceVersions} rv ON rv.id = ch.resource_version_id
        JOIN ${schema.resources} r ON r.id = rv.resource_id
        WHERE r.organization_id = ${input.id}
      )
    `);

    // 3. Cascade does the rest: workspaces, conversations, messages,
    //    resources, versions, chunks, embeddings, entities, members,
    //    invitations, file_folders, recon reports, etc.
    const res = await tx
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, input.id))
      .returning({ id: schema.organizations.id });

    if (res.length === 0) throw new ResourceNotFound(input.id);
  });
}
