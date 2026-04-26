import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const EXTENSIONS = ['vector', 'pg_trgm'] as const;

// Resolve the migrations folder relative to THIS file's location, not
// relative to CWD. The Coolify pre-deploy command runs from /app while
// the migrations live at /app/packages/db/drizzle, so a './drizzle'
// path would 404. Allow MIGRATIONS_FOLDER env override as an escape
// hatch for unusual deploy layouts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESOLVED_FOLDER = path.resolve(__dirname, '..', 'drizzle');
const MIGRATIONS_FOLDER = process.env['MIGRATIONS_FOLDER'] ?? RESOLVED_FOLDER;

async function main() {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  // Diagnostics so deploy logs make path issues self-evident.
  console.log(`migrate.ts CWD       = ${process.cwd()}`);
  console.log(`migrate.ts __dirname = ${__dirname}`);
  console.log(`migrate.ts folder    = ${MIGRATIONS_FOLDER}`);
  if (!fs.existsSync(MIGRATIONS_FOLDER)) {
    console.error(
      `Migrations folder does not exist at ${MIGRATIONS_FOLDER}. ` +
        'Verify that packages/db/drizzle was copied into the runtime image.',
    );
    process.exit(1);
  }
  const journal = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
  if (!fs.existsSync(journal)) {
    console.error(
      `meta/_journal.json missing at ${journal}. Folder contents: ` +
        JSON.stringify(fs.readdirSync(MIGRATIONS_FOLDER)),
    );
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
