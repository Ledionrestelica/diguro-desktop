/**
 * Grant or list system roles.
 *
 * Usage:
 *   pnpm --filter @diguro/db db:promote                      # list every user
 *   pnpm --filter @diguro/db db:promote a@x.com b@y.com      # make both superadmin
 *
 * `superadmin` is the highest tier — platform operators, not scoped to an
 * organization. See `systemRole` in schema/enums.ts.
 */
import { inArray, asc } from 'drizzle-orm';
import { createDb } from './client.ts';
import { users } from './schema/auth.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const db = createDb(url);
const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase());

const all = await db
  .select({
    name: users.name,
    email: users.email,
    role: users.role,
    organizationId: users.organizationId,
  })
  .from(users)
  .orderBy(asc(users.createdAt));

const show = (label: string) => {
  console.log(`\n${label}\n`);
  for (const u of all) {
    console.log(
      `  ${u.role.padEnd(19)} ${u.email.padEnd(34)} ${u.name.padEnd(20)} org=${u.organizationId ?? '—'}`,
    );
  }
  console.log('');
};

if (emails.length === 0) {
  show(`${all.length} user(s) — pass emails as arguments to promote them:`);
  process.exit(0);
}

const known = new Set(all.map((u) => u.email.toLowerCase()));
const missing = emails.filter((e) => !known.has(e));
if (missing.length > 0) {
  console.error(`\nNo user with email: ${missing.join(', ')}`);
  show('Existing users:');
  process.exit(1);
}

const updated = await db
  .update(users)
  .set({ role: 'superadmin', updatedAt: new Date() })
  .where(inArray(users.email, emails))
  .returning({ email: users.email, role: users.role });

console.log('\nPromoted:\n');
for (const u of updated) console.log(`  ${u.email} → ${u.role}`);
console.log('');
process.exit(0);
