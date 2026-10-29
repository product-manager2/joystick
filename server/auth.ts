import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Pool } from './db.js';
import { transaction } from './db.js';
import type { Config } from './config.js';
import type { User } from '../contracts/chat.js';

const sessionCookie = 'joystick_session';
const challengeCookie = 'joystick_challenge';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const normalizedEmail = (input: unknown) => typeof input === 'string' ? input.trim().toLowerCase() : '';
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validName = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 100;

export class ApiError extends Error { constructor(public statusCode: number, public code: string, message: string) { super(message); } }
export function cookieOptions(config: Config, maxAge: number) { return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' as const, path: '/', maxAge }; }
export function sessionHashForRequest(request:FastifyRequest):string|null {
  const raw=request.cookies?.[sessionCookie];
  return raw ? sha(raw) : null;
}
export async function userForSessionHash(pool:Pool,sessionHash:string):Promise<User|null> {
  const result = await pool.query(`SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [sessionHash]);
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
async function saveChallenge(pool: Pool, reply: FastifyReply, config: Config, challenge: string, kind: 'register'|'login', email: string, name?: string, passkeyId?: string) {
  const raw = token();
  await pool.query(`INSERT INTO auth_challenges(id_hash,challenge,kind,email,name,passkey_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes')`, [sha(raw),challenge,kind,email,name ?? null,passkeyId ?? null]);
  reply.setCookie(challengeCookie, raw, cookieOptions(config, 300));
}
async function consumeChallenge(pool: Pool, request: FastifyRequest, reply: FastifyReply, kind: string) {
  const raw = request.cookies?.[challengeCookie];
  reply.clearCookie(challengeCookie, { path: '/' });
  if (!raw) throw new ApiError(400, 'challenge_missing', 'Passkey challenge expired');
  const result = await pool.query(`DELETE FROM auth_challenges WHERE id_hash=$1 AND kind=$2 AND expires_at>now() RETURNING challenge,email,name,passkey_id`, [sha(raw),kind]);
  if (!result.rowCount) throw new ApiError(400, 'challenge_invalid', 'Passkey challenge expired or already used');
  return result.rows[0] as {challenge:string;email:string;name:string|null;passkey_id:string|null};
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
  app.post('/api/v1/auth/register/options', async (request, reply) => {
    if (await userForRequest(pool, request)) throw new ApiError(409,'already_signed_in','Sign out before creating another account');
    const body = request.body as Record<string,unknown> | null;
    const email = normalizedEmail(body?.email);
    const name = body?.name;
    if (!validEmail(email) || !validName(name)) throw new ApiError(400,'invalid_input','Enter a valid email and name');
    const existing = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (existing.rowCount) throw new ApiError(409,'account_exists','This email already has an account; sign in with its passkey');
    const options = await generateRegistrationOptions({ rpName: 'Joystick', rpID: config.rpId, userName: email, userDisplayName: name.trim(), attestationType: 'none', authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' }, supportedAlgorithmIDs: [-7,-257] });
    await saveChallenge(pool, reply, config, options.challenge, 'register', email, name.trim());
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
        const created = await client.query(`INSERT INTO users(email,name) VALUES($1,$2) RETURNING id,email,name`, [challenge.email,challenge.name]);
        const row = created.rows[0] as User;
        await client.query(`INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)`, [info.credential.id,row.id,Buffer.from(info.credential.publicKey),info.credential.counter,info.credential.transports ?? [],info.credentialDeviceType,info.credentialBackedUp]);
        const room = await client.query(`INSERT INTO rooms(title) VALUES('My agent') RETURNING id`);
        await client.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2)`, [room.rows[0].id,row.id]);
        return row;
      });
    } catch (error) {
      if ((error as {code?:string}).code === '23505') throw new ApiError(409,'account_exists','This email or passkey is already registered');
      throw error;
    }
    await issueSession(pool, reply, config, user.id);
    return { user };
  });
  app.post('/api/v1/auth/login/options', async (request, reply) => {
    const body = request.body as Record<string,unknown> | null;
    const email = normalizedEmail(body?.email);
    if (!validEmail(email)) throw new ApiError(400,'invalid_input','Enter a valid email');
    const keys = await pool.query(`SELECT p.id,p.transports FROM passkeys p JOIN users u ON u.id=p.user_id WHERE u.email=$1`, [email]);
    if (!keys.rowCount) throw new ApiError(404,'account_not_found','No passkey account found for this email');
    const options = await generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required', allowCredentials: keys.rows.map(row => ({id: row.id, transports: row.transports})) });
    await saveChallenge(pool, reply, config, options.challenge, 'login', email);
    return { options };
  });
  app.post('/api/v1/auth/login/verify', async (request, reply) => {
    const body = request.body as {response?:AuthenticationResponseJSON} | null;
    if (!body?.response || typeof body.response !== 'object' || typeof body.response.id !== 'string') throw new ApiError(400,'invalid_input','Passkey response required');
    const challenge = await consumeChallenge(pool, request, reply, 'login');
    const user = await transaction(pool, async client => {
      const key = await client.query(`SELECT p.*,u.id AS account_id,u.email,u.name FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND u.email=$2 FOR UPDATE OF p`, [body.response!.id,challenge.email]);
      if (!key.rowCount) throw new ApiError(400,'invalid_passkey','Passkey is not registered to this account');
      const row = key.rows[0];
      let result;
      try { result = await verifyAuthenticationResponse({ response: body.response!, expectedChallenge: challenge.challenge, expectedOrigin: config.webOrigin, expectedRPID: config.rpId, requireUserVerification: true, credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports } }); }
      catch { throw new ApiError(400,'invalid_passkey','Passkey verification failed'); }
      if (!result.verified) throw new ApiError(400,'invalid_passkey','Passkey verification failed');
      await client.query('UPDATE passkeys SET counter=$2 WHERE id=$1', [row.id,result.authenticationInfo.newCounter]);
      return { id: row.account_id, email: row.email, name: row.name } as User;
    });
    await issueSession(pool, reply, config, user.id);
    return { user };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const raw = request.cookies?.[sessionCookie];
    if (raw) await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha(raw)]);
    reply.clearCookie(sessionCookie, { path: '/' });
    return { ok:true };
  });
}
