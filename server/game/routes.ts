import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db.js';
import { requireUser, ApiError } from '../auth.js';
import { applyGameAction, getGameSnapshot } from './service.js';
import type { GameActionInput } from '../../contracts/game.js';
import { getGameArtifact, getCreditsCsv } from './exports.js';
export function registerGameRoutes(app:FastifyInstance,pool:Pool){
  app.get('/api/v1/game',async request=>getGameSnapshot(pool,(await requireUser(pool,request)).id));
  app.post('/api/v1/game/actions',{bodyLimit:300_000},async request=>{
    const user=await requireUser(pool,request);
    const body=request.body as GameActionInput|null;
    if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'invalid_input','Invalid action');
    const snapshot=await applyGameAction(pool,user.id,body);
    return {revision:snapshot.revision,snapshot};
  });
  app.get('/api/v1/game/artifacts/:artifactId',async(request,reply)=>{
    const user=await requireUser(pool,request);
    const artifact=await getGameArtifact(pool,user.id,(request.params as {artifactId:string}).artifactId);
    reply.header('Content-Type',artifact.contentType).header('Content-Disposition',`attachment; filename="artifact.txt"`).header('X-Content-Type-Options','nosniff');
    return reply.send(artifact.content);
  });
  app.get('/api/v1/game/credits.csv',async(request,reply)=>{
    const user=await requireUser(pool,request);
    const csv=await getCreditsCsv(pool,user.id);
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="joystick-test-credits.csv"').header('X-Content-Type-Options','nosniff');
    return csv;
  });
  app.get('/api/v1/game/credits.json',async(request,reply)=>{
    const user=await requireUser(pool,request);
    const snapshot=await getGameSnapshot(pool,user.id);
    reply.header('Content-Type','application/json; charset=utf-8').header('Content-Disposition','attachment; filename="joystick-test-credits.json"').header('X-Content-Type-Options','nosniff');
    return {kind:'test-credits',exportedAt:new Date().toISOString(),userId:user.id,wallet:snapshot.wallet};
  });
}
