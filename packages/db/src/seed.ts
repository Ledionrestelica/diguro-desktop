/**
 * Dev seed:
 *   1. Ensure a "Diguro HQ" organization exists (the 3 of you live here).
 *   2. Promote specified email(s) to `superadmin` and attach to Diguro HQ.
 *
 * Usage:
 *   pnpm --filter @diguro/db db:seed
 *
 * Environment:
 *   SUPERADMIN_EMAILS — comma-separated emails to promote (defaults to the
 *                      author's dev email if you're me).
 *
 * Idempotent: re-running doesn't duplicate rows; missing users are skipped
 * (they need to sign up first).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from './schema/index.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const DEFAULT_SUPERADMIN = 'ledi@gmail.com';
const superadminEmails =
  (process.env['SUPERADMIN_EMAILS'] ?? DEFAULT_SUPERADMIN)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const HQ_SLUG = 'diguro-hq';
const HQ_NAME = 'Diguro HQ';

const sql = postgres(url);
const db = drizzle(sql, { schema });

try {
  // 1. Ensure the HQ organization exists.
  const existingHq = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, HQ_SLUG))
    .limit(1);

  let hqId: string;
  if (existingHq[0]) {
    hqId = existingHq[0].id;
    console.log(`✓ Diguro HQ already exists (${hqId})`);
  } else {
    hqId = crypto.randomUUID();
    await db.insert(schema.organizations).values({
      id: hqId,
      name: HQ_NAME,
      slug: HQ_SLUG,
      maxUsers: 100,
      maxWorkspaces: 50,
    });
    console.log(`✓ Created Diguro HQ (${hqId})`);
  }

  // 2. Promote superadmin emails.
  for (const email of superadminEmails) {
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    const user = rows[0];
    if (!user) {
      console.log(`·  ${email} not found — will be auto-promoted on next seed after sign-up`);
      continue;
    }
    await db
      .update(schema.users)
      .set({ role: 'superadmin', organizationId: hqId, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    console.log(`✓ Promoted ${email} to superadmin (organization: Diguro HQ)`);
  }

  console.log('Seed complete.');
} finally {
  await sql.end({ timeout: 5 });
}
