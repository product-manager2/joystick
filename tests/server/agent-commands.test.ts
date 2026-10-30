import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import type { Config } from '../../server/config.js';
import { GAME_ACTIONS } from '../../contracts/game.js';
import { executeAgentCommand, listAgentCommands, queryAgentApp } from '../../server/agent-commands.js';
import { decideAgentRun } from '../../server/agent-runs/routes.js';

const config={} as Config;

test('Pip catalog includes every UI game command with payload guidance',()=>{
  const names=new Set(listAgentCommands().commands.map(c=>c.name));
  for(const action of GAME_ACTIONS){
    assert.ok(names.has(action),`Missing ${action}`);
    const entry=listAgentCommands().commands.find(c=>c.name===action)!;
    assert.ok(entry.description);
    assert.ok(entry.entityId);
  }
  assert.ok(names.has('chat.send'));
  assert.ok(names.has('agent_run.create'));
  const open=listAgentCommands().commands.find(c=>c.name==='ui.open')!;
  assert.match(open.entityId??'',/target item ID/);
  assert.match(open.payload??'',/strategy/);
  assert.match(listAgentCommands().commands.find(c=>c.name==='agent_run.create')?.payload??'',/quest-execute/);
});

test('a saved run decision replays after completion and rejects a different choice',async()=>{
  const databaseUrl=process.env.TEST_DATABASE_URL;
  if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
  const pool=new pg.Pool({connectionString:databaseUrl});
  const user=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Decision tester') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
  try{
    const run=(await pool.query("INSERT INTO agent_runs(user_id,request_id,request_hash,kind,status,prompt) VALUES($1,$2,'test','context-chat','completed','Choose') RETURNING id",[user.id,randomUUID()])).rows[0];
    const decision=(await pool.query("INSERT INTO agent_run_decisions(run_id,tool_use_id,prompt,options,selected_option_id,selected_at) VALUES($1,'tool-decision','Which?', $2,'brief',now()) RETURNING id",[run.id,JSON.stringify([{id:'brief',label:'Brief'},{id:'full',label:'Full'}])])).rows[0];
    const replay=await decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'brief',requestId:randomUUID()});
    assert.equal(replay.run.status,'completed');
    assert.equal(replay.decisions[0].selectedOptionId,'brief');
    await assert.rejects(()=>decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'full',requestId:randomUUID()}),{code:'decision_conflict'});
  }finally{await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await pool.end();}
});

test('a waiting question can be answered in the person\'s own words',async()=>{
  const databaseUrl=process.env.TEST_DATABASE_URL;
  if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
  const pool=new pg.Pool({connectionString:databaseUrl});
  const user=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Own words tester') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
  try{
    const run=(await pool.query("INSERT INTO agent_runs(user_id,request_id,request_hash,kind,status,prompt) VALUES($1,$2,'test','context-chat','needs_input','Choose') RETURNING id",[user.id,randomUUID()])).rows[0];
    const decision=(await pool.query("INSERT INTO agent_run_decisions(run_id,tool_use_id,prompt,options) VALUES($1,'tool-own','Which problem?',$2) RETURNING id",[run.id,JSON.stringify([{id:'notes',label:'Clinics lose notes'},{id:'queues',label:'Long queues'}])])).rows[0];
    await assert.rejects(()=>decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'own_words',answer:'   ',requestId:randomUUID()}),{code:'invalid_input'});
    const detail=await decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'own_words',answer:' Rural pharmacies run out of insulin ',requestId:randomUUID()});
    assert.equal(detail.run.status,'running');
    assert.equal(detail.decisions[0].selectedOptionId,'own_words');
    assert.equal(detail.decisions[0].answer,'Rural pharmacies run out of insulin');
    await decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'own_words',answer:'Rural pharmacies run out of insulin',requestId:randomUUID()});
    await assert.rejects(()=>decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'own_words',answer:'Something else',requestId:randomUUID()}),{code:'decision_conflict'});
    await assert.rejects(()=>decideAgentRun(pool,user.id,run.id,{decisionId:decision.id,optionId:'notes',requestId:randomUUID()}),{code:'decision_conflict'});
  }finally{await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await pool.end();}
});

test('Pip game commands share durable replay and actor authorization',async()=>{
  const databaseUrl=process.env.TEST_DATABASE_URL;
  if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
  const pool=new pg.Pool({connectionString:databaseUrl});
  const users:string[]=[],missions:string[]=[];
  try{
    for(const name of ['Pip owner','Pip outsider']){
      const user=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);
      users.push(user.rows[0].id);
    }
    const requestId=randomUUID();
    const input={command:'mission.create',payload:{title:'Pip command test',stages:[{name:'Start',target:1}]}};
    const created=await executeAgentCommand(pool,config,users[0],input,requestId);
    const missionId=(created.data as {entityId:string}).entityId;
    missions.push(missionId);
    assert.match(missionId,/^[0-9a-f-]{36}$/);
    const replay=await executeAgentCommand(pool,config,users[0],input,requestId);
    assert.deepEqual(replay.data,created.data);
    const count=await pool.query('SELECT count(*)::int AS n FROM game_missions WHERE id=$1',[missionId]);
    assert.equal(count.rows[0].n,1);
    await assert.rejects(()=>executeAgentCommand(pool,config,users[0],{command:'mission.create',payload:{title:'Different',stages:[{name:'Start'}]}},requestId),/different action/);
    const stageId=((await queryAgentApp(pool,users[0],{view:'mission',entityId:missionId})) as {stages:Array<{id:string}>}).stages[0].id;
    const opened=await executeAgentCommand(pool,config,users[0],{command:'ui.open',entityId:missionId,payload:{screen:'mission'}},randomUUID());
    assert.deepEqual(opened.handoff,{type:'navigate',screen:'mission',entityId:missionId});
    await assert.rejects(()=>executeAgentCommand(pool,config,users[0],{command:'ui.open',entityId:randomUUID(),payload:{screen:'mission'}},randomUUID()),/Item not found/);
    await assert.rejects(()=>executeAgentCommand(pool,config,users[0],{command:'ui.open',entityId:missionId,payload:{screen:'mission',entityId:randomUUID()}},randomUUID()),/Conflicting screen item IDs/);
    await assert.rejects(()=>executeAgentCommand(pool,config,users[0],{command:'ui.open',payload:{screen:'invented'}},randomUUID()),/Unknown screen/);
    await assert.rejects(()=>executeAgentCommand(pool,config,users[1],{command:'stage.create',entityId:missionId,payload:{name:'Intrusion'}},randomUUID()),/Join this mission/);
    const stage=await queryAgentApp(pool,users[0],{view:'stage',entityId:stageId}) as {stage:{id:string};missionId:string};
    assert.equal(stage.stage.id,stageId);
    assert.equal(stage.missionId,missionId);
    await assert.rejects(()=>queryAgentApp(pool,users[1],{view:'messages',entityId:randomUUID()}),/Room not found/);
  }finally{
    for(const id of missions)await pool.query('DELETE FROM game_missions WHERE id=$1',[id]);
    for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);
    await pool.end();
  }
});
