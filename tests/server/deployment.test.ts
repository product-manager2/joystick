import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { buildApp } from '../../server/app.js';
import { cookieOptions } from '../../server/auth.js';
import { readConfig } from '../../server/config.js';
import { monitorWorkerLock } from '../../server/worker-lock.js';
import type { Pool } from '../../server/db.js';

const origin='https://app.example.test';
const config=readConfig({NODE_ENV:'production',DIRECT_DATABASE_URL:'postgres://direct.test/db',DATABASE_URL:'postgres://pooled.test/db',WEB_ORIGIN:origin,RP_ID:'app.example.test'});
test('production config uses direct DB, secure same-site cookie, and injectable host',()=>{
  assert.equal(config.databaseUrl,'postgres://direct.test/db');
  assert.equal(config.host,'0.0.0.0');
  assert.equal(config.cookieSecure,true);
  assert.equal(cookieOptions(config,60).sameSite,'lax');
  assert.throws(()=>readConfig({NODE_ENV:'production',DATABASE_URL:'postgres://pooled.test/db',WEB_ORIGIN:origin,RP_ID:'app.example.test'}),/DIRECT_DATABASE_URL/);
  assert.equal(readConfig({DATABASE_URL:'postgres://local.test/db',WEB_ORIGIN:'http://localhost:5173',RP_ID:'localhost',HOST:'127.0.0.2'}).host,'127.0.0.2');
});
test('exact-origin credentialed CORS and preflight',async()=>{
  const {app}=await buildApp({} as Pool,config);
  try {
    const allowed=await app.inject({method:'OPTIONS',url:'/api/v1/auth/login/options',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
    assert.equal(allowed.statusCode,204);
    assert.equal(allowed.headers['access-control-allow-origin'],origin);
    assert.equal(allowed.headers['access-control-allow-credentials'],'true');
    assert.equal(allowed.headers.vary,'Origin');
    const denied=await app.inject({method:'OPTIONS',url:'/api/v1/auth/login/options',headers:{origin:'https://evil.example.test','access-control-request-method':'POST'}});
    assert.equal(denied.statusCode,403);
    assert.equal(denied.headers['access-control-allow-origin'],undefined);
    const mutation=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin:'https://evil.example.test'}});
    assert.equal(mutation.statusCode,403);
    const get=await app.inject({method:'GET',url:'/api/v1/me',headers:{origin}});
    assert.equal(get.headers['access-control-allow-origin'],origin);
    assert.equal(get.headers['cache-control'],'no-store');
  } finally {await app.close();}
});
test('worker lock loss callback fires once and can be detached',()=>{
  const emitter=new EventEmitter(); let losses=0;
  const stop=monitorWorkerLock(emitter as never,()=>{losses++;});
  emitter.emit('error',new Error('connection lost'));
  emitter.emit('end');
  assert.equal(losses,1);
  stop();
});
test('Fly rate limit uses validated Fly-Client-IP per client',async()=>{
  const flyConfig=readConfig({NODE_ENV:'production',FLY_APP_NAME:'joystick-test',DIRECT_DATABASE_URL:'postgres://direct.test/db',WEB_ORIGIN:origin,RP_ID:'app.example.test'});
  const {app}=await buildApp({} as Pool,flyConfig);
  try {
    for(let i=0;i<20;i++) {
      const response=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin,'fly-client-ip':'198.51.100.1'}});
      assert.equal(response.statusCode,200);
    }
    const limited=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin,'fly-client-ip':'198.51.100.1'}});
    assert.equal(limited.statusCode,429);
    const separate=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin,'fly-client-ip':'198.51.100.2'}});
    assert.equal(separate.statusCode,200);
  } finally {await app.close();}
});
test('Vercel proxy mode uses shared Fly egress quota and per-email cap',async()=>{
  const proxyConfig=readConfig({NODE_ENV:'production',FLY_APP_NAME:'joystick-test',HTTP_PROXY_MODE:'vercel',DIRECT_DATABASE_URL:'postgres://direct.test/db',WEB_ORIGIN:origin,RP_ID:'app.example.test'});
  const pool={query:async()=>({rows:[],rowCount:0})} as unknown as Pool;
  const {app}=await buildApp(pool,proxyConfig);
  try {
    for(let i=0;i<21;i++) {
      const response=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin,'fly-client-ip':'198.51.100.10'}});
      assert.equal(response.statusCode,200);
    }
    for(let i=0;i<20;i++) {
      const response=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:{origin,'fly-client-ip':'198.51.100.10'},payload:{email:'same@example.test'}});
      assert.equal(response.statusCode,404);
    }
    const limited=await app.inject({method:'POST',url:'/api/v1/auth/login/options',headers:{origin,'fly-client-ip':'198.51.100.10'},payload:{email:'same@example.test'}});
    assert.equal(limited.statusCode,429);
  } finally {await app.close();}
});
