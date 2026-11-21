import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizePgConnectionConfig, resolveConnectionString } from '../netlify/functions/_lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    console.error('Missing NETLIFY_DB_URL or DATABASE_URL environment variable.');
    process.exit(1);
  }

  const pool = new pg.Pool(normalizePgConnectionConfig(connectionString));
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename, applied_at)
           VALUES ($1, now())
           ON CONFLICT (filename) DO UPDATE SET applied_at = now()`,
          [file],
        );
        await client.query('COMMIT');
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
