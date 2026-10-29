import type { Pool } from '../db.js';
import { ApiError } from '../auth.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getGameArtifact(pool: Pool, userId: string, id: string) {
  if (!uuid.test(id)) throw new ApiError(404, 'not_found', 'Artifact not found');
  const row = await pool.query(`SELECT a.content,a.title,a.content_type FROM game_artifacts a JOIN game_quests q ON q.id=a.quest_id JOIN game_memberships m ON m.mission_id=q.mission_id WHERE a.id=$1 AND m.user_id=$2`, [id,userId]);
  if (!row.rowCount) throw new ApiError(404, 'not_found', 'Artifact not found');
  return {content: row.rows[0].content as Buffer, title: String(row.rows[0].title), contentType: String(row.rows[0].content_type)};
}

export async function getCreditsCsv(pool: Pool, userId: string) {
  const rows=await pool.query(`SELECT l.created_at,l.kind,l.amount,l.metadata,l.mission_id,l.quest_id,q.stage_id FROM game_ledger l LEFT JOIN game_quests q ON q.id=l.quest_id WHERE l.user_id=$1 ORDER BY l.created_at,l.id`,[userId]);
  return ['date,kind,test_credits,simulated_amount,mission_id,stage_id,quest_id',...rows.rows.map(r=>[new Date(r.created_at).toISOString(),r.kind,r.amount,r.metadata?.simulatedAmount??'',r.mission_id??'',r.stage_id??'',r.quest_id??''].join(','))].join('\n');
}
