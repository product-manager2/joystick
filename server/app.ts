import Fastify from 'fastify';
import { isIP } from 'node:net';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import type { Pool } from './db.js';
import type { Config } from './config.js';
import { ApiError, registerAuthRoutes } from './auth.js';
import { registerChatRoutes } from './chat.js';
import { registerGameRoutes } from './game/routes.js';
import { registerRecommendationRoutes } from './game/recommendations.js';
import { registerAgentRunRoutes } from './agent-runs/routes.js';
import { registerPushRoutes } from './push.js';

export async function buildApp(pool: Pool, config: Config) {
  const app = Fastify({logger:true,bodyLimit:16_384});
  await app.register(cookie);
  await app.register(websocket,{options:{maxPayload:32768}});
  const limits = new Map<string,{count:number;until:number}>();
  const emailLimits = new Map<string,{count:number;until:number}>();
  function consumeLimit(map:Map<string,{count:number;until:number}>,key:string,max:number) {
    const now=Date.now(); const current=map.get(key);
    if (current && current.until>now && current.count>=max) throw new ApiError(429,'rate_limited','Too many authentication attempts');
    map.set(key,current && current.until>now ? {count:current.count+1,until:current.until}:{count:1,until:now+5*60_000});
  }
  app.options('/api/v1/*',async (_request,reply)=>reply.code(204).send());
  app.addHook('onRequest',async (request,reply) => {
    if (request.url.startsWith('/api/v1/')) {
      reply.header('Vary','Origin');
      reply.header('Cache-Control','no-store');
      if (request.headers.origin === config.webOrigin) {
        reply.header('Access-Control-Allow-Origin',config.webOrigin);
        reply.header('Access-Control-Allow-Credentials','true');
        reply.header('Access-Control-Allow-Methods','GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers','Content-Type');
      }
      if (request.method === 'OPTIONS') {
        if (request.headers.origin !== config.webOrigin) throw new ApiError(403,'invalid_origin','Invalid request origin');
        const method=request.headers['access-control-request-method'];
        if (method !== 'GET' && method !== 'POST') throw new ApiError(400,'invalid_preflight','Unsupported method');
      }
    }
    if (request.method === 'POST') {
      if (request.headers.origin !== config.webOrigin) throw new ApiError(403,'invalid_origin','Invalid request origin');
      if (request.url.startsWith('/api/v1/auth/')) {
        const header=request.headers['fly-client-ip'];
        const clientIp=config.flyMode && typeof header==='string' && header.length<=45 && isIP(header) ? header : request.ip;
        consumeLimit(limits,clientIp,config.httpProxyMode==='vercel' || (config.flyMode && clientIp===request.ip) ? 300 : 20);
      }
    }
  });
  app.addHook('preHandler',async request => {
    if (request.method !== 'POST' || !request.url.startsWith('/api/v1/auth/')) return;
    const body=request.body as {email?:unknown;username?:unknown}|null;
    const account=body?.username??body?.email;
    if (typeof account==='string' && account.length<=254) consumeLimit(emailLimits,account.trim().toLowerCase(),20);
  });
  app.setErrorHandler((error,request,reply) => {
    const issue = error instanceof ApiError ? error : null;
    if (!issue) request.log.error(error);
    reply.code(issue?.statusCode ?? 500).send({error:{code:issue?.code ?? 'internal_error',message:issue?.message ?? 'Unexpected server error'}});
  });
  app.get('/health',async () => { await pool.query('SELECT 1'); return {ok:true}; });
  registerAuthRoutes(app,pool,config);
  registerGameRoutes(app,pool);
  registerRecommendationRoutes(app,pool,config);
  registerAgentRunRoutes(app,pool,config);
  registerPushRoutes(app,pool,config);
  const chat = registerChatRoutes(app,pool,config);
  return {app,chat};
}
