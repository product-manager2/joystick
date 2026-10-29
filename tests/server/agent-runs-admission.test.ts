import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../server/db.js';
import { admitAgentRun } from '../../server/agent-runs/routes.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};

test('simultaneous requests admit at most two pending or active runs per account',async()=>{
  const pool=createPool(config);
  const email=`${randomUUID()}@example.test`;
  let userId:string|undefined;
  try{
    userId=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Run admission') RETURNING id",[email])).rows[0].id;
    const requestIds=Array.from({length:3},()=>randomUUID());
    const attempts=await Promise.allSettled(requestIds.map((id,i)=>admitAgentRun(pool,userId!,id,`hash-${i}`,'mission-draft',{missionId:null,planId:null,questId:null},null,'Draft a mission')));
    assert.equal(attempts.filter(a=>a.status==='fulfilled').length,2);
    const denied=attempts.find(a=>a.status==='rejected');
    assert.equal(denied?.status,'rejected');
    if(denied?.status==='rejected')assert.equal(denied.reason.code,'agent_run_limit');
    const persisted=await pool.query("SELECT id,request_id FROM agent_runs WHERE user_id=$1 AND status='queued'",[userId]);
    assert.equal(persisted.rowCount,2);
    const idempotent=await admitAgentRun(pool,userId!,persisted.rows[0].request_id,`hash-${requestIds.indexOf(persisted.rows[0].request_id)}`,'mission-draft',{missionId:null,planId:null,questId:null},null,'Draft a mission');
    assert.equal(idempotent,persisted.rows[0].id);
  }finally{
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await pool.end();
  }
});
