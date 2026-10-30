import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Pool, Client } from './db.js';
import { transaction } from './db.js';
import type { Config } from './config.js';
import type { User } from '../contracts/chat.js';

const sessionCookie = 'joystick_session';
const challengeCookie = 'joystick_challenge';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const normalizedUsername = (input: unknown) => typeof input === 'string' ? input.trim().replace(/^@/,'').toLowerCase() : '';
const validUsername = (value: string) => /^[a-z0-9_]{3,20}$/.test(value);
const USER_FIELDS = 'id,username,email,name';
// Older accounts may still sign in or recover with their email.
async function accountFor(db:Pool|Client,input:unknown,lock=false){
  const key=normalizedUsername(input);
  if(!validUsername(key)&&!validEmail(key))return null;
  const r=await db.query(`SELECT ${USER_FIELDS} FROM users WHERE ${validUsername(key)?'username':'email'}=$1${lock?' FOR UPDATE':''}`,[key]);
  return (r.rows[0] as User|undefined)??null;
}
const ADJECTIVES=['brave','swift','quiet','bright','bold','lucky','sunny','cosmic','clever','mighty','gentle','wild','nimble','steady','curious','jolly'];
const NOUNS=['otter','falcon','comet','maple','tiger','pixel','rocket','koala','ember','orbit','panda','river','fox','quasar','sparrow','beacon'];
export async function usernameSuggestions(pool:Pool,count=4){
  const pick=<T>(xs:T[])=>xs[randomBytes(1)[0]%xs.length];
  const candidates=new Set<string>();
  while(candidates.size<count*3)candidates.add(`${pick(ADJECTIVES)}_${pick(NOUNS)}${randomBytes(1)[0]%90+10}`);
  const taken=new Set((await pool.query('SELECT username FROM users WHERE username=ANY($1)',[[...candidates]])).rows.map(r=>r.username));
  return [...candidates].filter(c=>!taken.has(c)).slice(0,count);
}

export class ApiError extends Error { constructor(public statusCode: number, public code: string, message: string) { super(message); } }
export function cookieOptions(config: Config, maxAge: number) { return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' as const, path: '/', maxAge }; }
export function sessionHashForRequest(request:FastifyRequest):string|null {
  const raw=request.cookies?.[sessionCookie];
  return raw ? sha(raw) : null;
}
export async function userForSessionHash(pool:Pool,sessionHash:string):Promise<User|null> {
  const result = await pool.query(`SELECT u.id,u.username,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [sessionHash]);
  return result.rows[0] ?? null;
}
export async function userForRequest(pool: Pool, request: FastifyRequest): Promise<User | null> {
  const sessionHash=sessionHashForRequest(request);
  return sessionHash ? userForSessionHash(pool,sessionHash) : null;
}
export async function consumeWsTicket(pool:Pool,ticket:string,origin:string):Promise<{sessionHash:string;user:User}> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new ApiError(401,'invalid_ticket','WebSocket ticket invalid');
  const result=await pool.query(`DELETE FROM ws_tickets WHERE ticket_hash=$1 AND origin=$2 AND expires_at>now() RETURNING session_token_hash`,[sha(ticket),origin]);
  if (!result.rowCount) throw new ApiError(401,'invalid_ticket','WebSocket ticket expired or already used');
  const sessionHash=result.rows[0].session_token_hash as string;
  const user=await userForSessionHash(pool,sessionHash);
  if (!user) throw new ApiError(401,'unauthorized','Session expired');
  return {sessionHash,user};
}
export async function requireUser(pool: Pool, request: FastifyRequest): Promise<User> {
  const user = await userForRequest(pool, request);
  if (!user) throw new ApiError(401, 'unauthorized', 'Sign in required');
  return user;
}
async function issueSession(pool: Pool, reply: FastifyReply, config: Config, userId: string) {
  const raw = token();
  await pool.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`, [sha(raw), userId]);
  reply.setCookie(sessionCookie, raw, cookieOptions(config, 30 * 86400));
}
type LoginKey={id:string;public_key:Buffer;counter:string|number;transports:NonNullable<Parameters<typeof verifyAuthenticationResponse>[0]['credential']['transports']>};
export async function finalizePasskeyLogin(pool:Pool,userId:string|null,credentialId:string,sessionToken:string,verify:(key:LoginKey)=>Promise<number>):Promise<User>{
  return transaction(pool,async client=>{
    // A passkey-picker sign-in names no account up front; the passkey decides which one.
    const owner=userId??(await client.query('SELECT user_id FROM passkeys WHERE id=$1',[credentialId])).rows[0]?.user_id;
    if(!owner)throw new ApiError(400,'invalid_passkey','Passkey is not registered to this account');
    // Recovery, credential changes, and login all serialize on the account row.
    const account=await client.query(`SELECT ${USER_FIELDS} FROM users WHERE id=$1 FOR UPDATE`,[owner]);
    if(!account.rowCount)throw new ApiError(400,'invalid_passkey','Passkey is not registered to this account');
    const user=account.rows[0] as User;
    const key=await client.query('SELECT id,public_key,counter,transports FROM passkeys WHERE id=$1 AND user_id=$2 FOR UPDATE',[credentialId,user.id]);
    if(!key.rowCount)throw new ApiError(400,'invalid_passkey','Passkey is not registered to this account');
    const counter=await verify(key.rows[0] as LoginKey);
    await client.query('UPDATE passkeys SET counter=$2 WHERE id=$1',[credentialId,counter]);
    await client.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[sha(sessionToken),user.id]);
    return user;
  });
}
async function saveChallenge(pool: Pool, reply: FastifyReply, config: Config, challenge: string, kind: 'register'|'login'|'reauth'|'add_passkey', userId: string|null, name?: string, passkeyId?: string, sessionHash?:string) {
  const raw = token();
  await pool.query(`INSERT INTO auth_challenges(id_hash,challenge,kind,user_id,name,passkey_id,expires_at,session_hash) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes',$7)`, [sha(raw),challenge,kind,userId,name ?? null,passkeyId ?? null,sessionHash??null]);
  reply.setCookie(challengeCookie, raw, cookieOptions(config, 300));
}
async function consumeChallenge(pool: Pool, request: FastifyRequest, reply: FastifyReply, kind: string) {
  const raw = request.cookies?.[challengeCookie];
  reply.clearCookie(challengeCookie, { path: '/' });
  if (!raw) throw new ApiError(400, 'challenge_missing', 'Passkey challenge expired');
  const result = await pool.query(`DELETE FROM auth_challenges WHERE id_hash=$1 AND kind=$2 AND expires_at>now() RETURNING challenge,user_id,name,passkey_id,session_hash`, [sha(raw),kind]);
  if (!result.rowCount) throw new ApiError(400, 'challenge_invalid', 'Passkey challenge expired or already used');
  return result.rows[0] as {challenge:string;user_id:string|null;name:string|null;passkey_id:string|null;session_hash:string|null};
}
async function managementGrant(pool:Pool,request:FastifyRequest){
  const user=await requireUser(pool,request);
  const sessionHash=sessionHashForRequest(request);
  if(!sessionHash)throw new ApiError(401,'unauthorized','Sign in required');
  const grant=await pool.query(`SELECT g.expires_at FROM auth_manage_grants g JOIN sessions s ON s.token_hash=g.session_hash WHERE g.session_hash=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND g.expires_at>now()`,[sessionHash,user.id]);
  if(!grant.rowCount)throw new ApiError(403,'reauth_required','Confirm a passkey to manage account access');
  return {user,sessionHash,manageUntil:new Date(grant.rows[0].expires_at as string).toISOString()};
}
async function assertManageGrant(client:Client,userId:string,sessionHash:string){
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const valid=await client.query(`SELECT 1 FROM auth_manage_grants g JOIN sessions s ON s.token_hash=g.session_hash WHERE g.session_hash=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND g.expires_at>now()`,[sessionHash,userId]);
  if(!valid.rowCount)throw new ApiError(403,'reauth_required','Confirm a passkey to manage account access');
}
export async function consumeRecoveryChallengeLocked(client:Client,userId:string,challengeToken:string,generation:string){
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const state=await client.query('SELECT generation FROM auth_recovery_state WHERE user_id=$1',[userId]);
  if(!state.rowCount||String(state.rows[0].generation)!==String(generation))throw new ApiError(400,'challenge_invalid','Recovery request expired');
  const consumed=await client.query(`DELETE FROM auth_challenges WHERE id_hash=$1 AND kind='recovery' AND user_id=$2 AND recovery_generation=$3 AND expires_at>now() RETURNING id_hash`,[sha(challengeToken),userId,generation]);
  if(!consumed.rowCount)throw new ApiError(400,'challenge_invalid','Recovery request expired');
}
export function registerAuthRoutes(app: FastifyInstance, pool: Pool, config: Config) {
  const ticketLimits=new Map<string,{count:number;until:number}>();
  app.get('/api/v1/me', async request => ({ user: await userForRequest(pool, request) }));
  app.post('/api/v1/ws-ticket', async request => {
    const sessionHash=sessionHashForRequest(request);
    if (!sessionHash || !await userForSessionHash(pool,sessionHash)) throw new ApiError(401,'unauthorized','Sign in required');
    const now=Date.now(); const limit=ticketLimits.get(sessionHash);
    if(limit && limit.until>now && limit.count>=30) throw new ApiError(429,'rate_limited','Too many WebSocket tickets');
    ticketLimits.set(sessionHash,limit && limit.until>now ? {count:limit.count+1,until:limit.until}:{count:1,until:now+60_000});
    const ticket=token();
    await pool.query(`DELETE FROM ws_tickets WHERE expires_at<now()`);
    await pool.query(`INSERT INTO ws_tickets(ticket_hash,session_token_hash,origin,expires_at) VALUES($1,$2,$3,now()+interval '30 seconds')`,[sha(ticket),sessionHash,config.webOrigin]);
    return {ticket};
  });
  app.get('/api/v1/auth/usernames', async () => ({ suggestions: await usernameSuggestions(pool) }));
  app.post('/api/v1/auth/register/options', async (request, reply) => {
    if (await userForRequest(pool, request)) throw new ApiError(409,'already_signed_in','Sign out before creating another account');
    const body = request.body as Record<string,unknown> | null;
    const username = normalizedUsername(body?.username);
    if (!validUsername(username)) throw new ApiError(400,'invalid_input','Pick a username: 3 to 20 letters, numbers or _');
    const existing = await pool.query('SELECT 1 FROM users WHERE username=$1', [username]);
    if (existing.rowCount) throw new ApiError(409,'username_taken','That username is taken. Try another.');
    const options = await generateRegistrationOptions({ rpName: 'Joystick', rpID: config.rpId, userName: username, userDisplayName: username, attestationType: 'none', authenticatorSelection: { userVerification: 'required', residentKey: 'required' }, supportedAlgorithmIDs: [-7,-257] });
    await saveChallenge(pool, reply, config, options.challenge, 'register', null, username);
    return { options };
  });
  app.post('/api/v1/auth/register/verify', async (request, reply) => {
    if (await userForRequest(pool, request)) throw new ApiError(409,'already_signed_in','Sign out before creating another account');
    const body = request.body as {response?:RegistrationResponseJSON} | null;
    if (!body?.response || typeof body.response !== 'object') throw new ApiError(400,'invalid_input','Passkey response required');
    const challenge = await consumeChallenge(pool, request, reply, 'register');
    let result;
    try { result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: challenge.challenge, expectedOrigin: config.webOrigin, expectedRPID: config.rpId, requireUserVerification: true }); }
    catch { throw new ApiError(400,'invalid_passkey','Passkey verification failed'); }
    if (!result.verified || !result.registrationInfo) throw new ApiError(400,'invalid_passkey','Passkey verification failed');
    const info = result.registrationInfo;
    let user: User;
    try {
      user = await transaction(pool, async client => {
        const created = await client.query(`INSERT INTO users(username,name) VALUES($1,$1) RETURNING ${USER_FIELDS}`, [challenge.name]);
        const row = created.rows[0] as User;
        await client.query(`INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)`, [info.credential.id,row.id,Buffer.from(info.credential.publicKey),info.credential.counter,info.credential.transports ?? [],info.credentialDeviceType,info.credentialBackedUp]);
        const room = await client.query(`INSERT INTO rooms(title) VALUES('My agent') RETURNING id`);
        await client.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2)`, [room.rows[0].id,row.id]);
        return row;
      });
    } catch (error) {
      if ((error as {code?:string}).code === '23505') throw new ApiError(409,'account_exists','That username or passkey is already registered');
      throw error;
    }
    await issueSession(pool, reply, config, user.id);
    return { user };
  });
  app.post('/api/v1/auth/login/options', async (request, reply) => {
    const body = request.body as Record<string,unknown> | null;
    const input = body?.username ?? body?.email;
    // No username: the device shows its saved Joystick passkeys.
    if (!normalizedUsername(input)) {
      const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required' });
      await saveChallenge(pool, reply, config, options.challenge, 'login', null);
      return { options };
    }
    const account = await accountFor(pool, input);
    const keys = account ? await pool.query(`SELECT id,transports FROM passkeys WHERE user_id=$1`, [account.id]) : null;
    if (!account || !keys?.rowCount) throw new ApiError(404,'account_not_found','No account found with that username');
    const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required', allowCredentials: keys.rows.map(row => ({id: row.id, transports: row.transports})) });
    await saveChallenge(pool, reply, config, options.challenge, 'login', account.id);
    return { options };
  });
  app.post('/api/v1/auth/login/verify', async (request, reply) => {
    const body = request.body as {response?:AuthenticationResponseJSON} | null;
    if (!body?.response || typeof body.response !== 'object' || typeof body.response.id !== 'string') throw new ApiError(400,'invalid_input','Passkey response required');
    const challenge = await consumeChallenge(pool, request, reply, 'login');
    const raw=token();
    const user = await finalizePasskeyLogin(pool,challenge.user_id,body.response.id,raw,async row=>{
      let result;
      try { result = await verifyAuthenticationResponse({ response: body.response!, expectedChallenge: challenge.challenge, expectedOrigin: config.webOrigin, expectedRPID: config.rpId, requireUserVerification: true, credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports } }); }
      catch { throw new ApiError(400,'invalid_passkey','Passkey verification failed'); }
      if (!result.verified) throw new ApiError(400,'invalid_passkey','Passkey verification failed');
      return result.authenticationInfo.newCounter;
    });
    reply.setCookie(sessionCookie,raw,cookieOptions(config,30*86400));
    return { user };
  });
  app.get('/api/v1/auth/passkeys', async request => {
    const user=await requireUser(pool,request);
    const keys=await pool.query(`SELECT id,device_type,backed_up,created_at FROM passkeys WHERE user_id=$1 ORDER BY created_at,id`,[user.id]);
    const sessionHash=sessionHashForRequest(request);
    const grant=sessionHash?await pool.query('SELECT expires_at FROM auth_manage_grants WHERE session_hash=$1 AND expires_at>now()',[sessionHash]):null;
    return {passkeys:keys.rows.map(k=>({id:k.id,deviceType:k.device_type,backedUp:k.backed_up,createdAt:k.created_at})),manageUntil:grant?.rows[0]?.expires_at??null};
  });
  app.post('/api/v1/auth/reauth/options', async (request,reply) => {
    const user=await requireUser(pool,request);const sessionHash=sessionHashForRequest(request)!;
    const keys=await pool.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[user.id]);
    if(!keys.rowCount)throw new ApiError(403,'reauth_unavailable','No passkey available');
    const options=await generateAuthenticationOptions({rpID:config.rpId,userVerification:'required',allowCredentials:keys.rows.map(k=>({id:k.id,transports:k.transports}))});
    await saveChallenge(pool,reply,config,options.challenge,'reauth',user.id,undefined,undefined,sessionHash);
    return {options};
  });
  app.post('/api/v1/auth/reauth/verify', async (request,reply) => {
    const user=await requireUser(pool,request);const sessionHash=sessionHashForRequest(request)!;
    const body=request.body as {response?:AuthenticationResponseJSON}|null;
    if(!body?.response||typeof body.response.id!=='string')throw new ApiError(400,'invalid_input','Passkey response required');
    const challenge=await consumeChallenge(pool,request,reply,'reauth');
    if(challenge.session_hash!==sessionHash||challenge.user_id!==user.id)throw new ApiError(400,'challenge_invalid','Passkey challenge expired');
    const until=await transaction(pool,async client=>{
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
      const active=await client.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',[sessionHash,user.id]);
      if(!active.rowCount)throw new ApiError(401,'unauthorized','Session expired');
      const key=await client.query('SELECT * FROM passkeys WHERE id=$1 AND user_id=$2 FOR UPDATE',[body.response!.id,user.id]);
      if(!key.rowCount)throw new ApiError(400,'invalid_passkey','Passkey verification failed');
      const k=key.rows[0];let verified;
      try{verified=await verifyAuthenticationResponse({response:body.response!,expectedChallenge:challenge.challenge,expectedOrigin:config.webOrigin,expectedRPID:config.rpId,requireUserVerification:true,credential:{id:k.id,publicKey:new Uint8Array(k.public_key),counter:Number(k.counter),transports:k.transports}});}
      catch{throw new ApiError(400,'invalid_passkey','Passkey verification failed');}
      if(!verified.verified)throw new ApiError(400,'invalid_passkey','Passkey verification failed');
      await client.query('UPDATE passkeys SET counter=$2 WHERE id=$1',[k.id,verified.authenticationInfo.newCounter]);
      const g=await client.query(`INSERT INTO auth_manage_grants(session_hash,expires_at) VALUES($1,now()+interval '5 minutes') ON CONFLICT(session_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at RETURNING expires_at`,[sessionHash]);
      return g.rows[0].expires_at;
    });
    return {manageUntil:until};
  });
  app.post('/api/v1/auth/passkeys/options',async(request,reply)=>{
    const {user,sessionHash}=await managementGrant(pool,request);
    const keys=await pool.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[user.id]);
    const options=await generateRegistrationOptions({rpName:'Joystick',rpID:config.rpId,userName:user.username,userDisplayName:user.name,attestationType:'none',authenticatorSelection:{userVerification:'required',residentKey:'preferred'},supportedAlgorithmIDs:[-7,-257],excludeCredentials:keys.rows.map(k=>({id:k.id,transports:k.transports}))});
    await saveChallenge(pool,reply,config,options.challenge,'add_passkey',user.id,undefined,undefined,sessionHash);
    return {options};
  });
  app.post('/api/v1/auth/passkeys/verify',async(request,reply)=>{
    const {user,sessionHash}=await managementGrant(pool,request);
    const body=request.body as {response?:RegistrationResponseJSON}|null;
    if(!body?.response||typeof body.response!=='object')throw new ApiError(400,'invalid_input','Passkey response required');
    const challenge=await consumeChallenge(pool,request,reply,'add_passkey');
    if(challenge.session_hash!==sessionHash||challenge.user_id!==user.id)throw new ApiError(400,'challenge_invalid','Passkey challenge expired');
    let verified;
    try{verified=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:config.webOrigin,expectedRPID:config.rpId,requireUserVerification:true});}
    catch{throw new ApiError(400,'invalid_passkey','Passkey verification failed');}
    if(!verified.verified||!verified.registrationInfo)throw new ApiError(400,'invalid_passkey','Passkey verification failed');
    const info=verified.registrationInfo;
    try{await transaction(pool,async client=>{await assertManageGrant(client,user.id,sessionHash);await client.query('INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)',[info.credential.id,user.id,Buffer.from(info.credential.publicKey),info.credential.counter,info.credential.transports??[],info.credentialDeviceType,info.credentialBackedUp]);});}
    catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(409,'passkey_exists','Passkey already registered');throw error;}
    const keys=await pool.query('SELECT id,device_type,backed_up,created_at FROM passkeys WHERE user_id=$1 ORDER BY created_at,id',[user.id]);
    return {passkeys:keys.rows.map(k=>({id:k.id,deviceType:k.device_type,backedUp:k.backed_up,createdAt:k.created_at}))};
  });
  app.post('/api/v1/auth/passkeys/:id/remove',async request=>{
    const {user,sessionHash}=await managementGrant(pool,request);
    const id=(request.params as {id:string}).id;
    return transaction(pool,async client=>{
      await assertManageGrant(client,user.id,sessionHash);
      const keys=await client.query('SELECT id FROM passkeys WHERE user_id=$1 ORDER BY id FOR UPDATE',[user.id]);
      if(keys.rows.length<=1)throw new ApiError(409,'last_passkey','Keep at least one passkey');
      if(!keys.rows.some(k=>k.id===id))throw new ApiError(404,'passkey_not_found','Passkey not found');
      await client.query('DELETE FROM passkeys WHERE id=$1 AND user_id=$2',[id,user.id]);
      const remaining=await client.query('SELECT id,device_type,backed_up,created_at FROM passkeys WHERE user_id=$1 ORDER BY created_at,id',[user.id]);
      return {passkeys:remaining.rows.map(k=>({id:k.id,deviceType:k.device_type,backedUp:k.backed_up,createdAt:k.created_at}))};
    });
  });
  app.post('/api/v1/auth/recovery-codes',async request=>{
    const {user,sessionHash}=await managementGrant(pool,request);
    const codes=Array.from({length:10},()=>randomBytes(24).toString('base64url'));
    await transaction(pool,async client=>{
      await assertManageGrant(client,user.id,sessionHash);
      await client.query(`INSERT INTO auth_recovery_state(user_id,generation) VALUES($1,1) ON CONFLICT(user_id) DO UPDATE SET generation=auth_recovery_state.generation+1`,[user.id]);
      await client.query('DELETE FROM auth_recovery_codes WHERE user_id=$1',[user.id]);
      await client.query(`DELETE FROM auth_challenges WHERE kind='recovery' AND user_id=$1`,[user.id]);
      for(const code of codes)await client.query('INSERT INTO auth_recovery_codes(code_hash,user_id) VALUES($1,$2)',[sha(code),user.id]);
    });
    return {codes};
  });
  app.post('/api/v1/auth/recovery/options',async(request,reply)=>{
    const body=request.body as {username?:unknown;email?:unknown;code?:unknown}|null;
    const code=body?.code;
    const invalid=()=>new ApiError(400,'invalid_recovery','Username or recovery code is invalid');
    if(typeof code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(code))throw invalid();
    const raw=token();
    const options=await transaction(pool,async client=>{
      const account=await accountFor(client,body?.username??body?.email,true);
      if(!account)throw invalid();
      const consumed=await client.query('DELETE FROM auth_recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING code_hash',[account.id,sha(code)]);
      if(!consumed.rowCount)throw invalid();
      const state=await client.query('SELECT generation FROM auth_recovery_state WHERE user_id=$1',[account.id]);
      if(!state.rowCount)throw invalid();
      const options=await generateRegistrationOptions({rpName:'Joystick',rpID:config.rpId,userName:account.username,userDisplayName:account.name,attestationType:'none',authenticatorSelection:{userVerification:'required',residentKey:'required'},supportedAlgorithmIDs:[-7,-257]});
      await client.query(`INSERT INTO auth_challenges(id_hash,challenge,kind,user_id,expires_at,recovery_generation) VALUES($1,$2,'recovery',$3,now()+interval '5 minutes',$4)`,[sha(raw),options.challenge,account.id,state.rows[0].generation]);
      return options;
    });
    reply.setCookie(challengeCookie,raw,cookieOptions(config,300));
    return {options};
  });
  app.post('/api/v1/auth/recovery/verify',async(request,reply)=>{
    const body=request.body as {response?:RegistrationResponseJSON}|null;
    if(!body?.response||typeof body.response!=='object')throw new ApiError(400,'invalid_input','Passkey response required');
    const challengeToken=request.cookies?.[challengeCookie];
    reply.clearCookie(challengeCookie,{path:'/'});
    if(!challengeToken)throw new ApiError(400,'challenge_invalid','Recovery request expired');
    const pending=await pool.query(`SELECT challenge,user_id,recovery_generation FROM auth_challenges WHERE id_hash=$1 AND kind='recovery' AND expires_at>now()`,[sha(challengeToken)]);
    if(!pending.rowCount)throw new ApiError(400,'challenge_invalid','Recovery request expired');
    const challenge=pending.rows[0] as {challenge:string;user_id:string|null;recovery_generation:string};
    let verified;
    try{verified=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:config.webOrigin,expectedRPID:config.rpId,requireUserVerification:true});}
    catch{throw new ApiError(400,'invalid_passkey','Passkey verification failed');}
    if(!verified.verified||!verified.registrationInfo)throw new ApiError(400,'invalid_passkey','Passkey verification failed');
    const info=verified.registrationInfo;
    const raw=token();
    let user:User;
    try{user=await transaction(pool,async client=>{
      const account=await client.query(`SELECT ${USER_FIELDS} FROM users WHERE id=$1 FOR UPDATE`,[challenge.user_id]);
      if(!account.rowCount)throw new ApiError(400,'invalid_recovery','Recovery request expired');
      const u=account.rows[0] as User;
      await consumeRecoveryChallengeLocked(client,u.id,challengeToken,challenge.recovery_generation);
      const existing=await client.query('SELECT 1 FROM passkeys WHERE id=$1',[info.credential.id]);
      if(existing.rowCount)throw new ApiError(400,'invalid_passkey','Register a new passkey');
      await client.query('DELETE FROM passkeys WHERE user_id=$1',[u.id]);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[u.id]);
      await client.query('DELETE FROM auth_recovery_codes WHERE user_id=$1',[u.id]);
      await client.query('UPDATE auth_recovery_state SET generation=generation+1 WHERE user_id=$1',[u.id]);
      await client.query(`DELETE FROM auth_challenges WHERE kind='recovery' AND user_id=$1`,[u.id]);
      await client.query('INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)',[info.credential.id,u.id,Buffer.from(info.credential.publicKey),info.credential.counter,info.credential.transports??[],info.credentialDeviceType,info.credentialBackedUp]);
      await client.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[sha(raw),u.id]);
      return u;
    });}
    catch(error){if((error as {code?:string}).code==='23505')throw new ApiError(400,'invalid_passkey','Passkey already registered');throw error;}
    reply.setCookie(sessionCookie,raw,cookieOptions(config,30*86400));
    return {user};
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const raw = request.cookies?.[sessionCookie];
    if (raw) await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha(raw)]);
    reply.clearCookie(sessionCookie, { path: '/' });
    return { ok:true };
  });
}
