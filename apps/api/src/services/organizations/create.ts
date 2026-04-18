import { schema, type Db } from '@diguro/db';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  maxUsers?: number | undefined;
  maxWorkspaces?: number | undefined;
  maxResourcesPerWorkspace?: number | undefined;
  logoUrl?: string | undefined;
  primaryColor?: string | undefined;
}

export async function createOrganization(
  deps: { db: Db },
  input: CreateOrganizationInput,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  await deps.db.insert(schema.organizations).values({
    id,
    name: input.name,
    slug: input.slug,
    ...(input.maxUsers !== undefined ? { maxUsers: input.maxUsers } : {}),
    ...(input.maxWorkspaces !== undefined
      ? { maxWorkspaces: input.maxWorkspaces }
      : {}),
    ...(input.maxResourcesPerWorkspace !== undefined
      ? { maxResourcesPerWorkspace: input.maxResourcesPerWorkspace }
      : {}),
    ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
    ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
  });
  return { id };
}
