import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { syncGameSeedCatalog } from '../../server/game/seed.js';
import { getGameSnapshot } from '../../server/game/service.js';
import { runContext } from '../../server/agent-runs/routes.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('catalog refresh adds descriptive work without rewriting real progress or owner edits',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const key=`refresh-${randomUUID()}`;
  let user:string|undefined,mission:string|undefined;
  const catalog=(extra=false)=>[{
    id:key,title:'Catalog title',pitch:'Catalog pitch',tag:'Community',glyph:'spark',color:'var(--blue)',rules:['Open work'],seedNotice:'Illustrative only',sample:{detail:{facts:['New fact']},budget:'Example only'},
    stages:[
      {name:'First',goal:'First goal',target:1,unit:'results',tracks:[],plainWords:'Plain first',why:'Why first',howItFits:'First fits',doneWhen:'First done',approves:'Owner',roles:{Maker:'Builds'},sampleStatus:'Now'},
      {name:'Second',goal:'Second goal',target:1,unit:'results',tracks:[],plainWords:extra?'Updated plain second':'Plain second',why:'Why second',howItFits:'Second fits',doneWhen:'Second done',approves:'Owner',roles:{Checker:'Checks'},sampleStatus:'Locked'},
    ],
    strategies:[{id:'plan',name:'Catalog plan',squad:'A squad',bet:'An approach',color:'var(--blue)',howItWorks:['Step one'],rolesNeeded:'Maker',relations:'Works together',sampleStatus:'Running',sampleBlocker:'Example blocker'}],
    quests:[
      {id:'first',title:'First task',role:'maker',size:'S',coins:0,stage:1,strat:'plan',dependsOn:[],detail:{brief:'First brief'},where:'Online',fit:'For makers',sampleState:'Done'},
      {id:'second',title:'Second task',role:'checker',size:'M',coins:0,stage:2,strat:'plan',dependsOn:['first'],detail:{brief:extra?'Updated second brief':'Second brief'},where:'Remote',fit:'For checkers',sampleState:'Open'},
      ...(extra?[
        {id:'late',title:'Late task',role:'maker',size:'S',coins:0,stage:1,strat:'plan',dependsOn:[],detail:{brief:'Late brief'}},
        {id:'new-a',title:'New A',role:'maker',size:'S',coins:0,stage:2,strat:'plan',dependsOn:['new-b'],detail:{brief:'A brief'}},
        {id:'new-b',title:'New B',role:'maker',size:'S',coins:0,stage:2,strat:'plan',dependsOn:['new-a'],detail:{brief:'B brief'}},
      ]:[]),
    ],
  }];
  try{
    await syncGameSeedCatalog(pool,catalog());
    mission=(await pool.query('SELECT id FROM game_missions WHERE seed_key=$1',[key])).rows[0].id;
    user=(await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,'Catalog owner'])).rows[0].id;
    await pool.query('INSERT INTO game_memberships(mission_id,user_id,role) VALUES($1,$2,$3)',[mission,user,'owner']);
    const stages=(await pool.query('SELECT id,ordinal FROM game_stages WHERE mission_id=$1 ORDER BY ordinal',[mission])).rows;
    const first=(await pool.query('SELECT id FROM game_quests WHERE mission_id=$1 AND seed_key=$2',[mission,'first'])).rows[0].id;
    const second=(await pool.query('SELECT id,plan_id,stage_id FROM game_quests WHERE mission_id=$1 AND seed_key=$2',[mission,'second'])).rows[0];
    const plan=(await pool.query('SELECT id,stage_id FROM game_plans WHERE mission_id=$1',[mission])).rows[0];
    assert.equal(plan.stage_id,stages[0].id);
    assert.equal(second.plan_id,null);
    assert.equal(second.stage_id,stages[1].id);
    await pool.query(`UPDATE game_missions SET title='Owner title',pitch='Owner pitch',owner_id=$2,stage_index=1 WHERE id=$1`,[mission,user]);
    await pool.query(`UPDATE game_stages SET status='approved',approved_by=$2,approved_at=now() WHERE id=$1`,[stages[0].id,user]);
    await pool.query(`UPDATE game_stages SET status='active' WHERE id=$1`,[stages[1].id]);
    await pool.query(`UPDATE game_plans SET name='Owner plan',metadata=metadata || '{"into":"Owner direction"}'::jsonb WHERE id=$1`,[plan.id]);
    await pool.query(`UPDATE game_quests SET title='Owner task',state='claimed',claimed_by=$2,claimed_at=now(),reward_credits=12,brief=brief || '{"description":"Owner description"}'::jsonb WHERE id=$1`,[second.id,user]);
    await pool.query('INSERT INTO game_quest_watchers(quest_id,user_id) VALUES($1,$2)',[second.id,user]);
    await syncGameSeedCatalog(pool,catalog(true));
    const snapshot=await getGameSnapshot(pool,user!);
    const m=snapshot.missions.find(x=>x.id===mission)!;
    assert.equal(m.title,'Owner title');assert.equal(m.pitch,'Owner pitch');
    assert.deepEqual((m.sample as any).detail,{facts:['New fact']});
    const ss=m.stages as any[];assert.equal(ss[0].status,'approved');assert.equal(ss[1].status,'active');assert.equal(ss[1].plainWords,'Updated plain second');
    const ps=m.strategies as any[];assert.equal(ps[0].name,'Owner plan');assert.equal(ps[0].into,'Owner direction');assert.deepEqual(ps[0].howItWorks,['Step one']);
    const qs=m.quests as any[];const q2=qs.find(q=>q.seedKey==='second');
    assert.equal(q2.id,second.id);assert.equal(q2.title,'Owner task');assert.equal(q2.state,'claimed');assert.equal(q2.claimedBy,user);assert.equal(q2.coins,12);assert.equal(q2.brief.description,'Owner description');assert.equal(q2.detail.brief,'Updated second brief');assert.equal(q2.watched,true);
    assert.deepEqual(q2.dependencies,[first]);assert.equal(qs.some(q=>q.seedKey==='late'),false);
    assert.equal(qs.find(q=>q.seedKey==='new-a').stageId,stages[1].id);
    const links=await pool.query(`WITH RECURSIVE edges(from_id,to_id) AS (SELECT quest_id,depends_on_id FROM game_quest_dependencies), reach(origin,id) AS (SELECT from_id,to_id FROM edges UNION SELECT r.origin,e.to_id FROM reach r JOIN edges e ON e.from_id=r.id) SELECT 1 FROM reach WHERE origin=id AND origin IN (SELECT id FROM game_quests WHERE mission_id=$1) LIMIT 1`,[mission]);
    assert.equal(links.rowCount,0);
    const context=await runContext(pool,user!,'quest-draft',mission!,null,null);
    assert.equal((context.context?.stages as any[])[1].metadata.plainWords,'Updated plain second');
    assert.equal((context.context?.plans as any[])[0].metadata.catalog.rolesNeeded,'Maker');
    assert.equal((context.context?.quests as any[]).find(q=>q.id===second.id).brief.catalog.detail.brief,'Updated second brief');
    const fixtureRows=async()=>{
      const [missionRows,stageRows,planRows,questRows,dependencyRows]=await Promise.all([
        pool.query('SELECT id,title,pitch,sample,owner_id,stage_index FROM game_missions WHERE id=$1',[mission]),
        pool.query('SELECT id,ordinal,status,metadata FROM game_stages WHERE mission_id=$1 ORDER BY ordinal',[mission]),
        pool.query('SELECT id,stage_id,name,status,metadata FROM game_plans WHERE mission_id=$1 ORDER BY id',[mission]),
        pool.query('SELECT id,seed_key,stage_id,plan_id,title,state,claimed_by,reward_credits,brief FROM game_quests WHERE mission_id=$1 ORDER BY seed_key',[mission]),
        pool.query('SELECT d.quest_id,d.depends_on_id FROM game_quest_dependencies d JOIN game_quests q ON q.id=d.quest_id WHERE q.mission_id=$1 ORDER BY d.quest_id,d.depends_on_id',[mission]),
      ]);
      return [missionRows.rows,stageRows.rows,planRows.rows,questRows.rows,dependencyRows.rows];
    };
    const beforeRetry=await fixtureRows();
    await syncGameSeedCatalog(pool,catalog(true));
    assert.deepEqual(await fixtureRows(),beforeRetry);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM game_quests WHERE mission_id=$1',[mission])).rows[0].n,4);
  }finally{
    if(mission)await pool.query('DELETE FROM game_missions WHERE id=$1',[mission]);
    if(user)await pool.query('DELETE FROM users WHERE id=$1',[user]);
    await pool.end();
  }
});
