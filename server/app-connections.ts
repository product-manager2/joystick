import type { FastifyInstance } from 'fastify';
import type { Pool } from './db.js';
import type { Config } from './config.js';
import { ApiError, requireUser } from './auth.js';
import { composioAvailable, listAppConnections, startAppConnection } from './composio.js';

const upstream = (error: unknown): never => { throw new ApiError(502,'apps_unavailable',error instanceof Error ? error.message.slice(0,200) : 'Connected apps are unavailable'); };
export function registerAppConnectionRoutes(app: FastifyInstance, pool: Pool, config: Config) {
  app.get('/api/v1/apps', async request => {
    const user = await requireUser(pool,request);
    if (!composioAvailable()) return {available:false,apps:[]};
    return {available:true,apps:await listAppConnections(user.id).catch(upstream)};
  });
  app.post('/api/v1/apps/:slug/connect', async request => {
    const user = await requireUser(pool,request);
    if (!composioAvailable()) throw new ApiError(503,'apps_unavailable','Connected apps are not set up on this server');
    const slug = (request.params as {slug:string}).slug;
    if (!/^[a-z0-9_-]{1,60}$/.test(slug)) throw new ApiError(400,'invalid_input','Unknown app');
    return {redirectUrl:await startAppConnection(user.id,slug,`${config.webOrigin}/?apps=connected`).catch(upstream)};
  });
}
