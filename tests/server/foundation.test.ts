import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import WebSocket from 'ws';
import { buildApp } from '../../server/app.js';
import { createPool } from '../../server/db.js';
import { saveUserMessage, history } from '../../server/chat.js';
import { persistAgentEvent, dispatchNext, refreshDispatchStatus, recoverInterruptedDispatches, type ManagedAgentClient } from '../../server/agent.js';
import { privateAgentContext } from '../../server/agent-context.js';
import type { Config } from '../../server/config.js';
import { startWorker } from '../../server/worker-lock.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for server integration tests');
const config: Config = {databaseUrl:databaseUrl ?? '',port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};
const origin = {origin:config.webOrigin};
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
async function fixture(pool: ReturnType<typeof createPool>) {
  const email = `${randomUUID()}@example.test`;
  const user = (await pool.query(`INSERT INTO users(email,name) VALUES($1,'Test person') RETURNING id,email,name`,[email])).rows[0];
  const room = (await pool.query(`INSERT INTO rooms(title) VALUES('Private agent') RETURNING id`)).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2)`,[room.id,user.id]);
  const token = randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')`,[digest(token),user.id]);
  return {user,room,token,cookie:`joystick_session=${token}`};
}
function socketClient(url:string,wsOrigin=config.webOrigin) {
  const socket = new WebSocket(url,{headers:{Origin:wsOrigin}});
  const frames:unknown[]=[];
  const waiters:Array<(frame:any)=>void>=[];
  socket.on('message',raw=>{ const frame=JSON.parse(raw.toString()); const waiter=waiters.shift(); if (waiter) waiter(frame); else frames.push(frame); });
  const next = () => frames.length ? Promise.resolve(frames.shift() as any) : new Promise<any>((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error('Timed out waiting for frame')),3000); waiters.push(frame=>{clearTimeout(timer);resolve(frame);}); });
  return {socket,next,opened:new Promise<void>((resolve,reject)=>{socket.once('open',()=>resolve());socket.once('error',reject);}),closed:new Promise<number>(resolve=>socket.once('close',resolve))};
}

test('foundation authorization, challenge replay, idempotency, provider dedup, and WebSocket revocation', async () => {
  const pool=createPool(config);
  const {app}=await buildApp(pool,config);
  try {
    const a=await fixture(pool);
    const b=await fixture(pool);
    const anonymous=await app.inject({method:'GET',url:'/api/v1/rooms'});
    assert.equal(anonymous.statusCode,401);
    const own=await app.inject({method:'GET',url:'/api/v1/rooms',headers:{cookie:a.cookie}});
    assert.equal(own.statusCode,200);
    assert.deepEqual(own.json().rooms.map((r:{id:string})=>r.id),[a.room.id]);
    const stolen=await app.inject({method:'GET',url:`/api/v1/rooms/${a.room.id}/messages`,headers:{cookie:b.cookie}});
    assert.equal(stolen.statusCode,404);
    await assert.rejects(()=>history(pool,b.user.id,a.room.id,0),/Room not found/);
    await assert.rejects(()=>saveUserMessage(pool,b.user.id,a.room.id,randomUUID(),'intrusion',false),/Room not found/);

    const options=await app.inject({method:'POST',url:'/api/v1/auth/register/options',headers:origin,payload:{email:`${randomUUID()}@example.test`,name:'New person'}});
    assert.equal(options.statusCode,200);
    const challengeCookie=options.cookies.find(c=>c.name==='joystick_challenge')?.value;
    assert.ok(challengeCookie);
    const invalid={id:'bogus',rawId:'bogus',type:'public-key',response:{clientDataJSON:'bogus',attestationObject:'bogus'}};
    const first=await app.inject({method:'POST',url:'/api/v1/auth/register/verify',headers:{...origin,cookie:`joystick_challenge=${challengeCookie}`},payload:{response:invalid}});
    assert.equal(first.statusCode,400);
    const replay=await app.inject({method:'POST',url:'/api/v1/auth/register/verify',headers:{...origin,cookie:`joystick_challenge=${challengeCookie}`},payload:{response:invalid}});
    assert.equal(replay.statusCode,400);
    assert.equal(replay.json().error.code,'challenge_invalid');
    const noOrigin=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie:a.cookie}});
    assert.equal(noOrigin.statusCode,403);

    const clientId=randomUUID();
    const saved=await saveUserMessage(pool,a.user.id,a.room.id,clientId,'Hello',false);
    assert.equal(saved.created,true);
    const again=await saveUserMessage(pool,a.user.id,a.room.id,clientId,'Hello',false);
    assert.equal(again.created,false);
    assert.equal(again.message.id,saved.message.id);
    await assert.rejects(()=>saveUserMessage(pool,a.user.id,a.room.id,clientId,'Changed',false),/already used/);
    const list=await history(pool,a.user.id,a.room.id,0);
    assert.equal(list.messages.length,1);
    assert.equal(list.messages[0].text,'Hello');

    const providerSessionId=`sesn_${randomUUID()}`;
    const providerEventId=`evt_${randomUUID()}`;
    await pool.query('UPDATE rooms SET provider_session_id=$2 WHERE id=$1',[a.room.id,providerSessionId]);
    const event={type:'agent.message',id:providerEventId,content:[{type:'text',text:'Agent reply'}]};
    assert.equal(await persistAgentEvent(pool,a.room.id,providerSessionId,event),true);
    assert.equal(await persistAgentEvent(pool,a.room.id,providerSessionId,event),false);
    const withReply=await history(pool,a.user.id,a.room.id,0);
    assert.equal(withReply.messages.length,2);
    assert.equal(withReply.messages[1].providerEventId,providerEventId);

    const agentConfig={...config,anthropicApiKey:'fake',anthropicAgentId:'agent_fake',anthropicEnvironmentId:'env_fake'};
    await pool.query(`INSERT INTO game_profiles(user_id,roles,skills) VALUES($1,ARRAY['Builder'], '["Research"]')`,[a.user.id]);
    const mission=(await pool.query(`INSERT INTO game_missions(title,pitch) VALUES('Account context mission','A mission Pip can discuss') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO game_memberships(mission_id,user_id) VALUES($1,$2)`,[mission.id,a.user.id]);
    const stage=(await pool.query(`INSERT INTO game_stages(mission_id,ordinal,name,status) VALUES($1,0,'Start','active') RETURNING id`,[mission.id])).rows[0];
    await pool.query(`INSERT INTO game_quests(mission_id,stage_id,title) VALUES($1,$2,'Available research task')`,[mission.id,stage.id]);
    const otherMission=(await pool.query(`INSERT INTO game_missions(title) VALUES('Other account mission') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO game_memberships(mission_id,user_id) VALUES($1,$2)`,[otherMission.id,b.user.id]);
    const otherStage=(await pool.query(`INSERT INTO game_stages(mission_id,ordinal,name,status) VALUES($1,0,'Private work','active') RETURNING id`,[otherMission.id])).rows[0];
    await pool.query(`INSERT INTO game_quests(mission_id,stage_id,title) VALUES($1,$2,'Other account private task')`,[otherMission.id,otherStage.id]);
    await saveUserMessage(pool,b.user.id,b.room.id,randomUUID(),'Other account private chat',false);
    const context=await privateAgentContext(pool,a.room.id,a.user.id);
    assert.ok(context?.includes('Available research task'));
    assert.ok(context?.includes('Account context mission'));
    assert.ok(!context?.includes('Other account private task'));
    assert.ok(!context?.includes('Other account private chat'));
    await assert.rejects(()=>privateAgentContext(pool,a.room.id,b.user.id),/no longer has room access/);
    const sharedRoom=(await pool.query(`INSERT INTO rooms(title,kind) VALUES('Shared','dm') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2),($1,$3)`,[sharedRoom.id,a.user.id,b.user.id]);
    assert.equal(await privateAgentContext(pool,sharedRoom.id,a.user.id),null);
    const scopedRoom=(await pool.query(`INSERT INTO rooms(title,kind,scope_id) VALUES('Mission chat','mission',$1) RETURNING id`,[mission.id])).rows[0];
    assert.equal(await privateAgentContext(pool,scopedRoom.id,a.user.id),null);
    await assert.rejects(()=>privateAgentContext(pool,scopedRoom.id,b.user.id),/no longer has room access/);
    let sends=0;
    let providerStatus:'running'|'idle'='running';
    let failSend=false;
    let streamOpened=false;
    const fake: ManagedAgentClient={
      create:async()=>{throw new Error('Existing session should be reused');},
      send:async(_sessionId,text)=>{assert.equal(streamOpened,true);streamOpened=false;sends++; if(sends===1){assert.ok(text.includes('Available research task'));assert.ok(!text.includes('Other account private task'));assert.ok(text.endsWith('User message (reply to this):\nFirst turn'));} if(failSend) throw new Error('Unknown provider outcome');},
      stream:async()=>{streamOpened=true;return {async *[Symbol.asyncIterator]() { yield {type:'session.status_idle'}; }};},
      list:async function*(){},
      status:async()=>providerStatus,
    };
    const pendingA=await saveUserMessage(pool,a.user.id,a.room.id,randomUUID(),'First turn',true);
    const pendingB=await saveUserMessage(pool,a.user.id,a.room.id,randomUUID(),'Second turn',true);
    assert.equal(pendingA.created,true);
    assert.equal(pendingB.created,true);
    const admissions=await Promise.all([dispatchNext(pool,agentConfig,fake),dispatchNext(pool,agentConfig,fake)]);
    assert.deepEqual(admissions.sort(),[false,true]);
    assert.equal(sends,1);
    assert.equal((await history(pool,a.user.id,a.room.id,0)).messages.find(message=>message.id===pendingA.message.id)?.text,'First turn');
    assert.equal(await dispatchNext(pool,agentConfig,fake),false);
    providerStatus='idle';
    await refreshDispatchStatus(pool,fake,a.room.id,providerSessionId);
    assert.equal(await dispatchNext(pool,agentConfig,fake),true);
    assert.equal(sends,2);
    providerStatus='idle';
    await refreshDispatchStatus(pool,fake,a.room.id,providerSessionId);
    const uncertain=await saveUserMessage(pool,a.user.id,a.room.id,randomUUID(),'Unknown turn',true);
    failSend=true;
    assert.equal(await dispatchNext(pool,agentConfig,fake),true);
    assert.equal(sends,3);
    assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE message_id=$1',[uncertain.message.id])).rows[0].status,'uncertain');
    assert.equal(await dispatchNext(pool,agentConfig,fake),false);
    const interrupted=await saveUserMessage(pool,a.user.id,a.room.id,randomUUID(),'Interrupted turn',true);
    await pool.query(`UPDATE agent_dispatches SET status='sending' WHERE message_id=$1`,[interrupted.message.id]);
    assert.ok(await recoverInterruptedDispatches(pool)>=1);
    assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE message_id=$1',[interrupted.message.id])).rows[0].status,'uncertain');
    assert.equal(await dispatchNext(pool,agentConfig,fake),false);
    const firstLock=await startWorker(pool);
    assert.ok(firstLock);
    const blocked=await saveUserMessage(pool,a.user.id,a.room.id,randomUUID(),'Blocked during overlap',true);
    await pool.query(`UPDATE agent_dispatches SET status='sending' WHERE message_id=$1`,[blocked.message.id]);
    const secondPool=createPool(config);
    try {
      const secondLock=await startWorker(secondPool);
      assert.equal(secondLock,null);
      assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE message_id=$1',[blocked.message.id])).rows[0].status,'sending');
    } finally {firstLock.release(true);}
    const recoveredLock=await startWorker(secondPool);
    assert.ok(recoveredLock);
    assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE message_id=$1',[blocked.message.id])).rows[0].status,'uncertain');
    recoveredLock.release(true);
    await secondPool.end();

    const address=await app.listen({port:0,host:'127.0.0.1'});
    const wsUrl=address.replace('http:','ws:')+'/api/v1/ws';
    const anonymousTicket=await app.inject({method:'POST',url:'/api/v1/ws-ticket',headers:origin});
    assert.equal(anonymousTicket.statusCode,401);
    const ticketResponse=await app.inject({method:'POST',url:'/api/v1/ws-ticket',headers:{...origin,cookie:a.cookie}});
    assert.equal(ticketResponse.statusCode,200);
    assert.equal(ticketResponse.headers['cache-control'],'no-store');
    const ticket=ticketResponse.json().ticket as string;
    assert.match(ticket,/^[A-Za-z0-9_-]{43}$/);
    assert.equal((await pool.query('SELECT 1 FROM ws_tickets WHERE ticket_hash=$1',[ticket])).rowCount,0);
    const wrongOrigin=socketClient(wsUrl,'https://evil.example.test');
    await wrongOrigin.opened;
    wrongOrigin.socket.send(JSON.stringify({type:'authenticate',ticket}));
    assert.equal(await wrongOrigin.closed,1008);
    const ws=socketClient(wsUrl);
    await ws.opened;
    ws.socket.send(JSON.stringify({type:'authenticate',ticket}));
    assert.equal((await ws.next()).type,'ready');
    const replaySocket=socketClient(wsUrl);
    await replaySocket.opened;
    replaySocket.socket.send(JSON.stringify({type:'authenticate',ticket}));
    assert.equal(await replaySocket.closed,1008);
    ws.socket.send(JSON.stringify({type:'subscribe',roomId:a.room.id,after:0}));
    for(let i=0;i<7;i++) assert.equal((await ws.next()).type,'message.saved');
    assert.equal((await ws.next()).type,'subscribed');
    ws.socket.send(JSON.stringify({type:'message.send',roomId:a.room.id,clientId:randomUUID(),text:'Live'}));
    const live=await ws.next();
    assert.equal(live.type,'message.saved');
    assert.equal(live.message.text,'Live');
    const secondTicket=(await app.inject({method:'POST',url:'/api/v1/ws-ticket',headers:{...origin,cookie:a.cookie}})).json().ticket as string;
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[digest(a.token)]);
    ws.socket.send(JSON.stringify({type:'message.send',roomId:a.room.id,clientId:randomUUID(),text:'Forbidden'}));
    let denied=await ws.next();
    if (denied.type === 'agent.status') denied=await ws.next();
    assert.equal(denied.type,'error');
    assert.equal(denied.code,'unauthorized');
    ws.socket.close();
    const reconnect=socketClient(wsUrl);
    await reconnect.opened;
    reconnect.socket.send(JSON.stringify({type:'authenticate',ticket:secondTicket}));
    const code=await reconnect.closed;
    assert.equal(code,1008);
    const final=await history(pool,a.user.id,a.room.id,0);
    assert.equal(final.messages.filter(m=>m.text==='Forbidden').length,0);
  } finally { await app.close(); await pool.end(); }
});
