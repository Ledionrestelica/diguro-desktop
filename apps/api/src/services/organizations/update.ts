import { eq, schema, type Db } from '@diguro/db';
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

export async function deleteOrganization(
  deps: { db: Db },
  input: { id: string },
): Promise<void> {
  const res = await deps.db
    .delete(schema.organizations)
    .where(eq(schema.organizations.id, input.id))
    .returning({ id: schema.organizations.id });
  if (res.length === 0) throw new ResourceNotFound(input.id);
}
