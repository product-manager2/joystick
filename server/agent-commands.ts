import type { Pool } from './db.js';
import type { Config } from './config.js';
import { ApiError } from './auth.js';
import { GAME_ACTIONS, type GameAction } from '../contracts/game.js';
import type { AgentCommandInfo, AgentCommandInput, AgentCommandResult, AgentQueryInput } from '../contracts/agent-commands.js';
import { applyGameCommand, getGameSnapshot } from './game/service.js';
import { getGameArtifact, getCreditsCsv } from './game/exports.js';
import { history, markRoomRead, saveUserMessage } from './chat.js';
import { createAgentRun, getRunDetail, listAgentRuns, decideAgentRun, cancelAgentRun } from './agent-runs/routes.js';
import type { AgentRunInput } from '../contracts/agent-runs.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const fail=(message:string):never=>{throw new ApiError(400,'invalid_input',message);};

// Payload descriptions mirror docs/game-actions.md. Authorization remains in applyGameAction.
const docs:Record<GameAction,[string,string,string?]>={
  'profile.update':['Update your agent name, roles, skills, or preferences','—','agentName?, roles?, skills?, preferences?'],
  'mission.create':['Create a mission with stages','—','title, pitch?, tag?, team?, roles?, bounty?, rules?, stages:[{name,goal?,target?,gateTarget?,unit?,tracks?}]'],
  'mission.update':['Edit a mission you own','mission ID','title?, pitch?, tag?, team?, roles?, bounty?'],
  'mission.join':['Join a mission','mission ID'], 'mission.leave':['Leave a mission you do not own','mission ID'], 'mission.voice':['Add your voice to a mission','mission ID'],
  'stage.create':['Add a stage to a mission you own','mission ID','name, goal?, target?, unit?, tracks?'],
  'stage.approve':['Approve an eligible stage you own','stage ID'], 'stage.advance':['Open the next stage of a mission you own','mission ID'],
  'plan.create':['Propose a plan in an active stage','stage ID','name, squad, bet?'],
  'plan.update':['Edit a plan you created or own','plan ID','name?, squad?, bet?'], 'plan.join':['Join an active plan','plan ID'],
  'plan.back':['Back a plan, optionally reserving credits','plan ID','testCredits? (0 is free backing)'], 'plan.approve':['Approve a proposed plan you own','plan ID'],
  'merge.propose':['Propose merging two plans','source plan ID','targetPlanId, reason?'], 'merge.decide':['Approve a merge proposal you own','merge proposal ID'], 'merge.dismiss':['Dismiss a merge proposal you own','merge proposal ID'],
  'quest.create':['Create a quest in an active stage','stage ID','title, description?, role?, size?: S|M|L, planId?, parentId?, dependencies?, rewardCredits?, call?'],
  'quest.update':['Edit an open quest in a mission you own','quest ID','title?, description?, planId?, parentId?, dependencies?, rewardCredits?'],
  'quest.claim':['Claim an available quest','quest ID'], 'quest.release':['Release your claimed quest','quest ID'], 'quest.watch':['Watch a quest','quest ID'],
  'quest.assign':['Assign an open quest as mission owner','quest ID','userId'], 'quest.decide':['Record a choice for your claimed quest','quest ID','choice, reason?'],
  'quest.submit':['Submit a text artifact for your claimed quest','quest ID','title, content'], 'quest.review':['Review another member’s submitted artifact','quest ID',"verdict:'approve'|'changes_requested', note?"],
  'quest.nudge':['Nudge the claimant of a quest','quest ID','message'], 'pair.request':['Ask a mission member to collaborate','quest ID','userId'],
  'need.create':['Post a mission need','mission ID','title, detail?'], 'need.support':['Support a posted need','need ID'],
  'pledge.create':['Pledge time, compute, or credits','mission ID',"kind:'time'|'compute'|'test_credits', amount, note?"],
  'invite.create':['Invite a registered user to a mission','mission ID','email'], 'invite.accept':['Accept your invitation','invite ID'], 'invite.decline':['Decline your invitation','invite ID'],
  'notification.read':['Mark your notification read','notification ID'], 'funding.reserve':['Reserve your credits for a mission','mission ID','amount'],
  'payout.simulate':['Record a payout entry for your approved quest','quest ID'],
  'spend.flag':['Flag a spending concern on a mission','mission ID','reason'],
  'tool.preference':['Set a tool preference; this does not connect an account','—','key, enabled'], 'skill.assert':['Add a self-declared skill','—','skill'],
  'room.create':['Open a direct or scoped room','—',"{kind:'dm',userId} or {kind:'mission'|'stage'|'plan'|'quest',scopeId}"],
};
const extra:AgentCommandInfo[]=[
  {name:'chat.send',description:'Send a message as you to a room you can access',entityId:'room ID',payload:'text',kind:'write'},
  {name:'chat.read',description:'Mark a room read up to a message sequence',entityId:'room ID',payload:'sequence',kind:'write'},
  {name:'agent_run.create',description:'Start an in-app work run',payload:'kind: mission-draft|plan-draft|quest-draft|quest-execute|context-chat, prompt, missionId?, planId?, questId?',kind:'write'},
  {name:'agent_run.decide',description:'Choose an option requested by your work run',entityId:'run ID',payload:'decisionId, optionId',kind:'write'},
  {name:'agent_run.cancel',description:'Cancel your work run',entityId:'run ID',kind:'write'},
  {name:'artifact.download',description:'Open a member-authorized submitted artifact download',entityId:'artifact ID',kind:'handoff'},
  {name:'credits.export',description:'Download your credit journal as CSV or JSON',payload:"format?:'csv'|'json'",kind:'handoff'},
  {name:'ui.open',description:'Open an app screen for you; a plan opens the strategy screen',entityId:'target item ID for mission, stage, strategy (plan), quest, thread, or run',payload:'screen: lobby|mission|stage|strategy|quest|thread|comms|profile|wallet|security|run',kind:'handoff'},
  {name:'passkeys.manage',description:'Open device-bound passkey management',kind:'handoff'},
];
export function listAgentCommands():{commands:AgentCommandInfo[]}{
  return {commands:[...GAME_ACTIONS.map(name=>({name,description:docs[name][0],entityId:docs[name][1],payload:docs[name][2],kind:'write' as const})),...extra]};
}

const page=<T>(items:T[],limit:number,after=0)=>({items:items.slice(after,after+limit),next:after+limit<items.length?after+limit:null,total:items.length});
const boundedLimit=(value:unknown)=>value===undefined?20:Number.isSafeInteger(value)&&Number(value)>=1&&Number(value)<=50?Number(value):fail('Limit must be between 1 and 50');
const offset=(value:unknown)=>value===undefined?0:Number.isSafeInteger(value)&&Number(value)>=0?Number(value):fail('Invalid cursor');
const find=<T extends {id?:unknown}>(items:T[],id:unknown)=>items.find(x=>x.id===id)??null;
export async function queryAgentApp(pool:Pool,userId:string,input:AgentQueryInput):Promise<unknown>{
  const view=input?.view;
  if(typeof view!=='string')fail('Choose a view');
  const limit=boundedLimit(input.limit), after=offset(input.after);
  if(view==='messages')return history(pool,userId,input.entityId??'',after,limit);
  if(view==='run'){
    const detail=await getRunDetail(pool,userId,input.entityId??'');
    return {...detail,drafts:page(detail.drafts,limit,after),decisions:page(detail.decisions,limit,after),artifacts:page(detail.artifacts.map(a=>({id:a.id,title:a.title,contentType:a.contentType,version:a.version,createdAt:a.createdAt,content:a.content.slice(0,12000),truncated:a.content.length>12000})),limit,after)};
  }
  if(view==='runs')return listAgentRuns(pool,userId,{missionId:input.entityId,cursor:input.query,limit});
  if(view==='artifact'){
    const artifact=await getGameArtifact(pool,userId,input.entityId??'');
    return {title:artifact.title,contentType:artifact.contentType,content:artifact.content.toString('utf8',0,16000),truncated:artifact.content.length>16000};
  }
  if(view==='credits.csv'){
    const csv=await getCreditsCsv(pool,userId);
    return {csv:csv.slice(0,16000),truncated:csv.length>16000};
  }
  const snapshot=await getGameSnapshot(pool,userId);
  if(view==='profile')return snapshot.profile;
  if(view==='wallet')return {...snapshot.wallet,ledger:page((snapshot.wallet.ledger as unknown[])??[],limit,after)};
  if(view==='policy')return snapshot.policy;
  if(view==='trust')return snapshot.trust;
  if(view==='mission'){
    const mission=find(snapshot.missions,input.entityId);
    if(!mission)throw new ApiError(404,'not_found','Mission not found');
    const m=mission as Record<string,unknown>;
    return {...m,quests:page((m.quests as unknown[])??[],limit,after),strategies:page((m.strategies as unknown[])??[],limit,after),needs:page((m.needs as unknown[])??[],limit,after)};
  }
  if(['stage','plan','quest'].includes(view)){
    const mission=snapshot.missions.find(m=>
      view==='stage'?(m.stages as Array<{id:string}>).some(s=>s.id===input.entityId):
      view==='plan'?(m.strategies as Array<{id:string}>).some(s=>s.id===input.entityId):
      (m.quests as Array<{id:string}>).some(q=>q.id===input.entityId));
    if(!mission)throw new ApiError(404,'not_found','Item not found');
    if(view==='stage')return {missionId:mission.id,stage:find(mission.stages as Array<{id:string}>,input.entityId),quests:page((mission.quests as Array<{stageId:string}>).filter(q=>q.stageId===input.entityId),limit,after)};
    if(view==='plan')return {missionId:mission.id,plan:find(mission.strategies as Array<{id:string}>,input.entityId),quests:page((mission.quests as Array<{strat:string}>).filter(q=>q.strat===input.entityId),limit,after)};
    return {missionId:mission.id,quest:find(mission.quests as Array<{id:string}>,input.entityId)};
  }
  const lists:Record<string,unknown[]>={missions:snapshot.missions.map(m=>({id:m.id,title:m.title,pitch:m.pitch,tag:m.tag,current:m.current,joined:m.joined,myRole:m.myRole,players:m.players,stageCount:(m.stages as unknown[]).length,planCount:(m.strategies as unknown[]).length,questCount:(m.quests as unknown[]).length})),rooms:snapshot.threads,people:snapshot.people,notifications:snapshot.notifications,invites:snapshot.invites};
  if(!(view in lists))fail('Unknown view');
  if(input.query!==undefined&&typeof input.query!=='string')fail('Invalid search');
  const term=input.query?.trim().toLowerCase();
  if(term&&term.length>120)fail('Search is too long');
  const rows=term?lists[view].filter(row=>JSON.stringify(row).toLowerCase().includes(term)):lists[view];
  return page(rows,limit,after);
}

const screens=new Set(['lobby','mission','stage','strategy','quest','thread','comms','profile','wallet','security','run']);
export async function executeAgentCommand(pool:Pool,config:Config,userId:string,input:AgentCommandInput,requestId:string):Promise<AgentCommandResult>{
  if(!validId(userId)||!validId(requestId)||!input||typeof input.command!=='string')fail('Invalid command');
  const command=input.command,p=input.payload??{};
  if(!p||typeof p!=='object'||Array.isArray(p))fail('Invalid payload');
  if((GAME_ACTIONS as readonly string[]).includes(command)){
    const gameInput={action:command as GameAction,entityId:input.entityId,payload:p,requestId};
    const result=await applyGameCommand(pool,userId,gameInput,'agent');
    return {ok:true,command,summary:`Done: ${docs[command as GameAction][0].toLowerCase()}`,...(result.entityId?{data:{entityId:result.entityId}}:{})};
  }
  if(command==='chat.send'){
    const text=p.text;
    const saved=await saveUserMessage(pool,userId,input.entityId??'',requestId,text as string,false);
    return {ok:true,command,summary:'Message sent',data:{message:saved.message}};
  }
  if(command==='chat.read'){
    const read=await markRoomRead(pool,userId,input.entityId??'',p.sequence);
    return {ok:true,command,summary:'Room marked read',data:read};
  }
  if(command==='agent_run.create'){
    const run=await createAgentRun(pool,config,userId,{...p,requestId} as unknown as AgentRunInput);
    return {ok:true,command,summary:'Work run started',data:{run},handoff:{type:'navigate',screen:'run',entityId:run.id}};
  }
  if(command==='agent_run.decide'){
    const detail=await decideAgentRun(pool,userId,input.entityId??'',{...p,requestId});
    return {ok:true,command,summary:'Decision saved',data:{run:detail.run},handoff:{type:'navigate',screen:'run',entityId:detail.run.id}};
  }
  if(command==='agent_run.cancel'){
    const run=await cancelAgentRun(pool,userId,input.entityId??'',requestId);
    return {ok:true,command,summary:run.status==='cancelled'?'Run cancelled':`Run is ${run.status}`,data:{run}};
  }
  if(command==='artifact.download'){
    await getGameArtifact(pool,userId,input.entityId??'');
    return {ok:true,command,summary:'Artifact ready to download',handoff:{type:'download',path:`/api/v1/game/artifacts/${input.entityId}`,label:'Download artifact'}};
  }
  if(command==='credits.export'){
    const format=p.format??'csv';
    if(format!=='csv'&&format!=='json')fail('Choose CSV or JSON');
    return {ok:true,command,summary:'Credit journal ready to download',handoff:{type:'download',path:`/api/v1/game/credits.${format}`,label:`Download ${String(format).toUpperCase()}`}};
  }
  if(command==='passkeys.manage'){
    return {ok:true,command,summary:'Open passkey settings on your device',handoff:{type:'navigate',screen:'security'}};
  }
  if(command==='ui.open'){
    const screen=p.screen;
    if(typeof screen!=='string'||!screens.has(screen))fail('Unknown screen');
    const selectedScreen=screen as string;
    if(input.entityId!==undefined&&p.entityId!==undefined&&input.entityId!==p.entityId)fail('Conflicting screen item IDs');
    const id=input.entityId??p.entityId;
    if(id!==undefined&&!validId(id))fail('Invalid screen item');
    if(['mission','stage','strategy','quest','thread','run'].includes(selectedScreen)){
      if(!validId(id))fail('Choose an item to open');
      if(selectedScreen==='run')await getRunDetail(pool,userId,id as string);
      else if(selectedScreen==='thread')await history(pool,userId,id as string,0,1);
      else {
        const snapshot=await getGameSnapshot(pool,userId);
        const matching=snapshot.missions.some(m=>selectedScreen==='mission'?m.id===id:selectedScreen==='stage'?(m.stages as Array<{id:string}>).some(s=>s.id===id):selectedScreen==='strategy'?(m.strategies as Array<{id:string}>).some(s=>s.id===id):(m.quests as Array<{id:string}>).some(q=>q.id===id));
        if(!matching)throw new ApiError(404,'not_found','Item not found');
      }
    }
    return {ok:true,command,summary:'Screen ready to open',handoff:{type:'navigate',screen:selectedScreen,...(id?{entityId:id as string}:{})}};
  }
  throw new ApiError(400,'invalid_action','Unknown command');
}
