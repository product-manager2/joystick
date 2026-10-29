import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { transaction, type Pool, type Client } from '../db.js';
import { ApiError, requireUser } from '../auth.js';
import { agentAvailable, type Config } from '../config.js';
import { AGENT_RUN_KINDS, type AgentRunInput } from '../../contracts/agent-runs.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const fail=()=>{throw new ApiError(404,'not_found','Agent run not found');};
type Q=Pool|Client;
type RunRow={id:string;user_id:string;kind:string;status:string;mission_id:string|null;plan_id:string|null;quest_id:string|null;room_id:string|null;prompt:string;response:string|null;error:string|null;created_at:string;updated_at:string};
const MAX_ACCOUNT_RUNS=2;
const publicRun=(row:RunRow)=>({id:row.id,kind:row.kind,status:row.status,missionId:row.mission_id,planId:row.plan_id,questId:row.quest_id,roomId:row.room_id,prompt:row.prompt,response:row.response,error:row.error,createdAt:row.created_at,updatedAt:row.updated_at});
async function ownerRun(q:Q,userId:string,id:string):Promise<RunRow>{
  if(!validId(id))fail();
  const r=await q.query('SELECT * FROM agent_runs WHERE id=$1 AND user_id=$2',[id,userId]);
  if(!r.rowCount)fail();
  return r.rows[0] as RunRow;
}
async function assertRunReadScope(q:Q,userId:string,row:RunRow){
  if(!row.mission_id)return;
  const member=await q.query('SELECT 1 FROM game_memberships WHERE mission_id=$1 AND user_id=$2 FOR SHARE',[row.mission_id,userId]);
  if(!member.rowCount)throw new ApiError(403,'not_member','Join this mission to view its agent work');
}

export async function admitAgentRun(pool:Pool,userId:string,requestId:string,requestHash:string,kind:string,scope:{missionId:string|null;planId:string|null;questId:string|null},roomId:string|null,prompt:string):Promise<string>{
  return transaction(pool,async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
    const existing=await db.query('SELECT id,request_hash FROM agent_runs WHERE user_id=$1 AND request_id=$2',[userId,requestId]);
    if(existing.rowCount){if(existing.rows[0].request_hash!==requestHash)throw new ApiError(409,'idempotency_conflict','Request ID was used for another run');return existing.rows[0].id as string;}
    const active=await db.query("SELECT count(*)::int AS total FROM agent_runs WHERE user_id=$1 AND status IN ('queued','starting','running','needs_input','uncertain')",[userId]);
    if(Number(active.rows[0].total)>=MAX_ACCOUNT_RUNS)throw new ApiError(429,'agent_run_limit','Agent run limit reached. Finish or cancel an active run; an uncertain run needs reconciliation before another can start.');
    const created=await db.query(`INSERT INTO agent_runs(user_id,request_id,request_hash,kind,mission_id,plan_id,quest_id,room_id,prompt) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[userId,requestId,requestHash,kind,scope.missionId,scope.planId,scope.questId,roomId,prompt]);
    return created.rows[0].id as string;
  });
}

export async function runContext(pool:Pool,userId:string,kind:string,missionId:string|null,planId:string|null,questId:string|null) {
  if(kind==='mission-draft' && (missionId||planId||questId)) throw new ApiError(400,'invalid_input','Mission drafts cannot target an existing item');
  if(kind==='plan-draft'&&!missionId) throw new ApiError(400,'invalid_input','Choose a mission');
  if(kind==='quest-draft'&&!missionId) throw new ApiError(400,'invalid_input','Choose a mission');
  if(kind==='quest-execute'&&!questId) throw new ApiError(400,'invalid_input','Choose a quest');
  if(!missionId&&!planId&&!questId) return {missionId:null,planId:null,questId:null,context:null};
  return transaction(pool,async db=>{
  let mission=missionId;
  if(planId){const r=await db.query('SELECT mission_id FROM game_plans WHERE id=$1',[planId]);if(!r.rowCount)fail();if(mission&&mission!==r.rows[0].mission_id)fail();mission=r.rows[0].mission_id;}
  let quest:Record<string,unknown>|null=null;
  if(questId){const r=await db.query('SELECT id,mission_id,stage_id,plan_id,title,state,claimed_by,brief,decision FROM game_quests WHERE id=$1',[questId]);if(!r.rowCount)fail();quest=r.rows[0];if(mission&&mission!==quest!.mission_id)fail();if(planId&&planId!==quest!.plan_id)fail();mission=quest!.mission_id as string;}
  const m=await db.query('SELECT id,title,pitch,rules,stage_index,seed_notice,sample FROM game_missions WHERE id=$1',[mission]);
  if(!m.rowCount)fail();
  const member=await db.query('SELECT 1 FROM game_memberships WHERE mission_id=$1 AND user_id=$2 FOR SHARE',[mission,userId]);
  if(!member.rowCount)throw new ApiError(403,'not_member','Join this mission first');
  if(kind==='quest-execute'&&(quest?.claimed_by!==userId||!['claimed','changes_requested'].includes(String(quest?.state))))throw new ApiError(409,'quest_unavailable','Claim this quest before asking the agent to work on it');
  const stages=await db.query('SELECT id,name,goal,status,ordinal,metadata FROM game_stages WHERE mission_id=$1 ORDER BY ordinal',[mission]);
  const plans=await db.query('SELECT id,stage_id,name,squad,bet,status,metadata FROM game_plans WHERE mission_id=$1 ORDER BY name LIMIT 30',[mission]);
  const quests=await db.query('SELECT id,title,brief,state,stage_id,plan_id,claimed_by FROM game_quests WHERE mission_id=$1 ORDER BY created_at LIMIT 50',[mission]);
  if(kind==='quest-execute'&&!stages.rows.some(s=>s.id===quest?.stage_id&&s.status==='active'))throw new ApiError(409,'quest_unavailable','This quest stage is no longer active');
  let latestSubmission:null|{id:string;version:number;title:string;content:string;createdAt:string;reviews:Array<{verdict:string;note:string;reviewerName:string;createdAt:string}>}=null;
  if(questId){
    const artifact=await db.query('SELECT id,version,title,content,created_at FROM game_artifacts WHERE quest_id=$1 ORDER BY version DESC LIMIT 1',[questId]);
    if(artifact.rowCount){
      const a=artifact.rows[0];
      const reviews=await db.query('SELECT r.verdict,r.note,r.created_at,u.name AS reviewer_name FROM game_reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.artifact_id=$1 ORDER BY r.created_at,r.id LIMIT 10',[a.id]);
      latestSubmission={id:a.id,version:a.version,title:a.title,content:(a.content as Buffer).toString('utf8').slice(0,16000),createdAt:a.created_at,reviews:reviews.rows.map(r=>({verdict:r.verdict,note:String(r.note).slice(0,3000),reviewerName:r.reviewer_name,createdAt:r.created_at}))};
    }
  }
  return {missionId:mission,planId,questId,context:{mission:m.rows[0],stages:stages.rows,plans:plans.rows,quests:quests.rows,selectedQuest:quest,latestSubmission}};
  });
}

export async function getRunDetail(pool:Pool,userId:string,id:string){
  return transaction(pool,async db=>{
    const row=await ownerRun(db,userId,id);
    await assertRunReadScope(db,userId,row);
    const [drafts,artifacts,decisions]=await Promise.all([
      db.query('SELECT id,kind,data,created_at FROM agent_run_drafts WHERE run_id=$1 ORDER BY created_at,id',[id]),
      db.query('SELECT id,title,content,content_type,version,created_at FROM agent_run_artifacts WHERE run_id=$1 ORDER BY version',[id]),
      db.query('SELECT id,prompt,options,selected_option_id,created_at FROM agent_run_decisions WHERE run_id=$1 ORDER BY created_at,id',[id]),
    ]);
    return {run:publicRun(row),drafts:drafts.rows.map(d=>({id:d.id,kind:d.kind,data:d.data,createdAt:d.created_at})),artifacts:artifacts.rows.map(a=>({id:a.id,title:a.title,content:a.content,contentType:a.content_type,version:a.version,createdAt:a.created_at})),decisions:decisions.rows.map(d=>({id:d.id,prompt:d.prompt,options:d.options,selectedOptionId:d.selected_option_id,createdAt:d.created_at}))};
  });
}

export async function createAgentRun(pool:Pool,config:Config,userId:string,body:AgentRunInput){
  if(!body||!validId(body.requestId)||!AGENT_RUN_KINDS.includes(body.kind)||[body.missionId,body.planId,body.questId].some(v=>v!==undefined&&!validId(v))||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>8000)throw new ApiError(400,'invalid_input','Invalid agent request');
  if(!agentAvailable(config)||!config.anthropicWorkflowAgentId)throw new ApiError(503,'agent_unavailable','Mission work agent is not configured');
  const missionId=body.missionId??null,planId=body.planId??null,questId=body.questId??null;
  const normalized={kind:body.kind,missionId,planId,questId,prompt:body.prompt.trim()};
  const digest=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const existing=await pool.query('SELECT id,request_hash FROM agent_runs WHERE user_id=$1 AND request_id=$2',[userId,body.requestId]);
  if(existing.rowCount){if(existing.rows[0].request_hash!==digest)throw new ApiError(409,'idempotency_conflict','Request ID was used for another run');return (await getRunDetail(pool,userId,existing.rows[0].id)).run;}
  const scope=await runContext(pool,userId,body.kind,missionId,planId,questId);
  const room=await pool.query("SELECT r.id FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.kind='agent' AND m.user_id=$1 ORDER BY r.id LIMIT 1",[userId]);
  const id=await admitAgentRun(pool,userId,body.requestId,digest,body.kind,scope,room.rows[0]?.id??null,normalized.prompt);
  return (await getRunDetail(pool,userId,id)).run;
}

export async function listAgentRuns(pool:Pool,userId:string,q:{missionId?:string;questId?:string;cursor?:string;limit?:number}){
  if((q.missionId!==undefined&&!validId(q.missionId))||(q.questId!==undefined&&!validId(q.questId))||(q.cursor!==undefined&&!validId(q.cursor)))throw new ApiError(400,'invalid_input','Invalid run filter');
  const limit=q.limit??30;
  if(!Number.isInteger(limit)||limit<1||limit>50)throw new ApiError(400,'invalid_input','Limit must be between 1 and 50');
  const cursor=q.cursor??null;
  if(cursor){const cursorRow=await ownerRun(pool,userId,cursor);await assertRunReadScope(pool,userId,cursorRow);}
  const r=await pool.query(`SELECT r.* FROM agent_runs r WHERE r.user_id=$1 AND ($2::uuid IS NULL OR r.mission_id=$2) AND ($3::uuid IS NULL OR r.quest_id=$3) AND (r.mission_id IS NULL OR EXISTS(SELECT 1 FROM game_memberships m WHERE m.mission_id=r.mission_id AND m.user_id=$1)) AND ($4::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM agent_runs WHERE id=$4 AND user_id=$1)) ORDER BY r.created_at DESC,r.id DESC LIMIT $5`,[userId,q.missionId??null,q.questId??null,cursor,limit+1]);
  const page=r.rows.slice(0,limit) as RunRow[];
  return {runs:page.map(publicRun),nextCursor:r.rows.length>limit?page.at(-1)?.id??null:null};
}

export async function decideAgentRun(pool:Pool,userId:string,id:string,body:{decisionId?:unknown;optionId?:unknown;requestId?:unknown}){
  if(!validId(id)||!validId(body?.decisionId)||!validId(body?.requestId)||typeof body?.optionId!=='string'||body.optionId.length>80)throw new ApiError(400,'invalid_input','Invalid decision');
  await transaction(pool,async db=>{
    const run=await db.query('SELECT * FROM agent_runs WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,userId]);
    if(!run.rowCount)fail();
    await assertRunReadScope(db,userId,run.rows[0] as RunRow);
    const found=await db.query('SELECT id,options,selected_option_id FROM agent_run_decisions WHERE id=$1 AND run_id=$2 FOR UPDATE',[body.decisionId,id]);
    if(!found.rowCount)fail();
    const decision=found.rows[0] as {id:string;options:Array<{id:string}>;selected_option_id:string|null};
    if(!Array.isArray(decision.options)||!decision.options.some(o=>o.id===body.optionId))throw new ApiError(400,'invalid_input','Unknown option');
    if(decision.selected_option_id&&decision.selected_option_id!==body.optionId)throw new ApiError(409,'decision_conflict','Decision already answered');
    if(!decision.selected_option_id){
      if(!['needs_input','running'].includes(run.rows[0].status))throw new ApiError(409,'run_not_waiting','This run is no longer waiting for a decision');
      await db.query('UPDATE agent_run_decisions SET selected_option_id=$2,selected_at=now() WHERE id=$1',[body.decisionId,body.optionId]);
      await db.query("UPDATE agent_runs SET status='running',updated_at=now() WHERE id=$1 AND status='needs_input'",[id]);
    }
  });
  return getRunDetail(pool,userId,id);
}

export async function cancelAgentRun(pool:Pool,userId:string,id:string,requestId:string){
  if(!validId(id)||!validId(requestId))throw new ApiError(400,'invalid_input','Invalid cancellation');
  const current=await ownerRun(pool,userId,id);
  if(current.status==='starting')throw new ApiError(409,'run_starting','The agent is starting; try cancellation again shortly');
  const updated=await pool.query(`UPDATE agent_runs SET status='cancelled',cancel_state=CASE WHEN provider_session_id IS NOT NULL THEN 'pending' ELSE NULL END,updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('queued','running','needs_input','failed') RETURNING *`,[id,userId]);
  const stopped=(updated.rows[0]??current) as RunRow;
  return {id:stopped.id,status:stopped.status,updatedAt:stopped.updated_at};
}

export function registerAgentRunRoutes(app:FastifyInstance,pool:Pool,config:Config){
  app.post('/api/v1/agent/runs',async request=>{
    const user=await requireUser(pool,request), body=request.body as AgentRunInput|null;
    return {run:await createAgentRun(pool,config,user.id,body!)};
  });
  app.get('/api/v1/agent/runs',async request=>{
    const user=await requireUser(pool,request),q=request.query as {missionId?:string;questId?:string;cursor?:string;limit?:string};
    return listAgentRuns(pool,user.id,{missionId:q.missionId,questId:q.questId,cursor:q.cursor,...(q.limit!==undefined?{limit:Number(q.limit)}:{})});
  });
  app.get('/api/v1/agent/runs/:id',async request=>getRunDetail(pool,(await requireUser(pool,request)).id,(request.params as {id:string}).id));
  app.post('/api/v1/agent/runs/:id/decisions',async request=>{
    const user=await requireUser(pool,request),id=(request.params as {id:string}).id,body=request.body as {decisionId?:string;optionId?:string;requestId?:string}|null;
    return decideAgentRun(pool,user.id,id,body!);
  });
  app.post('/api/v1/agent/runs/:id/cancel',async request=>{
    const user=await requireUser(pool,request),id=(request.params as {id:string}).id,body=request.body as {requestId?:string}|null;
    return {run:await cancelAgentRun(pool,user.id,id,body?.requestId??'')};
  });
}
