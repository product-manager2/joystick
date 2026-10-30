import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { applyGameAction } from '../../server/game/service.js';
import type { GameActionInput } from '../../contracts/game.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('stage outcome targets and approved-task gates keep their distinct meanings',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[],missions:string[]=[];
  const makeUser=async(name:string)=>{const result=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);users.push(result.rows[0].id);return result.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  try{
    const owner=await makeUser('Target owner'),worker=await makeUser('Target worker'),reviewerA=await makeUser('Target reviewer A'),reviewerB=await makeUser('Target reviewer B');
    const create=async(stage:Record<string,unknown>)=>{const title=`Target semantics ${randomUUID()}`;const snap=await action(owner,'mission.create',undefined,{title,stages:[stage]});const mission=snap.missions.find(m=>m.title===title)!;missions.push(mission.id as string);return mission;};
    const legacy=await create({name:'Legacy task count',target:3});
    const mission=await create({name:'Reach users',target:1000,unit:'users'});
    const custom=await create({name:'Custom approval gate',target:1000,unit:'users',gateTarget:2});
    const stageOf=(m:typeof mission)=>(m.stages as Array<{id:string;target:number;gateTarget:number;unit:string}>)[0];
    assert.deepEqual([stageOf(legacy),stageOf(mission),stageOf(custom)].map(s=>[s.target,s.gateTarget,s.unit]),[
      [3,3,'approved tasks'],[1000,1,'users'],[1000,2,'users'],
    ]);

    // A real-world target of 1,000 users does not require 1,000 approved tasks.
    const stage=stageOf(mission);
    for(const user of [worker,reviewerA,reviewerB])await action(user,'mission.join',mission.id as string);
    const withTask=await action(owner,'quest.create',stage.id,{title:'First reviewed result'});
    const quest=(withTask.missions.find(m=>m.id===mission.id)!.quests as Array<{id:string;title:string}>).find(q=>q.title==='First reviewed result')!;
    await action(worker,'quest.claim',quest.id);
    const submission=await action(worker,'quest.submit',quest.id,{title:'Evidence',content:'A documented result with a reproducible method'});
    const artifactId=((submission.missions.find(m=>m.id===mission.id)!.quests as any[]).find(q=>q.id===quest.id).artifacts as any[]).at(-1).id;
    await action(reviewerA,'quest.review',quest.id,{artifactId,verdict:'approve'});
    await action(reviewerB,'quest.review',quest.id,{artifactId,verdict:'approve'});
    const approved=await action(owner,'stage.approve',stage.id);
    assert.equal((approved.missions.find(m=>m.id===mission.id)!.stages as Array<{id:string;status:string}>).find(s=>s.id===stage.id)?.status,'approved');
  }finally{
    for(const id of missions){await pool.query('DELETE FROM game_ledger WHERE mission_id=$1',[id]);await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);}
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});
