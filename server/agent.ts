import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from './db.js';
import { transaction } from './db.js';
import type { Config } from './config.js';
import { agentAvailable } from './config.js';

export interface AgentEvent { type:string; id?:string; content?:Array<{type:string;text?:string}>; event_id?:string; delta?:{type:string;content?:{type:string;text?:string}} }
export interface ManagedAgentClient {
  create(input: {agent:string;environment_id:string;initial_events:Array<{type:'user.message';content:Array<{type:'text';text:string}>}>;metadata:{joystick_room_id:string;joystick_message_id:string}}): Promise<{id:string}>;
  send(sessionId:string, text:string): Promise<unknown>;
  stream(sessionId:string, signal:AbortSignal): Promise<AsyncIterable<AgentEvent>>;
  list(sessionId:string): AsyncIterable<AgentEvent>;
  status(sessionId:string): Promise<'rescheduling'|'running'|'idle'|'terminated'>;
}
export function anthropicClient(config: Config): ManagedAgentClient {
  if (!agentAvailable(config)) throw new Error('Managed agent configuration is incomplete');
  const client = new Anthropic({apiKey:config.anthropicApiKey,maxRetries:0});
  return {
    create: input => client.beta.sessions.create({...input,workspace_id:config.anthropicWorkspaceId},{maxRetries:0}),
    send: (sessionId,text) => client.beta.sessions.events.send(sessionId,{events:[{type:'user.message',content:[{type:'text',text}]}],workspace_id:config.anthropicWorkspaceId},{maxRetries:0}),
    stream: async (sessionId,signal) => client.beta.sessions.events.stream(sessionId,{event_deltas:['agent.message'],workspace_id:config.anthropicWorkspaceId},{signal}),
    list: async function* (sessionId) { for await (const event of client.beta.sessions.events.list(sessionId,{workspace_id:config.anthropicWorkspaceId})) yield event as AgentEvent; },
    status: async sessionId => (await client.beta.sessions.retrieve(sessionId,{workspace_id:config.anthropicWorkspaceId})).status,
  };
}
export async function persistAgentEvent(pool: Pool, roomId: string, sessionId: string, event: AgentEvent): Promise<boolean> {
  if (event.type !== 'agent.message' || !event.id) return false;
  const text = (event.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('\n').trim();
  if (!text) return false;
  const storedText = text.length > 65536 ? `${text.slice(0,65480)}\n\n[Agent reply truncated at the room limit]` : text;
  return transaction(pool, async client => {
    const room = await client.query('SELECT id FROM rooms WHERE id=$1 AND provider_session_id=$2 FOR UPDATE', [roomId,sessionId]);
    if (!room.rowCount) return false;
    const receipt = await client.query(`INSERT INTO provider_event_receipts(session_id,event_id,room_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id`, [sessionId,event.id,roomId]);
    if (!receipt.rowCount) return false;
    const seq = await client.query(`UPDATE rooms SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence-1 AS sequence`, [roomId]);
    const message = await client.query(`INSERT INTO messages(room_id,sequence,role,text,provider_event_id) VALUES($1,$2,'assistant',$3,$4) RETURNING id`, [roomId,seq.rows[0].sequence,storedText,event.id]);
    await client.query(`SELECT pg_notify('joystick_messages',$1)`, [JSON.stringify({roomId,messageId:message.rows[0].id})]);
    return true;
  });
}
export async function recoverInterruptedDispatches(pool:Pool):Promise<number> {
  const result=await pool.query(`UPDATE agent_dispatches SET status='uncertain',error='Worker stopped during provider dispatch',updated_at=now() WHERE status='sending' RETURNING id`);
  return result.rowCount ?? 0;
}
export async function dispatchNext(pool: Pool, config: Config, client: ManagedAgentClient): Promise<boolean> {
  if (!agentAvailable(config)) return false;
  const job = await transaction(pool, async db => {
    const found = await db.query(`SELECT d.id,d.room_id,d.message_id,m.text,r.provider_session_id FROM agent_dispatches d JOIN messages m ON m.id=d.message_id JOIN rooms r ON r.id=d.room_id WHERE d.status='pending' AND NOT EXISTS (SELECT 1 FROM agent_dispatches other WHERE other.room_id=d.room_id AND other.status IN ('sending','sent','uncertain')) ORDER BY d.created_at FOR UPDATE OF d,r SKIP LOCKED LIMIT 1`);
    if (!found.rowCount) return null;
    // Recheck after locking the room: the first query's snapshot may predate another worker's commit.
    const active=await db.query(`SELECT 1 FROM agent_dispatches WHERE room_id=$1 AND id<>$2 AND status IN ('sending','sent','uncertain') LIMIT 1`,[found.rows[0].room_id,found.rows[0].id]);
    if (active.rowCount) return null;
    await db.query(`UPDATE agent_dispatches SET status='sending',updated_at=now() WHERE id=$1`, [found.rows[0].id]);
    return found.rows[0] as {id:string;room_id:string;message_id:string;text:string;provider_session_id:string|null};
  });
  if (!job) return false;
  let sessionId = job.provider_session_id;
  let stream: AsyncIterable<AgentEvent> | undefined;
  try {
    if (!sessionId) {
      const session = await client.create({agent:config.anthropicAgentId!,environment_id:config.anthropicEnvironmentId!,initial_events:[{type:'user.message',content:[{type:'text',text:job.text}]}],metadata:{joystick_room_id:job.room_id,joystick_message_id:job.message_id}});
      sessionId = session.id;
      await transaction(pool, async db => {
        await db.query(`UPDATE rooms SET provider_session_id=$2 WHERE id=$1 AND provider_session_id IS NULL`, [job.room_id,sessionId]);
        await db.query(`UPDATE agent_dispatches SET status='sent',provider_session_id=$2,updated_at=now() WHERE id=$1`, [job.id,sessionId]);
      });
    } else {
      stream = await client.stream(sessionId,AbortSignal.timeout(20_000));
      await client.send(sessionId,job.text);
      await pool.query(`UPDATE agent_dispatches SET status='sent',provider_session_id=$2,updated_at=now() WHERE id=$1`, [job.id,sessionId]);
    }
    await consumeStream(pool,client,job.room_id,sessionId,stream);
    await refreshDispatchStatus(pool,client,job.room_id,sessionId);
  } catch (error) {
    const status = await pool.query('SELECT status FROM agent_dispatches WHERE id=$1', [job.id]);
    // A failed request may have reached Anthropic. Never dispatch it again automatically.
    if (status.rows[0]?.status === 'sending') await pool.query(`UPDATE agent_dispatches SET status='uncertain',error=$2,updated_at=now() WHERE id=$1`, [job.id,String(error)]);
  }
  return true;
}
export async function reconcileSession(pool: Pool, client: ManagedAgentClient, roomId:string, sessionId:string) {
  for await (const event of client.list(sessionId)) await persistAgentEvent(pool,roomId,sessionId,event);
  await refreshDispatchStatus(pool,client,roomId,sessionId);
}
export async function refreshDispatchStatus(pool:Pool,client:ManagedAgentClient,roomId:string,sessionId:string) {
  const status=await client.status(sessionId);
  if (status==='idle') await pool.query(`UPDATE agent_dispatches SET status='completed',updated_at=now() WHERE room_id=$1 AND provider_session_id=$2 AND status='sent'`,[roomId,sessionId]);
  if (status==='terminated') await pool.query(`UPDATE agent_dispatches SET status='uncertain',error='Managed session terminated',updated_at=now() WHERE room_id=$1 AND provider_session_id=$2 AND status='sent'`,[roomId,sessionId]);
}
export async function consumeStream(pool: Pool, client: ManagedAgentClient, roomId:string, sessionId:string, supplied?:AsyncIterable<AgentEvent>) {
  const stream = supplied ?? await client.stream(sessionId,AbortSignal.timeout(20_000));
  const fragments = new Map<string,string>();
  let lastFlush = Date.now();
  async function flush() {
    for (const [messageId,text] of fragments) {
      let chunk='';
      for (const character of text) {
        const next=chunk+character;
        if (Buffer.byteLength(JSON.stringify({roomId,messageId,text:next}))>7000 && chunk) {
          try { await pool.query(`SELECT pg_notify('joystick_previews',$1)`,[JSON.stringify({roomId,messageId,text:chunk})]); } catch { /* Preview is optional. */ }
          chunk=character;
        } else chunk=next;
      }
      if (chunk) try { await pool.query(`SELECT pg_notify('joystick_previews',$1)`,[JSON.stringify({roomId,messageId,text:chunk})]); } catch { /* Preview is optional. */ }
    }
    fragments.clear();
    lastFlush=Date.now();
  }
  try {
    for await (const event of stream) {
      if (event.type === 'event_delta' && event.event_id && event.delta?.type === 'content_delta' && event.delta.content?.type === 'text' && event.delta.content.text) {
        fragments.set(event.event_id,(fragments.get(event.event_id) ?? '')+event.delta.content.text);
        if (Date.now()-lastFlush >= 50 || (fragments.get(event.event_id)?.length ?? 0) >= 1024) await flush();
      } else if (event.type === 'agent.message') {
        await flush();
        await persistAgentEvent(pool,roomId,sessionId,event);
      } else if (event.type === 'session.status_idle' || event.type === 'session.thread_status_idle') break;
    }
  } catch { /* A timed out stream is recovered from authoritative provider history. */ }
  await flush();
  await reconcileSession(pool,client,roomId,sessionId);
}
