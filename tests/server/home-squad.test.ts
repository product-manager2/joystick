import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { applyGameAction } from '../../server/game/service.js';
import type { GameActionInput } from '../../contracts/game.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl) throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('the squad you joined or switched to last is your squad for that mission',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[];let missionId:string|undefined;
  const makeUser=async(name:string)=>{const r=await pool.query('INSERT INTO users(name) VALUES($1) RETURNING id',[name]);users.push(r.rows[0].id);return r.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  try{
    const owner=await makeUser('Owner'),player=await makeUser('Player');
    let snap=await action(owner,'mission.create',undefined,{title:'Home squad test',stages:[{name:'One',target:1},{name:'Two',target:1}]});
    const mission=()=>snap.missions.find(m=>m.title==='Home squad test')!;missionId=mission().id as string;
    const [one,two]=(mission().stages as any[]).map(s=>s.id as string);
    snap=await action(owner,'plan.create',one,{name:'Steady',squad:'Steady'});
    assert.equal(mission().homePlanId,(mission().strategies as any[]).find(p=>p.squad==='Steady').id,'starting a squad makes it yours');
    snap=await action(owner,'plan.create',two,{name:'Leap',squad:'Leap'});
    const steady=(mission().strategies as any[]).find(p=>p.squad==='Steady').id,leap=(mission().strategies as any[]).find(p=>p.squad==='Leap').id;

    snap=await action(player,'mission.join',missionId);
    assert.equal(mission().homePlanId,null);
    snap=await action(player,'plan.join',steady);
    assert.equal(mission().homePlanId,steady);
    snap=await action(player,'plan.join',leap);
    assert.equal(mission().homePlanId,leap);
    // Switching back to a squad you are already in.
    snap=await action(player,'plan.join',steady);
    assert.equal(mission().homePlanId,steady);
    const squads=(await pool.query('SELECT count(*)::int n FROM game_plan_memberships WHERE user_id=$1',[player])).rows[0].n;
    assert.equal(squads,2);
  }finally{
    if(missionId)await pool.query('DELETE FROM game_missions WHERE id=$1',[missionId]);
    for(const u of users)await pool.query('DELETE FROM users WHERE id=$1',[u]);
    await pool.end();
  }
});
