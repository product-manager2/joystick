import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { Pool } from '../../server/db.js';
import type { Config } from '../../server/config.js';
import { ApiError } from '../../server/auth.js';
import { registerAgentRunRoutes } from '../../server/agent-runs/routes.js';

const user='11111111-1111-4111-8111-111111111111';
const runId='22222222-2222-4222-8222-222222222222';
const requestId='33333333-3333-4333-8333-333333333333';
const decisionId='44444444-4444-4444-8444-444444444444';
const missionId='55555555-5555-4555-8555-555555555555';
const rows=(data:Record<string,unknown>[])=>({rowCount:data.length,rows:data});
const config={anthropicApiKey:'fake',anthropicAgentId:'chat',anthropicWorkflowAgentId:'workflow',anthropicEnvironmentId:'environment'} as Config;
const run={id:runId,user_id:user,kind:'quest-execute',status:'running',mission_id:missionId,plan_id:null,quest_id:null,room_id:null,prompt:'Private request',response:'Private result',error:null,created_at:'2026-01-01',updated_at:'2026-01-02'};
async function appFor(pool:Pool){
  const app=Fastify();await app.register(cookie);registerAgentRunRoutes(app,pool,config);
  app.setErrorHandler((error,_request,reply)=>{const issue=error instanceof ApiError?error:null;reply.code(issue?.statusCode??500).send({error:{code:issue?.code??'internal_error'}});});
  return app;
}
const auth=(sql:string)=>sql.includes('FROM sessions s JOIN users u');

test('concurrent request ID winner with a different payload returns conflict',async()=>{
  let checked=false;
  const query=async(sql:string)=>{
    if(auth(sql))return rows([{id:user,email:'a@example.test',name:'A'}]);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT id,request_hash FROM agent_runs')){if(!checked){checked=true;return rows([]);}return rows([{id:runId,request_hash:'different'}]);}
    if(sql.startsWith('SELECT r.id FROM rooms'))return rows([]);
    if(sql.startsWith('SELECT id FROM users'))return rows([{id:user}]);
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const app=await appFor(pool);
  try{
    const response=await app.inject({method:'POST',url:'/api/v1/agent/runs',headers:{cookie:'joystick_session=token'},payload:{requestId,kind:'mission-draft',prompt:'Create a useful mission'}});
    assert.equal(response.statusCode,409);assert.equal(response.json().error.code,'idempotency_conflict');
  }finally{await app.close();}
});

test('revoked member cannot read run outputs but can still stop their own run',async()=>{
  let outputQueried=false;
  const query=async(sql:string)=>{
    if(auth(sql))return rows([{id:user,email:'a@example.test',name:'A'}]);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT * FROM agent_runs WHERE id='))return rows([run]);
    if(sql.startsWith('SELECT 1 FROM game_memberships'))return rows([]);
    if(sql.startsWith('SELECT id,kind,data')||sql.startsWith('SELECT id,title,content')){outputQueried=true;return rows([]);}
    if(sql.startsWith('UPDATE agent_runs SET status='))return rows([{...run,status:'cancelled'}]);
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const app=await appFor(pool);
  try{
    const read=await app.inject({method:'GET',url:`/api/v1/agent/runs/${runId}`,headers:{cookie:'joystick_session=token'}});
    assert.equal(read.statusCode,403);assert.equal(outputQueried,false);
    const cancel=await app.inject({method:'POST',url:`/api/v1/agent/runs/${runId}/cancel`,headers:{cookie:'joystick_session=token'},payload:{requestId}});
    assert.equal(cancel.statusCode,200);assert.deepEqual(cancel.json().run,{id:runId,status:'cancelled',updatedAt:'2026-01-02'});
    assert.equal(JSON.stringify(cancel.json()).includes('Private result'),false);
  }finally{await app.close();}
});

test('a locked decision returns conflict when another option already won',async()=>{
  const query=async(sql:string)=>{
    if(auth(sql))return rows([{id:user,email:'a@example.test',name:'A'}]);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.startsWith('SELECT * FROM agent_runs WHERE id='))return rows([{...run,mission_id:null,status:'needs_input'}]);
    if(sql.startsWith('SELECT id,options,selected_option_id'))return rows([{id:decisionId,options:[{id:'first'},{id:'second'}],selected_option_id:'first'}]);
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  const app=await appFor(pool);
  try{
    const response=await app.inject({method:'POST',url:`/api/v1/agent/runs/${runId}/decisions`,headers:{cookie:'joystick_session=token'},payload:{decisionId,optionId:'second',requestId}});
    assert.equal(response.statusCode,409);assert.equal(response.json().error.code,'decision_conflict');
  }finally{await app.close();}
});

test('run history uses a membership-scoped query and exposes saved work after reload',async()=>{
  let scoped=false;
  const pool={query:async(sql:string)=>{
    if(auth(sql))return rows([{id:user,email:'a@example.test',name:'A'}]);
    if(sql.startsWith('SELECT r.* FROM agent_runs r')){scoped=sql.includes('EXISTS(SELECT 1 FROM game_memberships');return rows([run]);}
    throw Error(`Unexpected query: ${sql}`);
  }} as unknown as Pool;
  const app=await appFor(pool);
  try{
    const response=await app.inject({method:'GET',url:`/api/v1/agent/runs?missionId=${missionId}`,headers:{cookie:'joystick_session=token'}});
    assert.equal(response.statusCode,200);assert.equal(scoped,true);
    assert.equal(response.json().runs[0].id,runId);
  }finally{await app.close();}
});
