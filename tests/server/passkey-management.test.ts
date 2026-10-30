import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../../server/app.js';
import { consumeRecoveryChallengeLocked, finalizePasskeyLogin } from '../../server/auth.js';
import { createPool } from '../../server/db.js';
import { transaction } from '../../server/db.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const origin={origin:config.webOrigin};

test('passkey management requires recent session-bound reauth and recovery codes are single use',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  const email=`${randomUUID()}@example.test`,sessionToken=randomBytes(32).toString('base64url');
  let userId:string|undefined;
  try{
    userId=(await pool.query(`INSERT INTO users(email,name) VALUES($1,'Security test') RETURNING id`,[email])).rows[0].id;
    await pool.query(`INSERT INTO passkeys(id,user_id,public_key,device_type) VALUES($1,$2,$3,'singleDevice')`,[`test-${randomUUID()}`,userId,Buffer.from('not-an-actual-key')]);
    await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')`,[sha(sessionToken),userId]);
    const headers={...origin,cookie:`joystick_session=${sessionToken}`};
    const listed=await app.inject({method:'GET',url:'/api/v1/auth/passkeys',headers});
    assert.equal(listed.statusCode,200);assert.equal(listed.json().passkeys.length,1);
    assert.equal(listed.json().manageUntil,null);
    const blocked=await app.inject({method:'POST',url:'/api/v1/auth/recovery-codes',headers});
    assert.equal(blocked.statusCode,403);assert.equal(blocked.json().error.code,'reauth_required');
    const reauth=await app.inject({method:'POST',url:'/api/v1/auth/reauth/options',headers});
    assert.equal(reauth.statusCode,200);assert.ok(reauth.json().options.challenge);
    await pool.query(`INSERT INTO auth_manage_grants(session_hash,expires_at) VALUES($1,now()+interval '5 minutes')`,[sha(sessionToken)]);
    const remove=await app.inject({method:'POST',url:`/api/v1/auth/passkeys/${listed.json().passkeys[0].id}/remove`,headers});
    assert.equal(remove.statusCode,409);assert.equal(remove.json().error.code,'last_passkey');
    const generated=await app.inject({method:'POST',url:'/api/v1/auth/recovery-codes',headers});
    assert.equal(generated.statusCode,200);const codes=generated.json().codes as string[];assert.equal(codes.length,10);
    const stored=await pool.query('SELECT code_hash FROM auth_recovery_codes WHERE user_id=$1',[userId]);
    assert.equal(stored.rows.length,10);assert.ok(stored.rows.every(r=>!codes.includes(r.code_hash)));
    const bad=await app.inject({method:'POST',url:'/api/v1/auth/recovery/options',headers:origin,payload:{email:'nobody@example.test',code:codes[0]}});
    assert.equal(bad.statusCode,400);assert.equal(bad.json().error.code,'invalid_recovery');
    const first=await app.inject({method:'POST',url:'/api/v1/auth/recovery/options',headers:origin,payload:{email,code:codes[0]}});
    assert.equal(first.statusCode,200);assert.ok(first.json().options.challenge);
    const firstToken=first.cookies.find(c=>c.name==='joystick_challenge')?.value;assert.ok(firstToken);
    const state=await pool.query('SELECT generation FROM auth_recovery_state WHERE user_id=$1',[userId]);
    const race=await Promise.allSettled([1,2].map(()=>transaction(pool,c=>consumeRecoveryChallengeLocked(c,userId!,firstToken!,String(state.rows[0].generation)))));
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(race.filter(x=>x.status==='rejected').length,1);
    const replay=await app.inject({method:'POST',url:'/api/v1/auth/recovery/options',headers:origin,payload:{email,code:codes[0]}});
    assert.equal(replay.statusCode,400);assert.equal(replay.json().error.code,'invalid_recovery');
    const next=await app.inject({method:'POST',url:'/api/v1/auth/recovery/options',headers:origin,payload:{email,code:codes[1]}});
    assert.equal(next.statusCode,200);
    const nextToken=next.cookies.find(c=>c.name==='joystick_challenge')?.value;assert.ok(nextToken);
    const again=await app.inject({method:'POST',url:'/api/v1/auth/recovery-codes',headers});
    assert.equal(again.statusCode,200);
    await assert.rejects(()=>transaction(pool,c=>consumeRecoveryChallengeLocked(c,userId!,nextToken!,String(state.rows[0].generation))),/Recovery request expired/);
    const stale=await app.inject({method:'POST',url:'/api/v1/auth/recovery/options',headers:origin,payload:{email,code:codes[1]}});
    assert.equal(stale.statusCode,400);assert.equal(stale.json().error.code,'invalid_recovery');
    const unauth=await app.inject({method:'GET',url:'/api/v1/auth/passkeys'});
    assert.equal(unauth.statusCode,401);
  }finally{
    await pool.query('DELETE FROM auth_challenges WHERE email=$1',[email]);
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await app.close();await pool.end();
  }
});

test('a login waiting on account recovery cannot issue a session with the replaced credential',async()=>{
  const pool=createPool(config);
  const email=`${randomUUID()}@example.test`;
  const oldKey=`test-${randomUUID()}`;
  let userId:string|undefined;
  const blocker=await pool.connect();
  try{
    userId=(await pool.query(`INSERT INTO users(email,name) VALUES($1,'Recovery race') RETURNING id`,[email])).rows[0].id;
    await pool.query(`INSERT INTO passkeys(id,user_id,public_key,device_type) VALUES($1,$2,$3,'singleDevice')`,[oldKey,userId,Buffer.from('old-key')]);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    let verificationCalled=false;
    const raw=randomBytes(32).toString('base64url');
    const pending=finalizePasskeyLogin(pool,userId!,oldKey,raw,async()=>{verificationCalled=true;return 1;});
    await blocker.query('DELETE FROM passkeys WHERE user_id=$1',[userId]);
    await blocker.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1',[userId]);
    await blocker.query('COMMIT');
    await assert.rejects(pending,{code:'invalid_passkey'});
    assert.equal(verificationCalled,false);
    const sessions=await pool.query('SELECT 1 FROM sessions WHERE token_hash=$1',[sha(raw)]);
    assert.equal(sessions.rowCount,0);
  }finally{
    try{await blocker.query('ROLLBACK');}catch{}
    blocker.release();
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await pool.end();
  }
});
