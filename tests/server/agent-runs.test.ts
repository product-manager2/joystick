import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from '../../server/db.js';
import { runContext, getRunDetail } from '../../server/agent-runs/routes.js';

const user='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const mission='33333333-3333-4333-8333-333333333333';
const quest='44444444-4444-4444-8444-444444444444';
const stage='55555555-5555-4555-8555-555555555555';
const rows=(data:Record<string,unknown>[])=>({rowCount:data.length,rows:data});
const mockPool=(query:(sql:string,args:unknown[])=>Promise<ReturnType<typeof rows>>)=>({query,connect:async()=>({query,release:()=>{}})}) as unknown as Pool;

test('quest execution refuses a revoked claim before any provider work',async()=>{
  const queries:string[]=[];
  const pool=mockPool(async(sql:string,args:unknown[])=>{
    queries.push(sql);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.includes('FROM game_quests WHERE id='))return rows([{id:quest,mission_id:mission,stage_id:stage,plan_id:null,title:'Work',state:'claimed',claimed_by:other,brief:{}}]);
    if(sql.includes('FROM game_missions WHERE id='))return rows([{id:mission,title:'Mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([{one:1}]);
    throw Error(`Unexpected query: ${sql}`);
  });
  await assert.rejects(runContext(pool,user,'quest-execute',null,null,quest),{code:'quest_unavailable'});
  assert.equal(queries.some(q=>q.includes('FROM game_stages')),false);
});

test('mission context stays behind current membership',async()=>{
  const pool=mockPool(async(sql:string)=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.includes('FROM game_missions'))return rows([{id:mission,title:'Private mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([]);
    throw Error('No context queries should run after membership fails');
  });
  await assert.rejects(runContext(pool,user,'plan-draft',mission,null,null),{code:'not_member'});
});

test('authorized quest context contains latest submission, review feedback and decision',async()=>{
  const queries:string[]=[];
  const pool=mockPool(async(sql:string)=>{
    queries.push(sql);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.includes('FROM game_quests WHERE id='))return rows([{id:quest,mission_id:mission,stage_id:stage,plan_id:null,title:'Work',state:'changes_requested',claimed_by:user,brief:{},decision:{choice:'Use accessible copy'}}]);
    if(sql.includes('FROM game_missions'))return rows([{id:mission,title:'Mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([{one:1}]);
    if(sql.includes('FROM game_stages'))return rows([{id:stage,status:'active'}]);
    if(sql.includes('FROM game_plans'))return rows([]);
    if(sql.includes('FROM game_quests WHERE mission_id='))return rows([]);
    if(sql.includes('FROM game_artifacts'))return rows([{id:other,version:2,title:'Draft',content:Buffer.from('Revision text'),created_at:'today'}]);
    if(sql.includes('FROM game_reviews'))return rows([{verdict:'changes_requested',note:'Fix contrast',reviewer_name:'Reviewer',created_at:'today'}]);
    throw Error(`Unexpected query: ${sql}`);
  });
  const result=await runContext(pool,user,'quest-execute',null,null,quest);
  assert.deepEqual(result.context?.selectedQuest?.decision,{choice:'Use accessible copy'});
  assert.equal(result.context?.latestSubmission?.content,'Revision text');
  assert.equal(result.context?.latestSubmission?.reviews[0].note,'Fix contrast');
  assert.ok(queries.find(q=>q.includes('FROM game_memberships')&&q.includes('FOR SHARE')));
});

test('revoked member cannot read submission or review feedback',async()=>{
  const queries:string[]=[];
  const pool=mockPool(async(sql:string)=>{
    queries.push(sql);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    if(sql.includes('FROM game_quests WHERE id='))return rows([{id:quest,mission_id:mission,stage_id:stage,plan_id:null,title:'Work',state:'changes_requested',claimed_by:user,brief:{}}]);
    if(sql.includes('FROM game_missions'))return rows([{id:mission,title:'Mission',pitch:'',rules:[],stage_index:0}]);
    if(sql.includes('FROM game_memberships'))return rows([]);
    throw Error(`Unexpected query: ${sql}`);
  });
  await assert.rejects(runContext(pool,user,'quest-execute',null,null,quest),{code:'not_member'});
  assert.equal(queries.some(q=>q.includes('FROM game_artifacts')||q.includes('FROM game_reviews')),false);
});

test('a run detail cannot be read by another account',async()=>{
  const query=async(sql:string,args:unknown[])=>{
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
    assert.match(sql,/WHERE id=\$1 AND user_id=\$2/);
    assert.deepEqual(args,[quest,user]);
    return rows([]);
  };
  const pool={query,connect:async()=>({query,release:()=>{}})} as unknown as Pool;
  await assert.rejects(getRunDetail(pool,user,quest),{code:'not_found'});
});
