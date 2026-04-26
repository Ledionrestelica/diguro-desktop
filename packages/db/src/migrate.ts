import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const EXTENSIONS = ['vector', 'pg_trgm'] as const;

// Resolve the migrations folder relative to THIS file's location, not
// relative to CWD. The Coolify pre-deploy command runs from /app while
// the migrations live at /app/packages/db/drizzle, so a './drizzle'
// path would 404.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'drizzle');

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });

  console.log('Enabling Postgres extensions…');
  for (const ext of EXTENSIONS) {
    await client.unsafe(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
    console.log(`  ✓ ${ext}`);
  }

  const db = drizzle(client);

  console.log(`Running Drizzle migrations from ${MIGRATIONS_FOLDER}…`);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log('Migrations complete.');

  console.log('Ensuring tsvector GIN index on chunks.text…');
  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS chunks_text_tsv_idx
    ON chunks USING gin (to_tsvector('english', text))
  `);
  console.log('  ✓ chunks_text_tsv_idx');

  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
