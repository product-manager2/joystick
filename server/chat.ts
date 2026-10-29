import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import type { Message, ServerFrame, User } from '../contracts/chat.js';
import { ApiError, consumeWsTicket, requireUser, userForSessionHash } from './auth.js';
import { agentAvailable, type Config } from './config.js';
import { transaction, type Pool } from './db.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function publicMessage(row: Record<string,unknown>): Message { return { id:String(row.id),roomId:String(row.room_id),sequence:Number(row.sequence),role:row.role as 'user'|'assistant',text:String(row.text),...(row.client_id ? {clientId:String(row.client_id)} : {}),...(row.provider_event_id ? {providerEventId:String(row.provider_event_id)} : {}),createdAt:new Date(row.created_at as string).toISOString() }; }
export async function roomAllowed(pool: Pool, userId: string, roomId: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2', [roomId,userId]);
  return !!result.rowCount;
}
export async function history(pool: Pool, userId: string, roomId: string, after: number, limit = 100) {
  if (!uuid(roomId) || !Number.isSafeInteger(after) || after < 0) throw new ApiError(400,'invalid_input','Invalid room or cursor');
  if (!await roomAllowed(pool,userId,roomId)) throw new ApiError(404,'room_not_found','Room not found');
  const result = await pool.query(`SELECT id,room_id,sequence,role,text,client_id,provider_event_id,created_at FROM messages WHERE room_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3`, [roomId,after,limit+1]);
  return { messages: result.rows.slice(0,limit).map(publicMessage),hasMore:result.rows.length>limit };
}
export async function saveUserMessage(pool: Pool, userId: string, roomId: string, clientId: string, text: string, available: boolean): Promise<{message:Message;created:boolean}> {
  if (!uuid(roomId) || !uuid(clientId) || typeof text !== 'string' || !text.trim() || text.length > 4000) throw new ApiError(400,'invalid_input','Invalid message');
  const cleaned = text.trim();
  const hash = sha(cleaned);
  return transaction(pool, async client => {
    const room = await client.query(`SELECT r.id FROM rooms r JOIN room_members rm ON rm.room_id=r.id WHERE r.id=$1 AND rm.user_id=$2 FOR UPDATE OF r`, [roomId,userId]);
    if (!room.rowCount) throw new ApiError(404,'room_not_found','Room not found');
    const old = await client.query(`SELECT id,room_id,sequence,role,text,client_id,provider_event_id,created_at,request_hash FROM messages WHERE room_id=$1 AND user_id=$2 AND client_id=$3`, [roomId,userId,clientId]);
    if (old.rowCount) {
      if (old.rows[0].request_hash !== hash) throw new ApiError(409,'idempotency_conflict','Client ID was already used for different text');
      return {message:publicMessage(old.rows[0]),created:false};
    }
    const sequence = await client.query(`UPDATE rooms SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence-1 AS sequence`, [roomId]);
    const inserted = await client.query(`INSERT INTO messages(room_id,sequence,role,text,user_id,client_id,request_hash) VALUES($1,$2,'user',$3,$4,$5,$6) RETURNING id,room_id,sequence,role,text,client_id,provider_event_id,created_at`, [roomId,sequence.rows[0].sequence,cleaned,userId,clientId,hash]);
    await client.query(`INSERT INTO agent_dispatches(room_id,message_id,status) VALUES($1,$2,$3)`, [roomId,inserted.rows[0].id,available?'pending':'unavailable']);
    return {message:publicMessage(inserted.rows[0]),created:true};
  });
}
interface Subscriber { socket: WebSocket; sessionHash: string; userId: string; rooms: Set<string>; replaying: Set<string>; buffered: Map<string,Message[]> }
export function registerChatRoutes(app: FastifyInstance, pool: Pool, config: Config) {
  const subscribers = new Set<Subscriber>();
  const deliveryQueues = new Map<string,Promise<void>>();
  const sendLimits = new Map<string,{count:number;until:number}>();
  function safeSend(socket: WebSocket, frame: ServerFrame) { if (socket.readyState === 1 && socket.bufferedAmount < 512_000) socket.send(JSON.stringify(frame)); else if (socket.readyState === 1) socket.close(1013,'Slow consumer'); }
  async function emitBroadcast(message: Message, except?: WebSocket) {
    for (const subscriber of subscribers) {
      if (subscriber.socket === except || !subscriber.rooms.has(message.roomId)) continue;
      if (subscriber.replaying.has(message.roomId)) { subscriber.buffered.get(message.roomId)?.push(message); continue; }
      if (!await userForSessionHash(pool,subscriber.sessionHash) || !await roomAllowed(pool,subscriber.userId,message.roomId)) { subscriber.rooms.delete(message.roomId); continue; }
      safeSend(subscriber.socket,{type:'message.saved',message});
    }
  }
  function broadcast(message:Message,except?:WebSocket) {
    const previous=deliveryQueues.get(message.roomId) ?? Promise.resolve();
    const delivery=previous.catch(()=>{}).then(()=>emitBroadcast(message,except));
    deliveryQueues.set(message.roomId,delivery);
    void delivery.finally(()=>{if(deliveryQueues.get(message.roomId)===delivery) deliveryQueues.delete(message.roomId);}).catch(()=>{});
    return delivery;
  }
  app.get('/api/v1/rooms', async request => {
    const user = await requireUser(pool,request);
    const result = await pool.query(`SELECT r.id,r.title,r.kind FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.user_id=$1 ORDER BY r.created_at`, [user.id]);
    return {rooms:result.rows,agentAvailable:agentAvailable(config)};
  });
  app.get('/api/v1/rooms/:roomId/messages', async request => {
    const user = await requireUser(pool,request);
    const {roomId} = request.params as {roomId:string};
    const raw = (request.query as {after?:string}).after ?? '0';
    return history(pool,user.id,roomId,Number(raw));
  });
  app.get('/api/v1/ws', {websocket:true}, (socket, request) => {
    let subscriber:Subscriber|null=null;
    let user:User|null=null;
    let sessionHash:string|null=null;
    let heartbeat:NodeJS.Timeout|undefined;
    let authenticating=false;
    const authTimeout=setTimeout(()=>socket.close(1008,'Authentication timeout'),5000);
    socket.on('close',()=>{clearTimeout(authTimeout);if(heartbeat) clearInterval(heartbeat);if(subscriber) subscribers.delete(subscriber);});
    if (request.headers.origin !== config.webOrigin) { socket.close(1008,'Invalid origin'); return; }
    let frameQueue=Promise.resolve();
    const onMessage = async (raw:RawData) => {
      let clientId: string|undefined;
      try {
        const wire = raw.toString();
        if (Buffer.byteLength(wire) > 32768) throw new ApiError(413,'too_large','Frame too large');
        const frame = JSON.parse(wire) as Record<string,unknown>;
        if (!frame || typeof frame !== 'object') throw new ApiError(400,'invalid_input','Invalid frame');
        clientId = typeof frame.clientId === 'string' ? frame.clientId : undefined;
        if (!user || !sessionHash || !subscriber) throw new ApiError(401,'unauthorized','Authenticate first');
        const current = await userForSessionHash(pool,sessionHash);
        if (!current || current.id !== user.id) throw new ApiError(401,'unauthorized','Session changed');
        if (frame.type === 'subscribe') {
          const roomId = frame.roomId;
          const after = frame.after === undefined ? 0 : frame.after;
          if (!uuid(roomId) || typeof after !== 'number' || !Number.isSafeInteger(after) || after < 0) throw new ApiError(400,'invalid_input','Invalid subscription');
          if (!await roomAllowed(pool,user.id,roomId)) throw new ApiError(404,'room_not_found','Room not found');
          if (subscriber.rooms.has(roomId)) { safeSend(socket,{type:'subscribed',roomId}); return; }
          subscriber.rooms.add(roomId);
          subscriber.replaying.add(roomId);
          subscriber.buffered.set(roomId,[]);
          let cursor = after;
          const stopReplay=()=>{subscriber!.rooms.delete(roomId);subscriber!.replaying.delete(roomId);subscriber!.buffered.delete(roomId);};
          for (;;) {
            let page;
            try { page = await history(pool,user.id,roomId,cursor,100); }
            catch {stopReplay();socket.close(1008,'Access changed');return;}
            if (socket.readyState!==1) {stopReplay();return;}
            if (!await userForSessionHash(pool,sessionHash) || !await roomAllowed(pool,user.id,roomId)) {stopReplay();socket.close(1008,'Access changed');return;}
            for (const message of page.messages) { safeSend(socket,{type:'message.saved',message}); cursor=message.sequence; }
            if (!page.hasMore) break;
          }
          if (socket.readyState!==1) {stopReplay();return;}
          if (!await userForSessionHash(pool,sessionHash) || !await roomAllowed(pool,user.id,roomId)) {stopReplay();socket.close(1008,'Access changed');return;}
          const buffered = subscriber.buffered.get(roomId) ?? [];
          for (const message of buffered.filter(message => message.sequence > cursor).sort((a,b)=>a.sequence-b.sequence)) safeSend(socket,{type:'message.saved',message});
          subscriber.buffered.delete(roomId);
          subscriber.replaying.delete(roomId);
          safeSend(socket,{type:'subscribed',roomId});
        } else if (frame.type === 'message.send') {
          if (!uuid(frame.roomId)) throw new ApiError(400,'invalid_input','Invalid room');
          const now = Date.now();
          const limit = sendLimits.get(user.id);
          if (limit && limit.until > now && limit.count >= 30) throw new ApiError(429,'rate_limited','Too many messages');
          sendLimits.set(user.id,limit && limit.until > now ? {count:limit.count+1,until:limit.until} : {count:1,until:now+60_000});
          const result = await saveUserMessage(pool,user.id,frame.roomId,frame.clientId as string,frame.text as string,agentAvailable(config));
          safeSend(socket,{type:'message.saved',message:result.message});
          if (result.created) void broadcast(result.message,socket).catch(error=>app.log.error(error));
          if (!agentAvailable(config)) safeSend(socket,{type:'agent.status',roomId:frame.roomId,status:'unavailable',message:'Agent is not configured yet'});
        } else throw new ApiError(400,'invalid_input','Unknown frame type');
      } catch (error) {
        const issue = error instanceof ApiError ? error : new ApiError(400,'invalid_input','Unable to process frame');
        safeSend(socket,{type:'error',code:issue.code,message:issue.message,...(clientId?{clientId}:{})});
      }
    };
    const enqueue=(frame:RawData)=>{frameQueue=frameQueue.then(()=>onMessage(frame)).catch(error=>app.log.error(error));};
    const authenticate=async(raw:RawData)=>{
      if(authenticating){socket.close(1008,'Authentication already in progress');return;}
      authenticating=true;
      try {
        const wire=raw.toString();
        if(Buffer.byteLength(wire)>2048) throw new Error('Authentication frame too large');
        const frame=JSON.parse(wire) as {type?:unknown;ticket?:unknown};
        if(frame?.type!=='authenticate' || typeof frame.ticket!=='string') throw new Error('Authentication required');
        const accepted=await consumeWsTicket(pool,frame.ticket,config.webOrigin);
        if(socket.readyState!==1) return;
        sessionHash=accepted.sessionHash;
        user=accepted.user;
        subscriber={socket,sessionHash,userId:user.id,rooms:new Set(),replaying:new Set(),buffered:new Map()};
        subscribers.add(subscriber);
        clearTimeout(authTimeout);
        heartbeat=setInterval(async()=>{
          try {if(!await userForSessionHash(pool,sessionHash!)) socket.close(1008,'Session expired');else socket.ping();}
          catch {socket.close(1011,'Connection error');}
        },30_000);
        socket.off('message',authHandler);
        socket.on('message',enqueue);
        safeSend(socket,{type:'ready'});
      } catch {socket.close(1008,'Authentication failed');}
    };
    const authHandler=(raw:RawData)=>{void authenticate(raw);};
    socket.on('message',authHandler);
  });
  async function broadcastSavedById(messageId:string) {
    const result = await pool.query(`SELECT id,room_id,sequence,role,text,client_id,provider_event_id,created_at FROM messages WHERE id=$1`,[messageId]);
    if (result.rowCount) await broadcast(publicMessage(result.rows[0]));
  }
  async function broadcastPreview(roomId:string,messageId:string,text:string) {
    if (!uuid(roomId) || typeof messageId !== 'string' || typeof text !== 'string') return;
    for (const subscriber of subscribers) {
      if (!subscriber.rooms.has(roomId) || subscriber.replaying.has(roomId)) continue;
      if (!await userForSessionHash(pool,subscriber.sessionHash) || !await roomAllowed(pool,subscriber.userId,roomId)) { subscriber.rooms.delete(roomId); continue; }
      safeSend(subscriber.socket,{type:'message.delta',roomId,messageId,text});
    }
  }
  return { broadcast, broadcastSavedById, broadcastPreview };
}
