import { desc, schema, sql, type Db } from '@diguro/db';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  maxUsers: number;
  maxWorkspaces: number;
  suspended: string | null;
  userCount: number;
  workspaceCount: number;
  createdAt: Date;
}

export async function listOrganizations(deps: { db: Db }): Promise<OrganizationSummary[]> {
  const rows = await deps.db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      logoUrl: schema.organizations.logoUrl,
      primaryColor: schema.organizations.primaryColor,
      maxUsers: schema.organizations.maxUsers,
      maxWorkspaces: schema.organizations.maxWorkspaces,
      suspended: schema.organizations.suspended,
      createdAt: schema.organizations.createdAt,
      userCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.users} WHERE ${schema.users.organizationId} = ${schema.organizations.id}
      )`,
      workspaceCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.workspaces} WHERE ${schema.workspaces.organizationId} = ${schema.organizations.id}
      )`,
    })
    .from(schema.organizations)
    .orderBy(desc(schema.organizations.createdAt));

  return rows;
}

export interface OrganizationDetail extends OrganizationSummary {
  maxResourcesPerWorkspace: number;
  maxMonthlySpendMicrodollars: bigint;
  updatedAt: Date;
}

export async function getOrganization(
  deps: { db: Db },
  id: string,
): Promise<OrganizationDetail | null> {
  const rows = await deps.db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      logoUrl: schema.organizations.logoUrl,
      primaryColor: schema.organizations.primaryColor,
      maxUsers: schema.organizations.maxUsers,
      maxWorkspaces: schema.organizations.maxWorkspaces,
      maxResourcesPerWorkspace: schema.organizations.maxResourcesPerWorkspace,
      maxMonthlySpendMicrodollars: schema.organizations.maxMonthlySpendMicrodollars,
      suspended: schema.organizations.suspended,
      createdAt: schema.organizations.createdAt,
      updatedAt: schema.organizations.updatedAt,
      userCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.users} WHERE ${schema.users.organizationId} = ${schema.organizations.id}
      )`,
      workspaceCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.workspaces} WHERE ${schema.workspaces.organizationId} = ${schema.organizations.id}
      )`,
    })
    .from(schema.organizations)
    .where(sql`${schema.organizations.id} = ${id}`)
    .limit(1);
  return rows[0] ?? null;
}
