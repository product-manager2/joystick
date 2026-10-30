import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from '../../server/db.js';
import { executeTool, reconcileRun, startNextRun, type RunEvent, type RunProvider } from '../../server/agent-runs/worker.js';
import type { Config } from '../../server/config.js';

const runId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const run={id:runId,user_id:userId,kind:'context-chat',mission_id:null,plan_id:null,quest_id:null,prompt:'Summarize',status:'running',provider_session_id:'sess_test',room_id:null};
const tool={type:'agent.custom_tool_use',id:'sevt_tool_1',name:'complete_run',input:{summary:'A usable summary'}};
const idle={type:'session.status_idle',id:'sevt_idle_1',stop_reason:{type:'end_turn'}};
const result={type:'user.custom_tool_result',id:'sevt_result_1',custom_tool_use_id:tool.id};
const rows=(data:Record<string,unknown>[])=>({rowCount:data.length,rows:data});

test('new workflow sessions use the current system prompt and the saved agent name',async()=>{
  const job={...run,status:'queued',provider_session_id:null};
  let created=false;
  const query=async(sql:string)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT pg_advisory_xact_lock'))return rows([]);
    if(sql.startsWith('SELECT count(*)::int AS total FROM agent_runs'))return rows([{total:0}]);
    if(sql.includes("FROM agent_runs WHERE status='queued'"))return rows([job]);
    if(sql.startsWith('SELECT agent_name FROM game_profiles'))return rows([{agent_name:'Nova'}]);
    if(sql.startsWith('SELECT pg_notify')||sql.startsWith('UPDATE agent_runs'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const provider:RunProvider={
    create:async input=>{created=true;assert.equal(typeof input.agent,'object');if(typeof input.agent==='object'){
      assert.equal(input.agent.id,'agent_test');assert.equal(input.agent.type,'agent_with_overrides');assert.match(input.agent.system,/agent name supplied in the request context/);
    }assert.match(input.initial_events[0].content[0].text,/Your agent name: "Nova"/);return{id:'sess_new'};},
    list:async function*(){},sendTool:async()=>{},interrupt:async()=>{},status:async()=> 'idle',
  };
  const config={anthropicWorkflowAgentId:'agent_test',anthropicEnvironmentId:'env_test'} as Config;
  assert.equal(await startNextRun(pool,config,provider),true);
  assert.equal(created,true);
});

test('custom tool result is sent once and completion waits for provider acknowledgement',async()=>{
  let receipt:{result:unknown;is_error:boolean;send_state:string}|null=null;
  let status='running',response:string|null=null,sendCount=0,history:RunEvent[]=[tool,idle];
  const pool={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.startsWith('SELECT status FROM agent_runs'))return rows([{status}]);
    if(sql.startsWith('SELECT result,is_error,send_state FROM agent_run_tool_receipts'))return rows(receipt?[receipt]:[]);
    if(sql.startsWith('INSERT INTO agent_run_tool_receipts')){receipt={result:JSON.parse(String(args[3])),is_error:Boolean(args[4]),send_state:'pending'};return rows([]);}
    if(sql.includes("SET send_state='sending'")){receipt!.send_state='sending';return rows([]);}
    if(sql.includes("SET send_state='sent'")){receipt!.send_state='sent';return rows([]);}
    if(sql.startsWith('UPDATE agent_runs SET response=')){response=String(args[1]);return rows([]);}
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows([]);
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows(receipt&&receipt.send_state!=='sent'?[{one:1}]:[]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows([]);
    if(sql.includes("SET status='completed'")){status='completed';response??=String(args[1]);return rows([]);}
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={
    create:async()=>({id:'sess_test'}),
    list:async function*(){for(const event of history)yield event;},
    sendTool:async()=>{sendCount++;},
    interrupt:async()=>{},
    status:async()=> 'idle',
  };
  await reconcileRun(pool,provider,run);
  assert.equal(sendCount,1);
  assert.equal(status,'running');
  assert.equal(response,'A usable summary');
  history=[tool,result,idle];
  await reconcileRun(pool,provider,run);
  assert.equal(sendCount,1);
  assert.equal(status,'completed');
});

test('a requested decision pauses, then resumes only with the selected option',async()=>{
  const ask:RunEvent={type:'agent.custom_tool_use',id:'sevt_ask_1',name:'request_decision',input:{prompt:'Which format?',options:[{id:'brief',label:'Brief'},{id:'full',label:'Full'}]}};
  let status='running',selected:string|null=null,resultSent=false,receipt:{result:unknown;is_error:boolean;send_state:string}|null=null;
  const sent:unknown[]=[];
  const pool={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.startsWith('SELECT status FROM agent_runs'))return rows([{status}]);
    if(sql.startsWith('SELECT result,is_error,send_state FROM agent_run_tool_receipts'))return rows(receipt?[receipt]:[]);
    if(sql.startsWith('INSERT INTO agent_run_decisions'))return rows([{id:'decision_1'}]);
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows(resultSent?[]:[{id:'decision_1',tool_use_id:ask.id,selected_option_id:selected,result_sent_at:null}]);
    if(sql.startsWith('SELECT send_state FROM agent_run_tool_receipts'))return rows(receipt?[{send_state:receipt.send_state}]:[]);
    if(sql.startsWith('INSERT INTO agent_run_tool_receipts')){receipt={result:JSON.parse(String(args[3])),is_error:false,send_state:'pending'};return rows([]);}
    if(sql.includes("SET send_state='sending'")){receipt!.send_state='sending';return rows([]);}
    if(sql.includes("SET send_state='sent'")){receipt!.send_state='sent';return rows([]);}
    if(sql.startsWith('UPDATE agent_run_decisions SET result_sent_at')){resultSent=true;return rows([]);}
    if(sql.includes("SET status='needs_input'")){if(status==='running')status='needs_input';return rows([]);}
    if(sql.includes("SET status='running'")){if(status==='needs_input')status='running';return rows([]);}
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows(receipt&&receipt.send_state!=='sent'?[{one:1}]:[]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows(selected?[]:[{one:1}]);
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){yield ask;yield {type:'session.status_idle',id:'idle',stop_reason:{type:'requires_action',event_ids:[ask.id]}};},sendTool:async(_id,_toolId,value)=>{sent.push(value);},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(status,'needs_input');assert.deepEqual(sent,[]);
  selected='full';
  await reconcileRun(pool,provider,run);
  assert.equal(status,'running');assert.deepEqual(sent,[{selectedOptionId:'full'}]);
  await reconcileRun(pool,provider,run);
  assert.equal(sent.length,1);
});

test('a typed answer reaches the agent with the question\'s result',async()=>{
  const ask:RunEvent={type:'agent.custom_tool_use',id:'sevt_ask_1',name:'request_decision',input:{prompt:'Which format?',options:[{id:'brief',label:'Brief'},{id:'full',label:'Full'}]}};
  let status='running',selected:string|null=null,resultSent=false,receipt:{result:unknown;is_error:boolean;send_state:string}|null=null;
  const sent:unknown[]=[];
  const pool={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.startsWith('SELECT status FROM agent_runs'))return rows([{status}]);
    if(sql.startsWith('SELECT result,is_error,send_state FROM agent_run_tool_receipts'))return rows(receipt?[receipt]:[]);
    if(sql.startsWith('INSERT INTO agent_run_decisions'))return rows([{id:'decision_1'}]);
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows(resultSent?[]:[{id:'decision_1',tool_use_id:ask.id,selected_option_id:selected,answer_text:selected?'Rural pharmacies':null,result_sent_at:null}]);
    if(sql.startsWith('SELECT send_state FROM agent_run_tool_receipts'))return rows(receipt?[{send_state:receipt.send_state}]:[]);
    if(sql.startsWith('INSERT INTO agent_run_tool_receipts')){receipt={result:JSON.parse(String(args[3])),is_error:false,send_state:'pending'};return rows([]);}
    if(sql.includes("SET send_state='sending'")){receipt!.send_state='sending';return rows([]);}
    if(sql.includes("SET send_state='sent'")){receipt!.send_state='sent';return rows([]);}
    if(sql.startsWith('UPDATE agent_run_decisions SET result_sent_at')){resultSent=true;return rows([]);}
    if(sql.includes("SET status='needs_input'")){if(status==='running')status='needs_input';return rows([]);}
    if(sql.includes("SET status='running'")){if(status==='needs_input')status='running';return rows([]);}
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows(receipt&&receipt.send_state!=='sent'?[{one:1}]:[]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows(selected?[]:[{one:1}]);
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){yield ask;yield {type:'session.status_idle',id:'idle',stop_reason:{type:'requires_action',event_ids:[ask.id]}};},sendTool:async(_id,_toolId,value)=>{sent.push(value);},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(status,'needs_input');assert.deepEqual(sent,[]);
  selected='own_words';
  await reconcileRun(pool,provider,run);
  assert.equal(status,'running');assert.deepEqual(sent,[{selectedOptionId:'own_words',answerInOwnWords:'Rural pharmacies'}]);
  await reconcileRun(pool,provider,run);
  assert.equal(sent.length,1);
});

test('an acknowledged custom tool result can precede the next decision in provider history',async()=>{
  const context:RunEvent={type:'agent.custom_tool_use',id:'sevt_context',name:'get_context',input:{}};
  const ack:RunEvent={type:'user.custom_tool_result',id:'sevt_context_ack',custom_tool_use_id:context.id};
  const oldIdle:RunEvent={type:'session.status_idle',id:'sevt_old_idle',stop_reason:{type:'requires_action',event_ids:[context.id]}};
  const decision:RunEvent={type:'agent.custom_tool_use',id:'sevt_decision',name:'request_decision',input:{prompt:'Which goal?',options:[{id:'local',label:'Local community'},{id:'global',label:'Global community'}]}};
  const newIdle:RunEvent={type:'session.status_idle',id:'sevt_new_idle',stop_reason:{type:'requires_action',event_ids:[decision.id]}};
  let history:RunEvent[]=[context,oldIdle],status='running',sent=0,decisionWrites=0;
  const receipts=new Map<string,{result:unknown;is_error:boolean;send_state:string}>();
  const pool={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.startsWith('SELECT status FROM agent_runs'))return rows([{status}]);
    if(sql.startsWith('SELECT result,is_error,send_state FROM agent_run_tool_receipts')){const receipt=receipts.get(String(args[1]));return rows(receipt?[receipt]:[]);}
    if(sql.startsWith('INSERT INTO agent_run_tool_receipts')){receipts.set(String(args[1]),{result:JSON.parse(String(args[3])),is_error:Boolean(args[4]),send_state:'pending'});return rows([]);}
    if(sql.includes("SET send_state='sending'")){receipts.get(String(args[1]))!.send_state='sending';return rows([]);}
    if(sql.includes("SET send_state='sent'")){receipts.get(String(args[1]))!.send_state='sent';return rows([]);}
    if(sql.startsWith('INSERT INTO agent_run_decisions')){decisionWrites=1;return rows([{id:'decision_saved'}]);}
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows(decisionWrites?[{id:'decision_saved',tool_use_id:decision.id,selected_option_id:null,result_sent_at:null}]:[]);
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows([...receipts.values()].some(r=>r.send_state!=='sent')?[{one:1}]:[]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows(decisionWrites?[{one:1}]:[]);
    if(sql.includes("SET status='needs_input'")){status='needs_input';return rows([]);}
    if(sql.includes("SET status='failed'")){status='failed';return rows([]);}
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){for(const event of history)yield event;},sendTool:async()=>{sent++;},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(status,'running');assert.equal(sent,1);
  history=[context,oldIdle,ack];
  await reconcileRun(pool,provider,run);
  assert.equal(status,'running');assert.equal(sent,1);
  history=[context,oldIdle,ack,decision,newIdle];
  await reconcileRun(pool,provider,run);
  assert.equal(status,'needs_input');assert.equal(decisionWrites,1);assert.equal(sent,1);
  await reconcileRun(pool,provider,{...run,status:'needs_input'});
  assert.equal(decisionWrites,1);assert.equal(sent,1);
});

test('only a positively identified unsupported blocker fails a managed run',async()=>{
  const native:RunEvent={type:'agent.tool_use',id:'sevt_native'};
  const history:RunEvent[]=[native,{type:'session.status_idle',id:'sevt_idle',stop_reason:{type:'requires_action',event_ids:[native.id]}}];
  let status='running';
  const pool={query:async(sql:string)=>{
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows([]);
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows([]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows([]);
    if(sql.includes("SET status='failed'")){status='failed';return rows([]);}
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){for(const event of history)yield event;},sendTool:async()=>{},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(status,'failed');
});

test('an old end-turn idle does not complete a newer running turn',async()=>{
  const history:RunEvent[]=[{type:'agent.message',id:'msg',content:[{type:'text',text:'Earlier answer'}]},{type:'session.status_idle',id:'old_end',stop_reason:{type:'end_turn'}},{type:'session.status_running',id:'new_running'}];
  let completed=false;
  const pool={query:async(sql:string)=>{
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows([]);
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows([]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows([]);
    if(sql.includes("SET status='completed'")){completed=true;return rows([]);}
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){for(const event of history)yield event;},sendTool:async()=>{},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(completed,false);
});

test('usage telemetry after end-turn does not hold a completed run open',async()=>{
  const history:RunEvent[]=[{type:'agent.message',id:'msg',content:[{type:'text',text:'Final answer'}]},{type:'session.status_idle',id:'end',stop_reason:{type:'end_turn'}},{type:'session.usage',id:'usage'}];
  let completed=false;
  const pool={query:async(sql:string)=>{
    if(sql.startsWith('SELECT id,tool_use_id,selected_option_id'))return rows([]);
    if(sql.includes("send_state IN ('pending','sending','uncertain')"))return rows([]);
    if(sql.startsWith('SELECT 1 FROM agent_run_decisions'))return rows([]);
    if(sql.includes("SET status='completed'")){completed=true;return rows([]);}
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const provider:RunProvider={create:async()=>({id:'sess_test'}),list:async function*(){for(const event of history)yield event;},sendTool:async()=>{},interrupt:async()=>{},status:async()=> 'idle'};
  await reconcileRun(pool,provider,run);
  assert.equal(completed,true);
});

test('a revoked mission membership prevents provider session creation',async()=>{
  const mission='33333333-3333-4333-8333-333333333333';
  let providerCalls=0,finalStatus='queued';
  const job={...run,kind:'plan-draft',mission_id:mission,provider_session_id:null,status:'queued'};
  const query=async(sql:string)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT pg_advisory_xact_lock'))return rows([]);
    if(sql.startsWith('SELECT count(*)::int AS total FROM agent_runs'))return rows([{total:0}]);
    if(sql.includes("FROM agent_runs WHERE status='queued'"))return rows([job]);
    if(sql.includes("SET status='starting'")){finalStatus='starting';return rows([]);}
    if(sql.includes('FROM game_missions'))return rows([{id:mission,title:'Private mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([]);
    if(sql.includes('UPDATE agent_runs SET status=$2')){finalStatus='failed';return rows([]);}
    if(sql.startsWith('SELECT pg_notify'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const provider:RunProvider={create:async()=>{providerCalls++;return {id:'unexpected'};},list:async function*(){},sendTool:async()=>{},interrupt:async()=>{},status:async()=> 'idle'};
  const config={anthropicWorkflowAgentId:'agent_test',anthropicEnvironmentId:'env_test'} as Config;
  assert.equal(await startNextRun(pool,config,provider),true);
  assert.equal(providerCalls,0);
  assert.equal(finalStatus,'failed');
});

test('artifact save rejects a claim released before the atomic insert',async()=>{
  const mission='33333333-3333-4333-8333-333333333333',quest='44444444-4444-4444-8444-444444444444',stage='55555555-5555-4555-8555-555555555555';
  const job={...run,kind:'quest-execute',mission_id:mission,quest_id:quest};
  let inserted=false,lockedQuest=false;
  const query=async(sql:string)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT status FROM agent_runs'))return rows([{status:'running'}]);
    if(sql.includes('FROM game_quests WHERE id=')&&!sql.includes('FOR UPDATE'))return rows([{id:quest,mission_id:mission,stage_id:stage,plan_id:null,title:'Quest',state:'claimed',claimed_by:job.user_id,brief:{}}]);
    if(sql.includes('FROM game_missions'))return rows([{id:mission,title:'Mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([{one:1}]);
    if(sql.includes('FROM game_stages WHERE mission_id='))return rows([{id:stage,status:'active'}]);
    if(sql.includes('FROM game_plans WHERE mission_id='))return rows([]);
    if(sql.includes('FROM game_quests WHERE mission_id='))return rows([]);
    if(sql.includes('FROM game_artifacts'))return rows([]);
    if(sql.includes('FROM game_quests WHERE id=')&&sql.includes('FOR UPDATE')){lockedQuest=true;return rows([{mission_id:mission,stage_id:stage,claimed_by:null,state:'open'}]);}
    if(sql.startsWith('INSERT INTO agent_run_artifacts')){inserted=true;return rows([]);}
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const result=await executeTool(pool,job,{type:'agent.custom_tool_use',id:'sevt_save',name:'save_artifact',input:{title:'Deliverable',content:'Real work'}});
  assert.equal(lockedQuest,true);assert.equal(inserted,false);assert.equal(result.isError,true);
  assert.match(JSON.stringify(result.result),/Quest claim was revoked/);
});
