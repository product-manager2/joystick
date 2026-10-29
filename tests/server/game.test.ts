import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { applyGameAction, getGameSnapshot } from '../../server/game/service.js';
import { markRoomRead } from '../../server/chat.js';
import type { GameActionInput } from '../../contracts/game.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl) throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('mission claims, artifact reviews, dependencies and command replay use real membership',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const previousTestCredits=process.env.GAME_TEST_CREDITS;process.env.GAME_TEST_CREDITS='true';
  const users:string[]=[], missions:string[]=[];
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=async(user:string,action:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>,requestId=randomUUID())=>applyGameAction(pool,user,{action,entityId,payload,requestId});
  try {
    const owner=await makeUser('Owner'),maker=await makeUser('Maker'),reviewerA=await makeUser('Reviewer A'),reviewerB=await makeUser('Reviewer B'),stranger=await makeUser('Stranger');
    let snap=await action(owner,'mission.create',undefined,{title:'A real test mission',stages:[{name:'Build',goal:'Ship one reviewed result',target:1},{name:'Share'}]});
    const m=snap.missions.find(x=>x.title==='A real test mission')!;const mid=m.id as string;missions.push(mid);const stage=(m.stages as any[])[0].id as string;
    await action(maker,'mission.join',mid);await action(reviewerA,'mission.join',mid);await action(reviewerB,'mission.join',mid);
    await action(owner,'funding.reserve',mid,{amount:50});
    assert.deepEqual(snap.missions.find(x=>x.id===mid)?.funding,{reserved:0,spent:0});
    assert.deepEqual((await getGameSnapshot(pool,owner)).missions.find(x=>x.id===mid)?.funding,{reserved:50,spent:0});
    await assert.rejects(()=>action(maker,'quest.create',stage,{title:'Unauthorized reward',rewardCredits:20}),/Mission owner action/);
    await assert.rejects(()=>action(owner,'quest.create',stage,{title:'Overfunded reward',rewardCredits:51}),/Reserve enough test credits/);
    snap=await action(owner,'quest.create',stage,{title:'First result',size:'S',rewardCredits:20});
    const q=(snap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.title==='First result')!.id as string;
    assert.equal((snap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.id===q).xp,120);
    snap=await action(owner,'quest.create',stage,{title:'Dependent result',dependencies:[q]});
    const child=(snap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.title==='Dependent result')!.id as string;
    await action(reviewerA,'quest.watch',q);
    await assert.rejects(()=>action(stranger,'quest.claim',q),/Join this mission/);
    await assert.rejects(()=>action(maker,'quest.claim',child),/Action is not allowed/);
    await assert.rejects(()=>action(owner,'quest.assign',child,{userId:maker}),/Action is not allowed/);
    const requestId=randomUUID();await action(maker,'quest.claim',q,{},requestId);await action(maker,'quest.claim',q,{},requestId);
    const watched=await getGameSnapshot(pool,reviewerA);assert.ok(watched.notifications.some(n=>n.kind==='quest.claimed'&&n.entityId===q));
    await assert.rejects(()=>action(maker,'quest.release',q,{},requestId),/different action/);
    await action(maker,'quest.submit',q,{title:'Evidence',content:'Observed output and method'});
    await assert.rejects(()=>action(maker,'quest.review',q,{verdict:'approve'}),/Action is not allowed/);
    await action(reviewerA,'quest.review',q,{verdict:'approve'});
    await assert.rejects(()=>action(reviewerA,'quest.review',q,{verdict:'approve'}),/Action is not allowed/);
    snap=await action(reviewerB,'quest.review',q,{verdict:'approve'});
    assert.equal((snap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.id===q).done,true);
    const journal=await pool.query(`SELECT user_id,kind,amount FROM game_ledger WHERE quest_id=$1 AND kind IN ('award','earning')`,[q]);
    assert.deepEqual(journal.rows.map(r=>Number(r.amount)).sort((a,b)=>a-b),[-20,20]);
    assert.equal((await getGameSnapshot(pool,maker)).wallet.balance,1020);
    const funded=(await getGameSnapshot(pool,owner)).missions.find(x=>x.id===mid)!;
    assert.deepEqual(funded.funding,{reserved:30,spent:20});
    const makerInOwnerView=(await getGameSnapshot(pool,owner)).people.find(p=>p.id===maker)!;
    assert.deepEqual(makerInOwnerView.sharedMissionIds,[mid]);
    assert.ok((makerInOwnerView.approvedTasks as any[]).some(t=>t.id===q));
    assert.equal((makerInOwnerView as any).preferences,undefined);
    await action(maker,'quest.claim',child);
    const parentSnap=await action(owner,'quest.create',stage,{title:'Parent task'});
    const parent=(parentSnap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.title==='Parent task')!.id as string;
    const partSnap=await action(owner,'quest.create',stage,{title:'Part task',parentId:parent});
    const part=(partSnap.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.title==='Part task')!.id as string;
    await assert.rejects(()=>action(owner,'quest.update',part,{dependencies:[parent]}),/Action is not allowed/);
    const edited=await action(owner,'quest.update',part,{dependencies:[q]});
    assert.deepEqual((edited.missions.find(x=>x.id===mid)!.quests as any[]).find(x=>x.id===part).dependencies,[q]);
    await assert.rejects(()=>action(owner,'quest.assign',parent,{userId:maker}),/Action is not allowed/);
    await assert.rejects(()=>action(owner,'stage.approve',stage),/Action is not allowed/);
    await action(maker,'quest.release',child);
    const room=await action(owner,'room.create',undefined,{kind:'mission',scopeId:mid});
    assert.ok(room.threads.some(t=>t.kind==='mission'&&t.scopeId===mid));
    const outsider=await getGameSnapshot(pool,stranger);
    assert.ok(!outsider.threads.some(t=>t.kind==='mission'&&t.scopeId===mid));
    assert.ok(!outsider.people.some(p=>p.id===maker));
  } finally {
    for(const id of missions){await pool.query(`DELETE FROM rooms WHERE kind='mission' AND scope_id=$1`,[id]);await pool.query('DELETE FROM game_ledger WHERE mission_id=$1',[id]);await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);}
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
    if(previousTestCredits===undefined)delete process.env.GAME_TEST_CREDITS;else process.env.GAME_TEST_CREDITS=previousTestCredits;
  }
});

test('owner approves a completed stage, notifies watchers, and advances while retaining history',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[],missions:string[]=[];
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  try{
    const owner=await makeUser('Stage owner'),worker=await makeUser('Stage worker'),first=await makeUser('Stage reviewer A'),second=await makeUser('Stage reviewer B');
    let snap=await action(owner,'mission.create',undefined,{title:'Stage approval regression',stages:[{name:'Build',target:1},{name:'Ship',target:1}]});
    const mission=snap.missions.find(m=>m.title==='Stage approval regression')!;missions.push(mission.id as string);
    const firstStage=(mission.stages as any[])[0].id as string,secondStage=(mission.stages as any[])[1].id as string;
    for(const user of [worker,first,second])await action(user,'mission.join',mission.id as string);
    snap=await action(owner,'quest.create',firstStage,{title:'Complete the build'});
    const quest=(snap.missions.find(m=>m.id===mission.id)!.quests as any[]).find(q=>q.title==='Complete the build')!.id as string;
    await action(first,'quest.watch',quest);
    await action(worker,'quest.claim',quest);
    await action(worker,'quest.submit',quest,{title:'Evidence',content:'Completed and checked'});
    await action(first,'quest.review',quest,{verdict:'approve',note:'Looks good'});
    await action(second,'quest.review',quest,{verdict:'approve',note:'Verified independently'});
    snap=await action(owner,'stage.approve',firstStage);
    const approved=snap.missions.find(m=>m.id===mission.id)!;
    assert.equal((approved.stages as any[])[0].status,'approved');
    assert.equal((approved.stages as any[])[1].status,'pending');
    const notified=await getGameSnapshot(pool,first);
    assert.ok(notified.notifications.some(n=>n.kind==='stage.approved'&&n.entityId===firstStage));
    snap=await action(owner,'stage.advance',mission.id as string);
    const advanced=snap.missions.find(m=>m.id===mission.id)!;
    assert.equal((advanced.stages as any[])[0].status,'approved');
    assert.equal((advanced.stages as any[])[1].status,'active');
    assert.equal((advanced.quests as any[]).find(q=>q.id===quest)?.done,true);
    const history=await pool.query('SELECT approved_by,approved_at FROM game_stages WHERE id=$1',[firstStage]);
    assert.equal(history.rows[0].approved_by,owner);
    assert.ok(history.rows[0].approved_at);
  }finally{
    for(const id of missions)await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});

test('snapshot activity and public member details follow current access and read progress',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[],missions:string[]=[];
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  try{
    const owner=await makeUser('Scope owner'),member=await makeUser('Scope member'),outsider=await makeUser('Scope outsider');
    let snap=await action(owner,'mission.create',undefined,{title:'Scoped activity',stages:[{name:'Build'}]});
    const mission=snap.missions.find(m=>m.title==='Scoped activity')!;const mid=mission.id as string;missions.push(mid);
    const stage=(mission.stages as any[])[0].id as string;
    await action(member,'mission.join',mid);
    await action(member,'profile.update',undefined,{agentName:'Scope Bot',roles:['builder'],skills:['testing'],preferences:{botShape:'orb',privateNote:'keep private'}});
    snap=await action(owner,'plan.create',stage,{name:'Shared plan',squad:'Both'});
    const plan=(snap.missions.find(m=>m.id===mid)!.strategies as any[]).find(p=>p.name==='Shared plan');
    await action(member,'plan.join',plan.id);
    const ownerView=await getGameSnapshot(pool,owner);
    const person=ownerView.people.find(p=>p.id===member)!;
    assert.equal(person.agentName,'Scope Bot');
    assert.deepEqual(person.roles,['builder']);
    assert.deepEqual(person.skills,['testing']);
    assert.equal(person.botShape,'orb');
    assert.equal((person as any).privateNote,undefined);
    assert.equal((person as any).preferences,undefined);
    assert.deepEqual(person.sharedMissionIds,[mid]);
    assert.deepEqual(person.sharedPlanIds,[plan.id]);
    assert.equal((ownerView.missions.find(m=>m.id===mid)!.strategies as any[]).find(p=>p.id===plan.id).memberCount,2);
    const withRoom=await action(owner,'room.create',undefined,{kind:'mission',scopeId:mid});
    const room=withRoom.threads.find(t=>t.kind==='mission'&&t.scopeId===mid)!.id as string;
    await pool.query(`INSERT INTO messages(room_id,sequence,role,text,user_id) VALUES($1,1,'user','Visible hello',$2),($1,2,'user','Another update',$2)`,[room,member]);
    await pool.query('UPDATE rooms SET next_sequence=3 WHERE id=$1',[room]);
    const before=(await getGameSnapshot(pool,owner)).threads.find(t=>t.id===room)!;
    assert.equal((before.lastMessage as any).text,'Another update');
    assert.equal((before.lastMessage as any).senderName,'Scope member');
    assert.equal(before.unread,2);
    await markRoomRead(pool,owner,room,1);
    assert.equal((await getGameSnapshot(pool,owner)).threads.find(t=>t.id===room)!.unread,1);
    await markRoomRead(pool,owner,room,0);
    assert.equal((await getGameSnapshot(pool,owner)).threads.find(t=>t.id===room)!.unread,1);
    await assert.rejects(()=>markRoomRead(pool,owner,room,3),/Read cursor exceeds/);
    await assert.rejects(()=>markRoomRead(pool,outsider,room,1),/Room not found/);
    assert.ok(!(await getGameSnapshot(pool,outsider)).threads.some(t=>t.id===room));
    await action(member,'mission.leave',mid);
    const after=(await getGameSnapshot(pool,member));
    assert.ok(!after.threads.some(t=>t.id===room));
    assert.ok(!after.people.some(p=>p.id===owner));
    await assert.rejects(()=>markRoomRead(pool,member,room,2),/Room not found/);
  }finally{
    for(const id of missions)await pool.query(`DELETE FROM rooms WHERE kind='mission' AND scope_id=$1`,[id]);
    for(const id of missions)await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});
