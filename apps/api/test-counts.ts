import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema, sql, desc } from '@diguro/db';

const client = postgres('postgres://diguro:diguro@localhost:5432/diguro');
const db = drizzle(client, { schema, logger: true });

const rows = await db
  .select({
    id: schema.organizations.id,
    name: schema.organizations.name,
    userCount: sql<number>`(
      SELECT COUNT(*)::int FROM ${schema.users} WHERE ${schema.users.organizationId} = ${schema.organizations.id}
    )`,
    workspaceCount: sql<number>`(
      SELECT COUNT(*)::int FROM ${schema.workspaces} WHERE ${schema.workspaces.organizationId} = ${schema.organizations.id}
    )`,
  })
  .from(schema.organizations)
  .orderBy(desc(schema.organizations.createdAt));

console.log('RESULT:', JSON.stringify(rows, null, 2));
await client.end();
