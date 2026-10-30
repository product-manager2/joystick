import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { syncGameSeedCatalog, type CatalogHistory } from '../../server/game/seed.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('catalog upgrade rewrites untouched seeded rows and leaves played or edited ones alone',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const key=`upgrade-${randomUUID()}`;
  let user:string|undefined,mission:string|undefined;
  const base={id:key,tag:'Community',glyph:'spark',color:'var(--blue)',seedNotice:'Illustrative only',sample:{}};
  // The first catalog: every quest and plan lived in stage 1.
  const oldCatalog=[{...base,title:'Old title',pitch:'Old pitch',rules:['Old rule'],
    stages:[{name:'One',goal:'Old goal',target:10,unit:'results'},{name:'Two',goal:'Old second goal',target:1,unit:'results'}],
    strategies:[{id:'plan',name:'Old plan',squad:'Crew',bet:'Old bet'}],
    quests:[
      {id:'q1',title:'Old q1',role:'storyteller',size:'S',stage:1,strat:'plan'},
      {id:'q2',title:'Old q2',role:'maker',size:'S',stage:1,strat:null},
      {id:'q3',title:'Old q3',role:'maker',size:'S',stage:1,strat:'plan'},
      {id:'q4',title:'Old q4',role:'checker',size:'S',stage:1,strat:'plan'},
    ]}];
  const history:CatalogHistory={[key]:{
    mission:{title:['Old title'],pitch:['Old pitch'],rules:[['Old rule']]},
    stages:{'0':{name:['One'],goal:['Old goal'],target:[10],unit:['results']},'1':{name:['Two'],goal:['Old second goal'],target:[1],unit:['results']}},
    plans:{plan:{name:['Old plan'],squad:['Crew'],bet:['Old bet']}},
    quests:Object.fromEntries(oldCatalog[0].quests.map(q=>[q.id,{title:[q.title],role:[q.role],size:[q.size],stage:[1]}])),
  }};
  const newCatalog=[{...base,title:'New title',pitch:'New pitch',rules:['New rule'],
    stages:[{name:'One',goal:'New goal',target:5,unit:'results'},{name:'Two',goal:'New second goal',target:3,unit:'results'}],
    strategies:[{id:'plan',name:'New plan',squad:'Crew',bet:'New bet'}],
    quests:[
      {id:'q1',title:'New q1',role:'champion',size:'M',stage:2,strat:'plan'},
      {id:'q2',title:'New q2',role:'maker',size:'S',stage:2,strat:null},
      {id:'q3',title:'New q3',role:'maker',size:'S',stage:2,strat:'plan'},
      {id:'q4',title:'New q4',role:'checker',size:'S',stage:2,strat:'plan',dependsOn:['q1']},
      {id:'q5',title:'Brand new',role:'user',size:'S',stage:2,strat:'plan',dependsOn:['q4']},
    ]}];
  const rows=async()=>(await pool.query(`SELECT q.seed_key,q.title,q.role,q.size,q.xp,q.plan_id,s.ordinal FROM game_quests q JOIN game_stages s ON s.id=q.stage_id WHERE q.mission_id=$1 ORDER BY q.seed_key`,[mission])).rows;
  try{
    await syncGameSeedCatalog(pool,oldCatalog);
    mission=(await pool.query('SELECT id FROM game_missions WHERE seed_key=$1',[key])).rows[0].id;
    user=(await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,'Player'])).rows[0].id;
    await pool.query('INSERT INTO game_memberships(mission_id,user_id,role) VALUES($1,$2,$3)',[mission,user,'member']);
    // Real activity on the live database: someone claimed q2, an owner edited q3 and stage two.
    await pool.query(`UPDATE game_quests SET state='claimed',claimed_by=$2,claimed_at=now(),version=version+1 WHERE mission_id=$1 AND seed_key='q2'`,[mission,user]);
    await pool.query(`UPDATE game_quests SET title='Owner q3',version=version+1 WHERE mission_id=$1 AND seed_key='q3'`,[mission]);
    await pool.query(`UPDATE game_stages SET goal='Owner second goal',version=version+1 WHERE mission_id=$1 AND ordinal=1`,[mission]);

    await syncGameSeedCatalog(pool,newCatalog,history);

    const m=(await pool.query('SELECT title,pitch,rules FROM game_missions WHERE id=$1',[mission])).rows[0];
    assert.deepEqual(m,{title:'New title',pitch:'New pitch',rules:['New rule']});
    const stages=(await pool.query('SELECT id,goal,target FROM game_stages WHERE mission_id=$1 ORDER BY ordinal',[mission])).rows;
    assert.equal(stages[0].goal,'New goal');assert.equal(stages[0].target,5);
    assert.equal(stages[1].goal,'Owner second goal');assert.equal(stages[1].target,1);
    const plan=(await pool.query('SELECT id,name,bet,stage_id FROM game_plans WHERE mission_id=$1',[mission])).rows[0];
    assert.equal(plan.name,'New plan');assert.equal(plan.bet,'New bet');
    // q3 was edited, so the plan keeps its stage rather than strand that work.
    assert.equal(plan.stage_id,stages[0].id);
    const q=Object.fromEntries((await rows()).map(r=>[r.seed_key,r]));
    assert.deepEqual([q.q1.title,q.q1.role,q.q1.size,q.q1.xp,q.q1.ordinal,q.q1.plan_id],['New q1','champion','M',280,1,null]);
    assert.deepEqual([q.q2.title,q.q2.ordinal],['Old q2',0]);
    assert.deepEqual([q.q3.title,q.q3.ordinal,q.q3.plan_id],['Owner q3',0,plan.id]);
    assert.deepEqual([q.q4.title,q.q4.ordinal],['New q4',1]);
    assert.equal(q.q5.ordinal,1);
    const deps=(await pool.query(`SELECT a.seed_key AS quest,b.seed_key AS needs FROM game_quest_dependencies d JOIN game_quests a ON a.id=d.quest_id JOIN game_quests b ON b.id=d.depends_on_id WHERE a.mission_id=$1 ORDER BY 1`,[mission])).rows;
    assert.deepEqual(deps,[{quest:'q4',needs:'q1'},{quest:'q5',needs:'q4'}]);

    // Running again changes nothing.
    const before=await rows();
    const revision=(await pool.query('SELECT revision FROM game_revision')).rows[0].revision;
    await syncGameSeedCatalog(pool,newCatalog,history);
    assert.deepEqual(await rows(),before);
    assert.equal((await pool.query('SELECT revision FROM game_revision')).rows[0].revision,revision);
  }finally{
    if(mission)await pool.query('DELETE FROM game_missions WHERE id=$1',[mission]);
    if(user)await pool.query('DELETE FROM users WHERE id=$1',[user]);
    await pool.end();
  }
});
