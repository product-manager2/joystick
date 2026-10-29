import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPool } from '../../server/db.js';
import { saveUserMessage } from '../../server/chat.js';
import { processPrivateTool, toolRequestId } from '../../server/private-agent-tools.js';
import { refreshDispatchStatus, type ManagedAgentClient } from '../../server/agent.js';
import type { Config } from '../../server/config.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw Error('TEST_DATABASE_URL is required');
const config:Config={databaseUrl,port:0,host:'127.0.0.1',flyMode:false,webOrigin:'http://localhost:5173',rpId:'localhost',cookieSecure:false};

test('private tool receipts bind actor and dispatch, deduplicate calls, and deny revoked membership',async()=>{
  const pool=createPool(config);
  const user=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Tool tester') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
  const room=(await pool.query("INSERT INTO rooms(title) VALUES('Private tools') RETURNING id")).rows[0];
  const sessionId=`sess_${randomUUID()}`;
  const sent:unknown[]=[];
  const provider={sendTool:async(_sessionId:string,_eventId:string,result:unknown,isError:boolean)=>{sent.push({result,isError});}};
  try{
    await pool.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2)',[room.id,user.id]);
    const message=await saveUserMessage(pool,user.id,room.id,randomUUID(),'What can you do?',true);
    const dispatch=(await pool.query("UPDATE agent_dispatches SET status='sent',provider_session_id=$2 WHERE message_id=$1 RETURNING id,room_id,provider_session_id,status",[message.message.id,sessionId])).rows[0];
    await pool.query('UPDATE rooms SET provider_session_id=$2 WHERE id=$1',[room.id,sessionId]);
    const binding={...dispatch,user_id:user.id};
    const call={type:'agent.custom_tool_use',id:`evt_${randomUUID()}`,name:'list_commands',input:{}};
    await Promise.all([processPrivateTool(pool,config,provider,binding,call),processPrivateTool(pool,config,provider,binding,call)]);
    assert.equal(sent.length,1);
    const receipt=await pool.query('SELECT state,send_state,actor_id,dispatch_id FROM private_agent_tool_receipts WHERE session_id=$1 AND event_id=$2',[sessionId,call.id]);
    assert.equal(receipt.rows[0].state,'completed');
    assert.equal(receipt.rows[0].send_state,'sent');
    assert.equal(receipt.rows[0].actor_id,user.id);
    assert.equal(receipt.rows[0].dispatch_id,dispatch.id);
    assert.equal(toolRequestId(sessionId,call.id),toolRequestId(sessionId,call.id));
    assert.notEqual(toolRequestId(sessionId,call.id),toolRequestId(sessionId,'another'));

    await pool.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[room.id,user.id]);
    const revoked={type:'agent.custom_tool_use',id:`evt_${randomUUID()}`,name:'read_app',input:{view:'profile'}};
    await processPrivateTool(pool,config,provider,binding,revoked);
    assert.equal(sent.length,2);
    assert.equal((sent[1] as {isError:boolean}).isError,true);
    assert.equal((await pool.query('SELECT state FROM private_agent_tool_receipts WHERE session_id=$1 AND event_id=$2',[sessionId,revoked.id])).rows[0].state,'failed');
  }finally{await pool.query('DELETE FROM rooms WHERE id=$1',[room.id]);await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await pool.end();}
});

test('a stale idle reconciliation cannot complete a newer dispatch',async()=>{
  const pool=createPool(config);
  const user=(await pool.query("INSERT INTO users(email,name) VALUES($1,'Turn tester') RETURNING id",[`${randomUUID()}@example.test`])).rows[0];
  const room=(await pool.query("INSERT INTO rooms(title) VALUES('Turn ordering') RETURNING id")).rows[0];
  const sessionId=`sess_${randomUUID()}`;
  try{
    await pool.query('INSERT INTO room_members(room_id,user_id) VALUES($1,$2)',[room.id,user.id]);
    const first=await saveUserMessage(pool,user.id,room.id,randomUUID(),'First turn',true);
    const second=await saveUserMessage(pool,user.id,room.id,randomUUID(),'Second turn',true);
    const oldId=(await pool.query("UPDATE agent_dispatches SET status='sent',provider_session_id=$2 WHERE message_id=$1 RETURNING id",[first.message.id,sessionId])).rows[0].id;
    const newId=(await pool.query("UPDATE agent_dispatches SET provider_session_id=$2 WHERE message_id=$1 RETURNING id",[second.message.id,sessionId])).rows[0].id;
    await pool.query('UPDATE rooms SET provider_session_id=$2 WHERE id=$1',[room.id,sessionId]);
    let release!:()=>void;
    const blocked=new Promise<void>(resolve=>{release=resolve;});
    let listed!:()=>void;
    const started=new Promise<void>(resolve=>{listed=resolve;});
    const history=[{type:'user.message',id:'first-user'},{type:'session.status_idle',id:'old-end',stop_reason:{type:'end_turn'}}];
    const client:ManagedAgentClient={create:async()=>{throw Error('unused');},send:async()=>{},stream:async()=>({async *[Symbol.asyncIterator]() {}}),list:async function*(){listed();await blocked;for(const event of history)yield event;},status:async()=> 'idle'};
    const stale=refreshDispatchStatus(pool,client,room.id,sessionId);
    await started;
    await pool.query("UPDATE agent_dispatches SET status='completed' WHERE id=$1",[oldId]);
    await pool.query("UPDATE agent_dispatches SET status='sent' WHERE id=$1",[newId]);
    release();
    await stale;
    assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE id=$1',[newId])).rows[0].status,'sent');
    const paused:ManagedAgentClient={...client,list:async function*(){yield {type:'user.message',id:'first-user'};yield {type:'user.message',id:'second-user'};yield {type:'agent.custom_tool_use',id:'waiting',name:'read_app',input:{view:'profile'}};yield {type:'session.status_idle',id:'needs-tool',stop_reason:{type:'requires_action',event_ids:['waiting']}};}};
    await refreshDispatchStatus(pool,paused,room.id,sessionId);
    assert.equal((await pool.query('SELECT status FROM agent_dispatches WHERE id=$1',[newId])).rows[0].status,'sent');
  }finally{await pool.query('DELETE FROM rooms WHERE id=$1',[room.id]);await pool.query('DELETE FROM users WHERE id=$1',[user.id]);await pool.end();}
});
