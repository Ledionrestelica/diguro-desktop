/**
 * Dev-only: wipe the local Postgres database and re-run migrations from scratch.
 * DESTRUCTIVE — drops all data.
 *
 * Usage: `pnpm --filter @diguro/db db:reset`
 *
 * Safe only in development. Refuses to run if NODE_ENV !== 'development'
 * unless ALLOW_DB_RESET=1 is set.
 */
import postgres from 'postgres';
import { execSync } from 'node:child_process';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const env = process.env['NODE_ENV'] ?? 'development';
const allow = process.env['ALLOW_DB_RESET'] === '1';
if (env !== 'development' && !allow) {
  console.error(
    `Refusing to reset DB in ${env}. Set ALLOW_DB_RESET=1 to force (and think very hard first).`,
  );
  process.exit(1);
}

// Extract db name from the URL, connect to the 'postgres' management DB to
// issue DROP/CREATE DATABASE.
const parsed = new URL(url);
const dbName = parsed.pathname.replace(/^\//, '');
if (!dbName) {
  console.error('Could not parse database name from DATABASE_URL');
  process.exit(1);
}
parsed.pathname = '/postgres';
const adminUrl = parsed.toString();

console.log(`⚠  Dropping database "${dbName}" and recreating it...`);

const sql = postgres(adminUrl);
try {
  // Terminate any existing connections to the target DB, then drop + recreate.
  await sql.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
  );
  await sql.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  await sql.unsafe(`CREATE DATABASE "${dbName}"`);
  console.log(`✓ Database "${dbName}" recreated.`);
} finally {
  await sql.end({ timeout: 5 });
}

console.log('Running migrations...');
execSync('pnpm --filter @diguro/db db:migrate', { stdio: 'inherit' });
console.log('✓ Reset complete.');
