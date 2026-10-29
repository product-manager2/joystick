import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transaction, type Client, type Pool } from '../db.js';

type Item = Record<string, any>;
const seedPath=fileURLToPath(new URL('../../db/seed/mission-catalog.json',import.meta.url));
const questXp=(size:string)=>({S:120,M:280,L:800} as Record<string,number>)[size]??120;
const stageCatalog=(s:Item)=>({catalogTracks:s.tracks??[],plainWords:s.plainWords??'',why:s.why??'',howItFits:s.howItFits??'',doneWhen:s.doneWhen??'',approves:s.approves??'',roles:s.roles??{},sampleStatus:s.sampleStatus??''});
const planCatalog=(p:Item)=>({howItWorks:p.howItWorks??[],rolesNeeded:p.rolesNeeded??'',relations:p.relations??'',sampleStatus:p.sampleStatus??'',sampleBlocker:p.sampleBlocker??''});
const questCatalog=(q:Item)=>({where:q.where??'',fit:q.fit??'',safetyNote:q.safetyNote??'',sampleReward:q.sampleReward??'',sampleCurrency:q.sampleCurrency??'',sampleState:q.sampleState??'',detail:q.detail??{}});
const brief=(q:Item)=>({log:[],call:q.call??null,out:'',needs:q.needs??0,gain:0,back:q.back??null,catalog:questCatalog(q)});

// A catalog refresh may run against a mission that has real members and work.
// Only catalog-owned JSON and missing rows are refreshed. Workflow fields are never reset.
export async function syncGameSeedCatalog(pool:Pool,catalog:Item[]) {
  await transaction(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(745232110)');
    let changed=false;
    for(const m of catalog){
      let mr=await c.query('SELECT id FROM game_missions WHERE seed_key=$1',[m.id]);
      if(!mr.rowCount){
        mr=await c.query(`INSERT INTO game_missions(seed_key,title,pitch,tag,glyph,color,rules,seed_notice,sample) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[m.id,m.title,m.pitch,m.tag,m.glyph,m.color,JSON.stringify(m.rules),m.seedNotice,JSON.stringify(m.sample??{})]);
        changed=true;
      }else{
        // sample and notice have no owner edit action; primary mission copy does.
        const r=await c.query(`UPDATE game_missions SET sample=$2,seed_notice=$3 WHERE id=$1 AND (sample IS DISTINCT FROM $2 OR seed_notice IS DISTINCT FROM $3)`,[mr.rows[0].id,JSON.stringify(m.sample??{}),m.seedNotice]);
        changed ||= !!r.rowCount;
      }
      const mid=mr.rows[0].id as string;
      const stageIds:string[]=[];
      for(let i=0;i<m.stages.length;i++){
        const s=m.stages[i] as Item, metadata=JSON.stringify(stageCatalog(s));
        let sr=await c.query('SELECT id FROM game_stages WHERE mission_id=$1 AND ordinal=$2',[mid,i]);
        if(!sr.rowCount){
          sr=await c.query(`INSERT INTO game_stages(mission_id,ordinal,name,goal,tracks,target,unit,status,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[mid,i,s.name,s.goal??'',JSON.stringify(s.tracks??[]),s.target??1,s.unit??'results',i===0?'active':'pending',metadata]);
          changed=true;
        }else{
          const r=await c.query(`UPDATE game_stages SET metadata=$2 WHERE id=$1 AND metadata IS DISTINCT FROM $2`,[sr.rows[0].id,metadata]);
          changed ||= !!r.rowCount;
        }
        stageIds.push(sr.rows[0].id);
      }
      const planIds=new Map<string,{id:string;stageId:string}>();
      for(const p of m.strategies as Item[]){
        // A plan belongs to one stage. Other-stage catalog quests remain standalone.
        const firstQuest=(m.quests as Item[]).find(q=>q.strat===p.id&&Number.isInteger(q.stage)&&q.stage>=1&&q.stage<=stageIds.length);
        const planStage=stageIds[(firstQuest?.stage??1)-1];
        const catalogMetadata=planCatalog(p);
        let pr=await c.query('SELECT id,stage_id FROM game_plans WHERE mission_id=$1 AND seed_key=$2',[mid,p.id]);
        if(!pr.rowCount){
          pr=await c.query(`INSERT INTO game_plans(mission_id,stage_id,seed_key,name,squad,bet,status,metadata) VALUES($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id,stage_id`,[mid,planStage,p.id,p.name,p.squad,p.bet??'',JSON.stringify({color:p.color,tags:p.tags??[],rel:p.rel??[],illustrative:true,catalog:catalogMetadata})]);
          changed=true;
        }else{
          const r=await c.query(`UPDATE game_plans SET metadata=jsonb_set(metadata,'{catalog}',$2::jsonb,true) WHERE id=$1 AND metadata->'catalog' IS DISTINCT FROM $2::jsonb`,[pr.rows[0].id,JSON.stringify(catalogMetadata)]);
          changed ||= !!r.rowCount;
        }
        planIds.set(String(p.id),{id:pr.rows[0].id,stageId:pr.rows[0].stage_id});
      }
      const questIds=new Map<string,string>(),newQuests=new Set<string>();
      for(const q of m.quests as Item[]){
        const key=String(q.id),stage=stageIds[Number(q.stage)-1];
        if(!stage)throw new Error(`Invalid catalog stage for ${m.id}/${key}`);
        let qr=await c.query('SELECT id FROM game_quests WHERE mission_id=$1 AND seed_key=$2',[mid,key]);
        if(!qr.rowCount){
          const stageStatus=await c.query('SELECT status FROM game_stages WHERE id=$1',[stage]);
          // Completed history must not gain new open requirements.
          if(stageStatus.rows[0].status==='approved')continue;
          const plan=planIds.get(String(q.strat));
          qr=await c.query(`INSERT INTO game_quests(mission_id,stage_id,plan_id,seed_key,title,role,size,xp,reward_credits,brief) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[mid,stage,plan?.stageId===stage?plan.id:null,key,q.title,q.role??'user',q.size??'S',questXp(String(q.size??'S')),q.coins??0,JSON.stringify(brief(q))]);
          newQuests.add(key);changed=true;
        }else{
          const r=await c.query(`UPDATE game_quests SET brief=jsonb_set(brief,'{catalog}',$2::jsonb,true) WHERE id=$1 AND brief->'catalog' IS DISTINCT FROM $2::jsonb`,[qr.rows[0].id,JSON.stringify(questCatalog(q))]);
          changed ||= !!r.rowCount;
        }
        questIds.set(key,qr.rows[0].id);
      }
      for(const q of m.quests as Item[]){
        const key=String(q.id);
        if(!newQuests.has(key))continue;
        if(q.parent&&questIds.has(String(q.parent))){
          // Parent links may be pre-existing and user-edited; reject a new cycle.
          const parentId=questIds.get(String(q.parent))!;
          if(!await reaches(c,questIds.get(key)!,parentId))await c.query('UPDATE game_quests SET parent_id=$1 WHERE id=$2',[parentId,questIds.get(key)]);
        }
        for(const depKey of q.dependsOn??[]){
          const depId=questIds.get(String(depKey));if(!depId)continue;
          const id=questIds.get(key)!;
          if(id!==depId&&!await reaches(c,depId,id))await c.query('INSERT INTO game_quest_dependencies(quest_id,depends_on_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,depId]);
        }
      }
    }
    if(changed)await c.query('UPDATE game_revision SET revision=revision+1 WHERE id=true');
  });
}

// Edges point from a blocked quest to its prerequisite. A new edge A -> B
// would cycle when B already reaches A through dependencies or child links.
async function reaches(c:Client,from:string,to:string){
  const r=await c.query(`WITH RECURSIVE edges(from_id,to_id) AS (
    SELECT quest_id,depends_on_id FROM game_quest_dependencies
    UNION SELECT parent_id,id FROM game_quests WHERE parent_id IS NOT NULL
  ), reach(id) AS (
    SELECT to_id FROM edges WHERE from_id=$1
    UNION SELECT e.to_id FROM edges e JOIN reach r ON e.from_id=r.id
  ) SELECT 1 FROM reach WHERE id=$2 LIMIT 1`,[from,to]);
  return !!r.rowCount;
}

let seedPromise:Promise<void>|undefined;
export function ensureGameSeed(pool:Pool){
  if(!seedPromise)seedPromise=(async()=>syncGameSeedCatalog(pool,JSON.parse(await readFile(seedPath,'utf8')) as Item[]))().catch(e=>{seedPromise=undefined;throw e;});
  return seedPromise;
}
