import { createHash } from 'node:crypto';
import type { Pool, Client } from './db.js';
import type { Config } from './config.js';
import { privateAgentContext } from './agent-context.js';
import { listAgentCommands, queryAgentApp, executeAgentCommand } from './agent-commands.js';
import { isAppTool, runAppTool } from './composio.js';
import { canAccessGameRoom } from './game/service.js';

export const PRIVATE_AGENT_TOOLS = [
  {type:'custom' as const,name:'list_commands',description:'List the Joystick actions you can perform for this person. Use this before choosing a command.',input_schema:{type:'object' as const,properties:{},additionalProperties:false}},
  {type:'custom' as const,name:'read_app',description:'Read fresh, authorized Joystick information before answering or acting. Use missions for discovery, mission for details, stage/plan/quest for a selected item, rooms/messages for chat, and profile/wallet for account facts. Results are paged.',input_schema:{type:'object' as const,properties:{view:{type:'string',enum:['profile','wallet','policy','trust','missions','mission','stage','plan','quest','rooms','messages','people','notifications','invites','runs','run','artifact','credits.csv']},entityId:{type:'string',description:'ID for mission, stage, plan, quest, messages room, run, artifact, or runs mission filter.'},query:{type:'string',description:'Text filter for ordinary list views; for runs, use the nextCursor returned by a previous runs page.'},after:{type:'integer',description:'Nonnegative paging offset or message sequence. Do not use for runs.'},limit:{type:'integer',description:'Page size from 1 through 50.'}},required:['view'],additionalProperties:false}},
  {type:'custom' as const,name:'execute_command',description:'Perform an explicitly requested Joystick command as this person. First use list_commands for valid names, payloads, and target ID guidance. The app checks authorization and returns the result.',input_schema:{type:'object' as const,properties:{command:{type:'string',description:'Exact command name from list_commands.'},entityId:{type:'string',description:'Target item ID at this top level when the command catalog lists an entityId.'},payload:{type:'object',description:'Command-specific fields from the catalog. For ui.open, put screen here and the target ID at top level.'}},required:['command'],additionalProperties:false}},
];

export interface PrivateToolEvent {type:string;id:string;name?:string;input?:Record<string,unknown>}
export interface PrivateToolProvider {sendTool(sessionId:string,toolUseId:string,result:unknown,isError:boolean):Promise<unknown>}
export interface PrivateDispatch {id:string;room_id:string;user_id:string;provider_session_id:string;status:string}
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const short=(value:unknown,max:number)=>typeof value==='string'&&value.length<=max?value:undefined;
const notify=async(db:Client,roomId:string)=>{await db.query("SELECT pg_notify('joystick_agent_activity',$1)",[JSON.stringify({roomId})]);};
export function toolRequestId(sessionId:string,eventId:string):string {
  const hex=createHash('sha256').update('joystick-private-tool\0').update(sessionId).update('\0').update(eventId).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
async function toolResult(pool:Pool,config:Config,dispatch:PrivateDispatch,event:PrivateToolEvent):Promise<unknown>{
  if(isAppTool(event.name)){
    // Shared rooms act as whoever sent the message this turn answers.
    const turn=await pool.query(`SELECT 1 FROM agent_dispatches d JOIN messages m ON m.id=d.message_id AND m.user_id=$3
      JOIN rooms r ON r.id=d.room_id AND r.provider_session_id=$2
      WHERE d.id=$4 AND d.room_id=$1 AND d.provider_session_id=$2 AND d.status IN ('sent','completed')`,
      [dispatch.room_id,dispatch.provider_session_id,dispatch.user_id,dispatch.id]);
    if(!turn.rowCount || !await canAccessGameRoom(pool,dispatch.user_id,dispatch.room_id)) throw Error('Room access changed');
    return runAppTool(dispatch.user_id,event.name!,object(event.input));
  }
  const access=await pool.query(`SELECT r.id FROM rooms r JOIN agent_dispatches d ON d.room_id=r.id
    JOIN messages m ON m.id=d.message_id AND m.user_id=$3
    WHERE r.id=$1 AND r.kind='agent' AND r.provider_session_id=$2 AND d.id=$4
      AND d.provider_session_id=$2 AND d.status IN ('sent','completed')
      AND (SELECT count(*) FROM room_members WHERE room_id=r.id)=1
      AND EXISTS(SELECT 1 FROM room_members WHERE room_id=r.id AND user_id=$3)`,
    [dispatch.room_id,dispatch.provider_session_id,dispatch.user_id,dispatch.id]);
  if(!access.rowCount || await privateAgentContext(pool,dispatch.room_id,dispatch.user_id)===null) throw Error('Private room access changed');
  const input=object(event.input);
  if(event.name==='list_commands')return listAgentCommands();
  if(event.name==='read_app'){
    const view=short(input.view,80);if(!view)throw Error('Invalid view');
    return queryAgentApp(pool,dispatch.user_id,{view,entityId:short(input.entityId,100),query:short(input.query,500),after:Number.isSafeInteger(input.after)?Number(input.after):undefined,limit:Number.isSafeInteger(input.limit)?Number(input.limit):undefined});
  }
  if(event.name==='execute_command'){
    const command=short(input.command,100);if(!command)throw Error('Invalid command');
    return executeAgentCommand(pool,config,dispatch.user_id,{command,entityId:short(input.entityId,100),payload:object(input.payload)},toolRequestId(dispatch.provider_session_id,event.id));
  }
  throw Error('Unknown private agent tool');
}

// The receipt row is locked through execution. A crashed worker may retry with
// the same deterministic request ID; every writing command must honor that ID.
export async function processPrivateTool(pool:Pool,config:Config,provider:PrivateToolProvider,dispatch:PrivateDispatch,event:PrivateToolEvent):Promise<void>{
  if(!event.id || !event.name)return;
  const db=await pool.connect();
  const lock=createHash('sha256').update(dispatch.provider_session_id).update('\0').update(event.id).digest();
  const keyA=lock.readInt32BE(0),keyB=lock.readInt32BE(4);
  try{
    await db.query('SELECT pg_advisory_lock($1,$2)',[keyA,keyB]);
    const inserted=await db.query(`INSERT INTO private_agent_tool_receipts(session_id,event_id,room_id,dispatch_id,actor_id,tool_name,input,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,'running') ON CONFLICT DO NOTHING RETURNING event_id`,
      [dispatch.provider_session_id,event.id,dispatch.room_id,dispatch.id,dispatch.user_id,event.name,JSON.stringify(object(event.input))]);
    const receipt=await db.query(`SELECT * FROM private_agent_tool_receipts WHERE session_id=$1 AND event_id=$2 FOR UPDATE`,[dispatch.provider_session_id,event.id]);
    const row=receipt.rows[0];
    if(row.dispatch_id!==dispatch.id || row.room_id!==dispatch.room_id || row.actor_id!==dispatch.user_id || row.tool_name!==event.name || !(await db.query('SELECT $1::jsonb=$2::jsonb AS same',[row.input,JSON.stringify(object(event.input))])).rows[0].same)throw Error('Private tool receipt changed identity');
    if(inserted.rowCount)await notify(db,dispatch.room_id);
    if(row.state!=='running')return;
    let result:unknown,isError=false;
    try{result=await toolResult(pool,config,dispatch,event);}
    catch(error){result={ok:false,summary:error instanceof Error?error.message:'Command failed'};isError=true;}
    await db.query(`UPDATE private_agent_tool_receipts SET result=$3,is_error=$4,state=$5,updated_at=now() WHERE session_id=$1 AND event_id=$2`,
      [dispatch.provider_session_id,event.id,JSON.stringify(result),isError,isError?'failed':'completed']);
    await notify(db,dispatch.room_id);
  } finally {
    await db.query('SELECT pg_advisory_unlock($1,$2)',[keyA,keyB]).catch(()=>{});
    db.release();
  }
  await sendPrivateToolResult(pool,provider,dispatch.provider_session_id,event.id);
}

export async function sendPrivateToolResult(pool:Pool,provider:PrivateToolProvider,sessionId:string,eventId:string):Promise<void>{
  const claimed=await pool.query(`UPDATE private_agent_tool_receipts SET send_state='sending',updated_at=now()
    WHERE session_id=$1 AND event_id=$2 AND state IN ('completed','failed') AND send_state IN ('pending','uncertain')
    RETURNING result,is_error`,[sessionId,eventId]);
  if(!claimed.rowCount)return;
  try{
    await provider.sendTool(sessionId,eventId,claimed.rows[0].result,claimed.rows[0].is_error);
    await pool.query(`UPDATE private_agent_tool_receipts SET send_state='sent',updated_at=now() WHERE session_id=$1 AND event_id=$2 AND send_state='sending'`,[sessionId,eventId]);
  }catch{
    await pool.query(`UPDATE private_agent_tool_receipts SET send_state='uncertain',updated_at=now() WHERE session_id=$1 AND event_id=$2 AND send_state='sending'`,[sessionId,eventId]);
  }
}
export async function acknowledgePrivateTool(pool:Pool,sessionId:string,eventId:string):Promise<void>{
  await pool.query(`UPDATE private_agent_tool_receipts SET send_state='sent',updated_at=now() WHERE session_id=$1 AND event_id=$2 AND send_state<>'sent'`,[sessionId,eventId]);
}
export async function recoverPrivateToolSends(pool:Pool):Promise<void>{
  await pool.query("UPDATE private_agent_tool_receipts SET send_state='uncertain' WHERE send_state='sending'");
}
