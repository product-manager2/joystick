import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db.js';
import { requireUser, ApiError } from '../auth.js';
import { applyGameAction, getGameSnapshot } from './service.js';
import type { GameActionInput } from '../../contracts/game.js';
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
    const id=(request.params as {artifactId:string}).artifactId;
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new ApiError(404,'not_found','Artifact not found');
    const row=await pool.query(`SELECT a.content,a.title,a.content_type FROM game_artifacts a JOIN game_quests q ON q.id=a.quest_id JOIN game_memberships m ON m.mission_id=q.mission_id WHERE a.id=$1 AND m.user_id=$2`,[id,user.id]);
    if(!row.rowCount)throw new ApiError(404,'not_found','Artifact not found');
    reply.header('Content-Type',row.rows[0].content_type).header('Content-Disposition',`attachment; filename="artifact.txt"`).header('X-Content-Type-Options','nosniff');
    return reply.send(row.rows[0].content);
  });
  app.get('/api/v1/game/credits.csv',async(request,reply)=>{
    const user=await requireUser(pool,request);
    const rows=await pool.query(`SELECT l.created_at,l.kind,l.amount,l.metadata,l.mission_id,l.quest_id,q.stage_id FROM game_ledger l LEFT JOIN game_quests q ON q.id=l.quest_id WHERE l.user_id=$1 ORDER BY l.created_at,l.id`,[user.id]);
    const csv=['date,kind,test_credits,simulated_amount,mission_id,stage_id,quest_id',...rows.rows.map(r=>[new Date(r.created_at).toISOString(),r.kind,r.amount,r.metadata?.simulatedAmount??'',r.mission_id??'',r.stage_id??'',r.quest_id??''].join(','))].join('\n');
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="joystick-test-credits.csv"').header('X-Content-Type-Options','nosniff');
    return csv;
  });
}
