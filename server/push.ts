import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import { ApiError, requireUser, sessionHashForRequest } from './auth.js';
import { pushAvailable, type Config } from './config.js';
import { transaction, type Pool } from './db.js';
import { canAccessGameRoom } from './game/service.js';

const sha = (value:string) => createHash('sha256').update(value).digest('hex');
const key = (value:unknown, max:number) => typeof value==='string' && value.length<=max && /^[A-Za-z0-9_-]+={0,2}$/.test(value);
const uuid = (value:unknown) => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validPushEndpoint(value:unknown): value is string {
  if(typeof value!=='string' || value.length>2048) return false;
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' || url.username || url.password || url.port || url.hash || !url.pathname.startsWith('/'))return false;
    const host=url.hostname.toLowerCase();
    return host==='web.push.apple.com' || host==='fcm.googleapis.com' || host==='updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com');
  } catch { return false; }
}

type IncomingSubscription={endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
export function parseSubscription(body:unknown):{endpoint:string;p256dh:string;auth:string} {
  const supplied=body as IncomingSubscription|null;
  if(!supplied || !validPushEndpoint(supplied.endpoint) || !key(supplied.keys?.p256dh,256) || !key(supplied.keys?.auth,128))throw new ApiError(400,'invalid_input','Invalid push subscription');
  const publicKey=Buffer.from(supplied.keys!.p256dh as string,'base64url');
  const authSecret=Buffer.from(supplied.keys!.auth as string,'base64url');
  if(publicKey.length!==65 || publicKey[0]!==4 || authSecret.length!==16)throw new ApiError(400,'invalid_input','Invalid push keys');
  return {endpoint:supplied.endpoint,p256dh:supplied.keys!.p256dh as string,auth:supplied.keys!.auth as string};
}

export function registerPushRoutes(app:FastifyInstance,pool:Pool,config:Config){
  app.get('/api/v1/push/config',async()=>({enabled:pushAvailable(config),publicKey:pushAvailable(config)?config.vapidPublicKey:null}));
  app.get('/api/v1/push/status',async request=>{
    const user=await requireUser(pool,request),sessionHash=sessionHashForRequest(request)!;
    const found=await pool.query('SELECT endpoint_hash FROM push_subscriptions WHERE user_id=$1 AND session_hash=$2',[user.id,sessionHash]);
    return {enabled:pushAvailable(config),publicKey:pushAvailable(config)?config.vapidPublicKey:null,subscribed:found.rows.length>0,endpointHashes:found.rows.map(row=>row.endpoint_hash)};
  });
  app.post('/api/v1/push/subscribe',async request=>{
    if(!pushAvailable(config))throw new ApiError(503,'push_unavailable','Notifications are not configured yet');
    const user=await requireUser(pool,request),sessionHash=sessionHashForRequest(request)!;
    const subscription=parseSubscription(request.body),endpointHash=sha(subscription.endpoint);
    await transaction(pool,async client=>{
      const current=await client.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',[sessionHash,user.id]);
      if(!current.rowCount)throw new ApiError(401,'unauthorized','Session expired');
      // An endpoint represents one installed app. Reassigning it removes old-account jobs.
      await client.query('DELETE FROM push_subscriptions WHERE endpoint_hash=$1',[endpointHash]);
      await client.query('INSERT INTO push_subscriptions(endpoint_hash,endpoint,p256dh,auth,user_id,session_hash) VALUES($1,$2,$3,$4,$5,$6)',[endpointHash,subscription.endpoint,subscription.p256dh,subscription.auth,user.id,sessionHash]);
    });
    return {subscribed:true};
  });
  app.post('/api/v1/push/unsubscribe',async request=>{
    const user=await requireUser(pool,request),sessionHash=sessionHashForRequest(request)!;
    const endpoint=(request.body as {endpoint?:unknown}|null)?.endpoint;
    if(!validPushEndpoint(endpoint))throw new ApiError(400,'invalid_input','Invalid push endpoint');
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint_hash=$1 AND user_id=$2 AND session_hash=$3',[sha(endpoint),user.id,sessionHash]);
    return {subscribed:false};
  });
}

export interface PushSender { send(subscription:{endpoint:string;keys:{p256dh:string;auth:string}},payload:string):Promise<void> }
export function webPushSender(config:Config):PushSender {
  if(!pushAvailable(config))throw new Error('Web Push is not configured');
  webpush.setVapidDetails(config.vapidSubject!,config.vapidPublicKey!,config.vapidPrivateKey!);
  return {send:async(subscription,payload)=>{await webpush.sendNotification(subscription,payload,{TTL:86400,timeout:10000,urgency:'normal'});}};
}

// The row lock is held through the network send so logout and unsubscribe
// serialize with the last authorization decision. A first read-cursor insert
// can race a send; the notification contains no message contents.
export async function deliverNextPush(pool:Pool,sender:PushSender):Promise<boolean>{
  return transaction(pool,async client=>{
    const found=await client.query(`SELECT d.id,d.attempts,d.message_id,d.created_at,s.id AS subscription_id,s.endpoint,s.p256dh,s.auth,s.user_id,s.session_hash,m.room_id,m.sequence,m.user_id AS sender_id
      FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN messages m ON m.id=d.message_id
      WHERE (d.status='pending' AND d.next_attempt_at<=now()) OR (d.status='sending' AND d.leased_at<now()-interval '2 minutes')
      ORDER BY d.next_attempt_at,d.created_at FOR UPDATE OF d SKIP LOCKED FOR NO KEY UPDATE OF s SKIP LOCKED LIMIT 1`);
    if(!found.rowCount)return false;
    const job=found.rows[0];
    if(new Date(job.created_at).getTime()<Date.now()-86400_000){await client.query("UPDATE push_deliveries SET status='cancelled' WHERE id=$1",[job.id]);return true;}
    const active=await client.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',[job.session_hash,job.user_id]);
    const read=await client.query('SELECT sequence FROM room_reads WHERE room_id=$1 AND user_id=$2 FOR SHARE',[job.room_id,job.user_id]);
    if(!active.rowCount || job.sender_id===job.user_id || Number(read.rows[0]?.sequence??0)>=Number(job.sequence) || !await canAccessGameRoom(client,job.user_id,job.room_id)){
      await client.query("UPDATE push_deliveries SET status='cancelled' WHERE id=$1",[job.id]);return true;
    }
    if(!uuid(job.room_id) || !validPushEndpoint(job.endpoint)){
      await client.query('DELETE FROM push_subscriptions WHERE id=$1',[job.subscription_id]);return true;
    }
    const payload=JSON.stringify({roomId:job.room_id,messageId:job.message_id});
    try {
      await sender.send({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},payload);
      await client.query("UPDATE push_deliveries SET status='sent',attempts=attempts+1,last_error=NULL WHERE id=$1",[job.id]);
    } catch(error){
      const status=(error as {statusCode?:number}).statusCode;
      if(status===404 || status===410){await client.query('DELETE FROM push_subscriptions WHERE id=$1',[job.subscription_id]);return true;}
      const attempts=Number(job.attempts)+1;
      const delay=Math.min(3600,2**Math.min(attempts,10))*1000;
      await client.query(`UPDATE push_deliveries SET status=$2,attempts=$3,next_attempt_at=now()+($4::int * interval '1 millisecond'),last_error=$5 WHERE id=$1`,[job.id,attempts>=8?'cancelled':'pending',attempts,delay,typeof status==='number'?String(status):'send_failed']);
    }
    return true;
  });
}
