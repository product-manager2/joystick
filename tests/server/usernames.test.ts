import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../../server/app.js';
import { finalizePasskeyLogin } from '../../server/auth.js';
import { createPool } from '../../server/db.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};
const origin={origin:config.webOrigin};

test('accounts start from a username, and sign-in works by username, email or the passkey alone',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  const username=`u_${randomUUID().slice(0,8)}`,key=`test-${randomUUID()}`;
  let userId:string|undefined;
  try{
    const ideas=await app.inject({method:'GET',url:'/api/v1/auth/usernames',headers:origin});
    assert.equal(ideas.statusCode,200);
    const suggestions=ideas.json().suggestions as string[];
    assert.equal(suggestions.length,4);assert.equal(new Set(suggestions).size,4);
    assert.ok(suggestions.every(s=>/^[a-z0-9_]{3,20}$/.test(s)));

    for(const bad of ['ab','has space','x'.repeat(21)]){
      const r=await app.inject({method:'POST',url:'/api/v1/auth/register/options',headers:origin,payload:{username:bad}});
      assert.equal(r.statusCode,400);
    }
    const fresh=await app.inject({method:'POST',url:'/api/v1/auth/register/options',headers:origin,payload:{username:`@${username.toUpperCase()}`}});
    assert.equal(fresh.statusCode,200);assert.equal(fresh.json().options.user.name,username);

    userId=(await pool.query(`INSERT INTO users(username,name,email) VALUES($1,$1,$2) RETURNING id`,[username,`${username}@example.test`])).rows[0].id;
    await pool.query(`INSERT INTO passkeys(id,user_id,public_key,device_type) VALUES($1,$2,$3,'singleDevice')`,[key,userId,Buffer.from('key')]);
    const taken=await app.inject({method:'POST',url:'/api/v1/auth/register/options',headers:origin,payload:{username}});
    assert.equal(taken.statusCode,409);assert.equal(taken.json().error.code,'username_taken');
    const again=await app.inject({method:'GET',url:'/api/v1/auth/usernames',headers:origin});
    assert.ok(!again.json().suggestions.includes(username));

    const byName=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:origin,payload:{username}});
    assert.deepEqual(byName.json().options.allowCredentials.map((c:{id:string})=>c.id),[key]);
    const byEmail=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:origin,payload:{username:`${username}@example.test`}});
    assert.equal(byEmail.statusCode,200);
    const unknown=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:origin,payload:{username:'nobody_here'}});
    assert.equal(unknown.statusCode,404);
    const picker=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:origin,payload:{}});
    assert.equal(picker.statusCode,200);assert.ok(!picker.json().options.allowCredentials?.length);

    // A passkey-picker sign-in finds the account from the passkey itself.
    const user=await finalizePasskeyLogin(pool,null,key,randomBytes(32).toString('base64url'),async()=>1);
    assert.equal(user.id,userId);assert.equal(user.username,username);
    await assert.rejects(()=>finalizePasskeyLogin(pool,null,'not-a-key',randomBytes(32).toString('base64url'),async()=>1),{code:'invalid_passkey'});
  }finally{
    if(userId)await pool.query('DELETE FROM users WHERE id=$1',[userId]);
    await app.close();await pool.end();
  }
});
