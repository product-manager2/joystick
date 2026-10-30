import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { syncGameSeedCatalog } from '../../server/game/seed.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');

test('seeded plans can aim ahead, and demo chats fill rooms only until a real person posts',async()=>{
  const pool=new pg.Pool({connectionString:databaseUrl});
  const key=`chats-${randomUUID()}`;let mission:string|undefined,user:string|undefined;
  const chats=[{room:'mission',from:'Ada · Lead',text:'First',minutesAgo:60},{room:'mission',from:'Bo · Maker',text:'Second',minutesAgo:5},{room:'fast',from:'Cy',text:'Squad hello',minutesAgo:30}];
  const catalog=(lines:typeof chats)=>[{id:key,title:'Chat test',pitch:'p',tag:'Community',glyph:'spark',color:'var(--tangerine)',rules:[],seedNotice:'Illustrative',
    stages:[{name:'One',goal:'g',target:1,unit:'x'},{name:'Two',goal:'g',target:1,unit:'x'},{name:'Three',goal:'g',target:1,unit:'x'}],
    strategies:[{id:'slow',name:'Step by step',squad:'Slow',bet:'b'},{id:'fast',name:'Straight to the end',squad:'Fast',bet:'b',aimsAt:3}],
    quests:[{id:'q1',title:'Step',role:'maker',size:'S',stage:1,strat:'slow'},{id:'q2',title:'Leap',role:'maker',size:'S',stage:3,strat:'fast'}],
    sample:{chats:lines}}];
  const messages=async(kind:string,scope:string)=>(await pool.query(`SELECT m.text,m.sender_label,m.sequence FROM messages m JOIN rooms r ON r.id=m.room_id WHERE r.kind=$1 AND r.scope_id=$2 ORDER BY m.sequence`,[kind,scope])).rows;
  try{
    await syncGameSeedCatalog(pool,catalog(chats));
    mission=(await pool.query('SELECT id FROM game_missions WHERE seed_key=$1',[key])).rows[0].id;
    const plans=Object.fromEntries((await pool.query('SELECT p.seed_key,p.id,s.ordinal FROM game_plans p JOIN game_stages s ON s.id=p.stage_id WHERE p.mission_id=$1',[mission])).rows.map(r=>[r.seed_key,r]));
    assert.equal(plans.slow.ordinal,0);assert.equal(plans.fast.ordinal,2);
    const leap=(await pool.query(`SELECT plan_id FROM game_quests WHERE mission_id=$1 AND seed_key='q2'`,[mission])).rows[0];
    assert.equal(leap.plan_id,plans.fast.id);

    assert.deepEqual((await messages('mission',mission!)).map(m=>[m.text,m.sender_label,Number(m.sequence)]),[['First','Ada · Lead',1],['Second','Bo · Maker',2]]);
    assert.deepEqual((await messages('plan',plans.fast.id)).map(m=>m.text),['Squad hello']);
    await syncGameSeedCatalog(pool,catalog(chats));
    assert.equal((await messages('mission',mission!)).length,2);

    // Once a real person has posted, the demo stops adding to that room.
    user=(await pool.query(`INSERT INTO users(name) VALUES('Real') RETURNING id`)).rows[0].id;
    const room=(await pool.query(`SELECT id FROM rooms WHERE kind='mission' AND scope_id=$1`,[mission])).rows[0].id;
    await pool.query(`UPDATE rooms SET next_sequence=next_sequence+1 WHERE id=$1`,[room]);
    await pool.query(`INSERT INTO messages(room_id,sequence,role,text,user_id) VALUES($1,3,'user','Hi all',$2)`,[room,user]);
    await syncGameSeedCatalog(pool,catalog([...chats,{room:'mission',from:'Late',text:'Too late',minutesAgo:1}]));
    assert.deepEqual((await messages('mission',mission!)).map(m=>m.text),['First','Second','Hi all']);
  }finally{
    if(mission){await pool.query(`DELETE FROM rooms WHERE scope_id=$1 OR scope_id IN (SELECT id FROM game_plans WHERE mission_id=$1)`,[mission]);await pool.query('DELETE FROM game_missions WHERE id=$1',[mission]);}
    if(user)await pool.query('DELETE FROM users WHERE id=$1',[user]);
    await pool.end();
  }
});
