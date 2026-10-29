import '../server/env.js';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const directory = join(fileURLToPath(new URL('.', import.meta.url)), 'migrations');
const databaseUrl = process.env.NODE_ENV === 'production' ? process.env.DIRECT_DATABASE_URL : (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL);
if (!databaseUrl) throw new Error(process.env.NODE_ENV === 'production' ? 'DIRECT_DATABASE_URL is required in production' : 'DATABASE_URL is required');
const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      await client.query('BEGIN');
      try {
        const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
        if (!exists.rowCount) {
          await client.query(await readFile(join(directory, name), 'utf8'));
          await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
          console.log(`Applied ${name}`);
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { client.release(); }
} finally { await pool.end(); }
