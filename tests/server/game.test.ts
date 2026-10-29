import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { applyGameAction, getGameSnapshot } from '../../server/game/service.js';
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
  } finally {
    for(const id of missions){await pool.query(`DELETE FROM rooms WHERE kind='mission' AND scope_id=$1`,[id]);await pool.query('DELETE FROM game_ledger WHERE mission_id=$1',[id]);await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);}
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
    if(previousTestCredits===undefined)delete process.env.GAME_TEST_CREDITS;else process.env.GAME_TEST_CREDITS=previousTestCredits;
  }
});
