import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { buildApp } from '../../server/app.js';
import { saveUserMessage, markRoomRead } from '../../server/chat.js';
import { createPool } from '../../server/db.js';
import { deliverNextPush, parseSubscription, validPushEndpoint, type PushSender } from '../../server/push.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false,vapidPublicKey:'test-public',vapidPrivateKey:'test-private',vapidSubject:'https://example.test'};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const origin={origin:config.webOrigin};
const createdUsers=new WeakMap<ReturnType<typeof createPool>,string[]>();
const createdRooms=new WeakMap<ReturnType<typeof createPool>,string[]>();
const createdMissions=new WeakMap<ReturnType<typeof createPool>,string[]>();
async function user(pool:ReturnType<typeof createPool>){
  const account=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Push tester') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
  const ids=createdUsers.get(pool)??[];ids.push(account.id);createdUsers.set(pool,ids);
  const token=randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hash(token),account.id]);
  return {id:account.id,cookie:`joystick_session=${token}`,sessionHash:hash(token)};
}
async function cleanup(pool:ReturnType<typeof createPool>){
  const ids=createdUsers.get(pool)??[];
  const rooms=createdRooms.get(pool)??[];
  const missions=createdMissions.get(pool)??[];
  if(!ids.length && !rooms.length && !missions.length)return;
  await pool.query('DELETE FROM messages WHERE user_id=ANY($1::uuid[])',[ids]);
  await pool.query('DELETE FROM rooms WHERE id=ANY($1::uuid[])',[rooms]);
  await pool.query('DELETE FROM game_missions WHERE id=ANY($1::uuid[])',[missions]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
}
function subscription(){return {endpoint:`https://web.push.apple.com/${randomUUID()}`,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};}
async function subscribe(app:Awaited<ReturnType<typeof buildApp>>['app'],account:Awaited<ReturnType<typeof user>>,value=subscription()){
  return app.inject({method:'POST',url:'/api/v1/push/subscribe',headers:{...origin,cookie:account.cookie},payload:value});
}
async function room(pool:ReturnType<typeof createPool>,members:string[]){
  const result=(await pool.query("INSERT INTO rooms(title,kind) VALUES('Push room','dm') RETURNING id")).rows[0];
  const ids=createdRooms.get(pool)??[];ids.push(result.id);createdRooms.set(pool,ids);
  for(const member of members)await pool.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2)',[result.id,member]);
  return result.id as string;
}
const pending=async(pool:ReturnType<typeof createPool>,messageId:string)=>Number((await pool.query('SELECT count(*)::int AS n FROM push_deliveries WHERE message_id=$1',[messageId])).rows[0].n);

test('push endpoint validation blocks arbitrary hosts, credentials, ports, and insecure URLs',()=>{
  assert.equal(validPushEndpoint('https://web.push.apple.com/a'),true);
  for(const endpoint of ['http://web.push.apple.com/a','https://127.0.0.1/a','https://web.push.apple.com.evil.test/a','https://user@web.push.apple.com/a','https://web.push.apple.com:8443/a','https://web.push.apple.com/a#fragment'])assert.equal(validPushEndpoint(endpoint),false,endpoint);
  assert.throws(()=>parseSubscription({endpoint:'https://127.0.0.1/a',keys:{p256dh:'A',auth:'B'}}));
});

test('saved messages enqueue once for authorized recipients and suppress read or revoked deliveries',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  try{
    const sender=await user(pool),recipient=await user(pool),outsider=await user(pool);
    const roomId=await room(pool,[sender.id,recipient.id]);
    assert.equal((await subscribe(app,recipient)).statusCode,200);
    assert.equal((await subscribe(app,outsider)).statusCode,200);
    const clientId=randomUUID();
    const message=await saveUserMessage(pool,sender.id,roomId,clientId,'Secret message body',false);
    assert.equal(await pending(pool,message.message.id),1);
    assert.equal((await saveUserMessage(pool,sender.id,roomId,clientId,'Secret message body',false)).created,false);
    assert.equal(await pending(pool,message.message.id),1);
    const sent:string[]=[];
    const mock:PushSender={send:async(_sub,payload)=>{sent.push(payload);}};
    await deliverNextPush(pool,mock);
    assert.equal(sent.length,1);
    assert.equal(JSON.parse(sent[0]).roomId,roomId);
    assert.ok(!sent[0].includes('Secret message body'));
    assert.equal(await deliverNextPush(pool,mock),false);

    const read=await saveUserMessage(pool,sender.id,roomId,randomUUID(),'Already read',false);
    await markRoomRead(pool,recipient.id,roomId,read.message.sequence);
    await deliverNextPush(pool,mock);
    assert.equal(sent.length,1);

    const revoked=await saveUserMessage(pool,sender.id,roomId,randomUUID(),'Revoked before send',false);
    assert.equal(await pending(pool,revoked.message.id),1);
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[recipient.sessionHash]);
    await deliverNextPush(pool,mock);
    assert.equal(sent.length,1);
  }finally{await cleanup(pool);await app.close();await pool.end();}
});

test('subscription ownership transfers between accounts and logout blocks old jobs',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  try{
    const a=await user(pool),b=await user(pool),endpoint=subscription();
    assert.equal((await subscribe(app,a,endpoint)).statusCode,200);
    assert.equal((await subscribe(app,b,endpoint)).statusCode,200);
    const owners=(await pool.query('SELECT user_id FROM push_subscriptions WHERE endpoint_hash=$1',[hash(endpoint.endpoint)])).rows;
    assert.deepEqual(owners.map(row=>row.user_id),[b.id]);
    const wrong=await app.inject({method:'POST',url:'/api/v1/push/unsubscribe',headers:{...origin,cookie:a.cookie},payload:{endpoint:endpoint.endpoint}});
    assert.equal(wrong.statusCode,200);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1',[b.id])).rows[0].n,1);
    const loggedOut=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{...origin,cookie:b.cookie},payload:{}});
    assert.equal(loggedOut.statusCode,200);
    const status=await app.inject({method:'GET',url:'/api/v1/push/status',headers:{cookie:b.cookie}});
    assert.equal(status.statusCode,401);
  }finally{await cleanup(pool);await app.close();await pool.end();}
});

test('transient push failures retry; expired endpoints are removed',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  try{
    const a=await user(pool),b=await user(pool),roomId=await room(pool,[a.id,b.id]);
    await subscribe(app,b);
    const message=await saveUserMessage(pool,a.id,roomId,randomUUID(),'Retry test',false);
    let calls=0;
    await deliverNextPush(pool,{send:async()=>{calls++;throw {statusCode:503};}});
    assert.equal(calls,1);
    const retry=(await pool.query('SELECT status,attempts FROM push_deliveries WHERE message_id=$1',[message.message.id])).rows[0];
    assert.equal(retry.status,'pending');assert.equal(retry.attempts,1);
    await pool.query('UPDATE push_deliveries SET next_attempt_at=now() WHERE message_id=$1',[message.message.id]);
    await deliverNextPush(pool,{send:async()=>{calls++;throw {statusCode:410};}});
    assert.equal(calls,2);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1',[b.id])).rows[0].n,0);
  }finally{await cleanup(pool);await app.close();await pool.end();}
});

test('mission membership is checked again before a queued chat push leaves the worker',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  try{
    const a=await user(pool),b=await user(pool),c=await user(pool);
    const mission=(await pool.query("INSERT INTO game_missions(title) VALUES('Push mission') RETURNING id")).rows[0];
    createdMissions.set(pool,[mission.id]);
    await pool.query('INSERT INTO game_memberships(mission_id,user_id) VALUES($1,$2),($1,$3)',[mission.id,a.id,b.id]);
    const scoped=(await pool.query("INSERT INTO rooms(title,kind,scope_id) VALUES('Mission chat','mission',$1) RETURNING id",[mission.id])).rows[0];
    createdRooms.set(pool,[scoped.id]);
    await subscribe(app,b);await subscribe(app,c);
    const message=(await pool.query("INSERT INTO messages(room_id,sequence,role,text,user_id) VALUES($1,1,'user','Scoped message',$2) RETURNING id",[scoped.id,a.id])).rows[0];
    assert.equal(await pending(pool,message.id),1);
    await pool.query('DELETE FROM game_memberships WHERE mission_id=$1 AND user_id=$2',[mission.id,b.id]);
    let sent=0;
    await deliverNextPush(pool,{send:async()=>{sent++;}});
    assert.equal(sent,0);
  }finally{await cleanup(pool);await app.close();await pool.end();}
});

test('an in-flight provider send does not block a new chat message',async()=>{
  const pool=createPool(config),{app}=await buildApp(pool,config);
  let release=()=>{};
  let delivery:Promise<boolean>|null=null;
  try{
    const a=await user(pool),b=await user(pool),roomId=await room(pool,[a.id,b.id]);
    await subscribe(app,b);
    await saveUserMessage(pool,a.id,roomId,randomUUID(),'First message',false);
    let started=()=>{};
    const sending=new Promise<void>(resolve=>{started=resolve;});
    const held=new Promise<void>(resolve=>{release=resolve;});
    delivery=deliverNextPush(pool,{send:async()=>{started();await held;}});
    await sending;
    const next=saveUserMessage(pool,a.id,roomId,randomUUID(),'Second message',false);
    const result=await Promise.race([next.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),3000))]);
    assert.equal(result,true,'saving chat must complete while push provider is pending');
    release();
    await delivery;
  }finally{release();if(delivery)await delivery.catch(()=>{});await cleanup(pool);await app.close();await pool.end();}
});
