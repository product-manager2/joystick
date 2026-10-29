import type { PoolClient } from 'pg';
import type { Pool } from './db.js';
import { recoverInterruptedDispatches } from './agent.js';

const lockKey = '91834720260401';
export async function acquireWorkerLock(pool:Pool):Promise<PoolClient|null> {
  const client=await pool.connect();
  try {
    const result=await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired',[lockKey]);
    if (!result.rows[0]?.acquired) { client.release(); return null; }
    return client;
  } catch (error) { client.release(true); throw error; }
}
export async function startWorker(pool:Pool):Promise<PoolClient|null> {
  const lock=await acquireWorkerLock(pool);
  if (!lock) return null;
  try { await recoverInterruptedDispatches(pool); return lock; }
  catch (error) { lock.release(true); throw error; }
}
export function monitorWorkerLock(client:Pick<PoolClient,'on'|'off'>,onLoss:()=>void) {
  let active=true;
  const lost=()=>{if(active){active=false;onLoss();}};
  client.on('error',lost);
  client.on('end',lost);
  return ()=>{active=false;client.off('error',lost);client.off('end',lost);};
}
