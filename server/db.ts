import pg from 'pg';
import type { Config } from './config.js';
export function createPool(config: Config) { return new pg.Pool({ connectionString: config.databaseUrl, max: 10 }); }
export type Pool = pg.Pool;
export type Client = pg.PoolClient;
export async function transaction<T>(pool: Pool, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
