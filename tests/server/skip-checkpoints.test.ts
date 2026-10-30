import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { applyGameAction } from '../../server/game/service.js';
import type { GameActionInput } from '../../contracts/game.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl) throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('a plan can aim past the next checkpoint and skip the ones it jumps over',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[],missions:string[]=[];
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(name) VALUES($1) RETURNING id',[name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  const rejects=(p:Promise<unknown>)=>assert.rejects(p,/Action is not allowed/);
  try{
    const owner=await makeUser('Owner'),maker=await makeUser('Maker'),a=await makeUser('Checker A'),b=await makeUser('Checker B');
    let snap=await action(owner,'mission.create',undefined,{title:'Skip ahead test',stages:[{name:'Map',target:1},{name:'File',target:1},{name:'Fixed',target:1}]});
    const mission=snap.missions.find(m=>m.title==='Skip ahead test')!;missions.push(mission.id as string);
    const [map,file,fixed]=(mission.stages as any[]).map(s=>s.id as string);
    for(const user of [maker,a,b])await action(user,'mission.join',mission.id as string);
    const plans=()=>snap.missions.find(m=>m.id===mission.id)!.strategies as any[];
    snap=await action(owner,'plan.create',map,{name:'Pin them all',squad:'Patrol'});
    snap=await action(owner,'plan.create',fixed,{name:'Worst first',squad:'Crash Map'});
    const patrol=plans().find(p=>p.squad==='Patrol').id,crash=plans().find(p=>p.squad==='Crash Map').id;
    assert.equal(plans().find(p=>p.id===crash).stageId,fixed);

    // The later checkpoint opens only for the plan aimed at it.
    await rejects(action(owner,'quest.create',fixed,{title:'Loose task'}));
    await rejects(action(owner,'quest.create',fixed,{title:'Wrong plan',planId:patrol}));
    snap=await action(owner,'quest.create',fixed,{title:'Fix the 100 worst',planId:crash});
    snap=await action(owner,'quest.create',map,{title:'Pin 50',planId:patrol});
    const quests=()=>snap.missions.find(m=>m.id===mission.id)!.quests as any[];
    const worst=quests().find(q=>q.title==='Fix the 100 worst').id,pin=quests().find(q=>q.title==='Pin 50').id;

    // A squad can re-aim while its tasks are still open; they move with it.
    snap=await action(owner,'plan.update',patrol,{stageId:file});
    assert.equal(plans().find(p=>p.id===patrol).stageId,file);
    assert.equal(quests().find(q=>q.id===pin).stageId,file);
    snap=await action(owner,'plan.update',patrol,{stageId:map});

    await action(maker,'quest.claim',worst);
    await action(maker,'quest.submit',worst,{title:'Repairs',content:'100 fixed, photos attached'});
    await action(a,'quest.review',worst,{verdict:'approve',note:'Checked 10'});
    await action(b,'quest.review',worst,{verdict:'approve',note:'Checked 10 more'});
    snap=await action(owner,'stage.approve',fixed);
    const done=snap.missions.find(m=>m.id===mission.id)!;
    assert.deepEqual((done.stages as any[]).map(s=>s.status),['skipped','skipped','approved']);
    assert.equal(done.current,2);
    // Work aimed at a skipped checkpoint can no longer be claimed.
    await rejects(action(maker,'quest.claim',pin));
  }finally{
    for(const id of missions)await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});
