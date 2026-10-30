import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transaction, type Client, type Pool } from '../db.js';

type Item = Record<string, any>;
const seedPath=fileURLToPath(new URL('../../db/seed/mission-catalog.json',import.meta.url));
const historyPath=fileURLToPath(new URL('../../db/seed/catalog-history.json',import.meta.url));
// Every value an earlier catalog shipped, per seed key. A row still holding one of these
// has not been edited by a person, so it may take the new catalog value.
export type CatalogHistory=Record<string,{mission?:Item;stages?:Record<string,Item>;plans?:Record<string,Item>;quests?:Record<string,Item>}>;
const shipped=(h:Item|undefined,field:string)=>JSON.stringify(h?.[field]??[]);
const WAS_SHIPPED=(col:string,param:number)=>`EXISTS (SELECT 1 FROM jsonb_array_elements($${param}::jsonb) e WHERE e=to_jsonb(${col}))`;
const questXp=(size:string)=>({S:120,M:280,L:800} as Record<string,number>)[size]??120;
const stageCatalog=(s:Item)=>({catalogTracks:s.tracks??[],plainWords:s.plainWords??'',why:s.why??'',howItFits:s.howItFits??'',doneWhen:s.doneWhen??'',approves:s.approves??'',roles:s.roles??{},sampleStatus:s.sampleStatus??''});
const planCatalog=(p:Item)=>({howItWorks:p.howItWorks??[],rolesNeeded:p.rolesNeeded??'',relations:p.relations??'',sampleStatus:p.sampleStatus??'',sampleBlocker:p.sampleBlocker??''});
const questCatalog=(q:Item)=>({where:q.where??'',fit:q.fit??'',safetyNote:q.safetyNote??'',sampleReward:q.sampleReward??'',sampleCurrency:q.sampleCurrency??'',sampleState:q.sampleState??'',detail:q.detail??{}});
const brief=(q:Item)=>({log:[],call:q.call??null,out:'',needs:q.needs??0,gain:0,back:q.back??null,catalog:questCatalog(q)});

// A catalog refresh may run against a mission that has real members and work.
// Only catalog-owned JSON and missing rows are refreshed. Workflow fields are never reset.
export async function syncGameSeedCatalog(pool:Pool,catalog:Item[],history:CatalogHistory={}) {
  await transaction(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(745232110)');
    let changed=false;
    for(const m of catalog){
      const h=history[m.id]??{};
      let mr=await c.query('SELECT id FROM game_missions WHERE seed_key=$1',[m.id]);
      if(!mr.rowCount){
        mr=await c.query(`INSERT INTO game_missions(seed_key,title,pitch,tag,glyph,color,rules,seed_notice,sample) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[m.id,m.title,m.pitch,m.tag,m.glyph,m.color,JSON.stringify(m.rules),m.seedNotice,JSON.stringify(m.sample??{})]);
        changed=true;
      }else{
        // sample and notice have no owner edit action; primary mission copy does.
        const r=await c.query(`UPDATE game_missions SET sample=$2,seed_notice=$3 WHERE id=$1 AND (sample IS DISTINCT FROM $2 OR seed_notice IS DISTINCT FROM $3)`,[mr.rows[0].id,JSON.stringify(m.sample??{}),m.seedNotice]);
        changed ||= !!r.rowCount;
        for(const field of ['title','pitch','rules'] as const){
          const value=field==='rules'?JSON.stringify(m.rules??[]):m[field];
          const u=await c.query(`UPDATE game_missions SET ${field}=$2 WHERE id=$1 AND ${field} IS DISTINCT FROM $2 AND ${WAS_SHIPPED(field,3)}`,[mr.rows[0].id,value,shipped(h.mission,field)]);
          changed ||= !!u.rowCount;
        }
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
          // Never-edited, unfinished stages take the new wording and target.
          for(const field of ['name','goal','target','unit'] as const){
            const value=s[field]??(field==='target'?1:field==='unit'?'results':'');
            const u=await c.query(`UPDATE game_stages SET ${field}=$2 WHERE id=$1 AND version=1 AND status<>'approved' AND ${field} IS DISTINCT FROM $2 AND ${WAS_SHIPPED(field,3)}`,[sr.rows[0].id,value,shipped(h.stages?.[String(i)],field)]);
            changed ||= !!u.rowCount;
          }
        }
        stageIds.push(sr.rows[0].id);
      }
      const planIds=new Map<string,{id:string;stageId:string}>();
      for(const p of m.strategies as Item[]){
        // A plan belongs to one stage. Other-stage catalog quests remain standalone.
        const firstQuest=(m.quests as Item[]).find(q=>q.strat===p.id&&Number.isInteger(q.stage)&&q.stage>=1&&q.stage<=stageIds.length);
        const planStage=stageIds[(firstQuest?.stage??1)-1];
        const catalogMetadata=planCatalog(p);
        let pr:{rows:Item[];rowCount:number|null}=await c.query('SELECT id,stage_id FROM game_plans WHERE mission_id=$1 AND seed_key=$2',[mid,p.id]);
        if(!pr.rowCount){
          pr=await c.query(`INSERT INTO game_plans(mission_id,stage_id,seed_key,name,squad,bet,status,metadata) VALUES($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id,stage_id`,[mid,planStage,p.id,p.name,p.squad,p.bet??'',JSON.stringify({color:p.color,tags:p.tags??[],rel:p.rel??[],illustrative:true,catalog:catalogMetadata})]);
          changed=true;
        }else{
          const r=await c.query(`UPDATE game_plans SET metadata=jsonb_set(metadata,'{catalog}',$2::jsonb,true) WHERE id=$1 AND metadata->'catalog' IS DISTINCT FROM $2::jsonb`,[pr.rows[0].id,JSON.stringify(catalogMetadata)]);
          changed ||= !!r.rowCount;
          for(const field of ['name','squad','bet'] as const){
            const u=await c.query(`UPDATE game_plans SET ${field}=$2 WHERE id=$1 AND version=1 AND ${field} IS DISTINCT FROM $2 AND ${WAS_SHIPPED(field,3)}`,[pr.rows[0].id,p[field]??'',shipped(h.plans?.[String(p.id)],field)]);
            changed ||= !!u.rowCount;
          }
          // Early seeds put every plan in stage 1. Move an untouched plan nobody has joined, backed or funded.
          if(pr.rows[0].stage_id!==planStage){
            const u=await c.query(`UPDATE game_plans p SET stage_id=$2 WHERE p.id=$1 AND p.version=1 AND p.status='active' AND p.creator_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM game_plan_memberships WHERE plan_id=p.id) AND NOT EXISTS (SELECT 1 FROM game_plan_backers WHERE plan_id=p.id)
              AND NOT EXISTS (SELECT 1 FROM game_funding WHERE plan_id=p.id) AND NOT EXISTS (SELECT 1 FROM game_merge_proposals WHERE source_plan_id=p.id OR target_plan_id=p.id)
              AND NOT EXISTS (SELECT 1 FROM game_quests q WHERE q.plan_id=p.id AND (q.state<>'open' OR q.claimed_by IS NOT NULL OR q.version>1))
              RETURNING id,stage_id`,[pr.rows[0].id,planStage]);
            if(u.rowCount){pr=u;changed=true;}
          }
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
          if(await upgradeQuest(c,qr.rows[0].id,q,stage,planIds,h.quests?.[key]))changed=true;
        }
        questIds.set(key,qr.rows[0].id);
      }
      for(const q of m.quests as Item[]){
        const key=String(q.id);
        if(!newQuests.has(key)&&!await untouchedQuest(c,questIds.get(key)))continue;
        if(q.parent&&questIds.has(String(q.parent))){
          // Parent links may be pre-existing and user-edited; reject a new cycle.
          const parentId=questIds.get(String(q.parent))!;
          if(!await reaches(c,questIds.get(key)!,parentId))await c.query('UPDATE game_quests SET parent_id=$1 WHERE id=$2',[parentId,questIds.get(key)]);
        }
        for(const depKey of q.dependsOn??[]){
          const depId=questIds.get(String(depKey));if(!depId)continue;
          const id=questIds.get(key)!;
          if(id!==depId&&!await reaches(c,depId,id)){const r=await c.query('INSERT INTO game_quest_dependencies(quest_id,depends_on_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,depId]);changed ||= !!r.rowCount;}
        }
      }
    }
    if(changed)await c.query('UPDATE game_revision SET revision=revision+1 WHERE id=true');
  });
}

const UNTOUCHED=`q.version=1 AND q.state='open' AND q.claimed_by IS NULL AND NOT EXISTS (SELECT 1 FROM game_artifacts WHERE quest_id=q.id)`;
async function untouchedQuest(c:Client,id:string|undefined){
  if(!id)return false;
  return !!(await c.query(`SELECT 1 FROM game_quests q WHERE q.id=$1 AND ${UNTOUCHED}`,[id])).rowCount;
}

// A seeded quest nobody has claimed or edited takes the new catalog copy, and moves to
// its catalog stage when it still sits where an earlier catalog put it.
async function upgradeQuest(c:Client,id:string,q:Item,stage:string,planIds:Map<string,{id:string;stageId:string}>,h:Item|undefined){
  const row=(await c.query(`SELECT q.stage_id,q.plan_id,s.ordinal FROM game_quests q JOIN game_stages s ON s.id=q.stage_id WHERE q.id=$1 AND ${UNTOUCHED} AND NOT EXISTS (SELECT 1 FROM game_quests k WHERE k.parent_id=q.id)`,[id])).rows[0];
  if(!row)return false;
  let changed=false;
  for(const field of ['title','role','size'] as const){
    const value=q[field]??(field==='role'?'user':field==='size'?'S':'');
    const extra=field==='size'?`,xp=${questXp(String(value))}`:'';
    const u=await c.query(`UPDATE game_quests q SET ${field}=$2${extra} WHERE q.id=$1 AND ${field} IS DISTINCT FROM $2 AND ${WAS_SHIPPED(field,3)}`,[id,value,shipped(h,field)]);
    changed ||= !!u.rowCount;
  }
  let target=row.stage_id as string;
  const shippedStages=(h?.stage??[]) as number[];
  if(row.stage_id!==stage&&shippedStages.includes(row.ordinal+1)){
    const st=await c.query(`SELECT 1 FROM game_stages WHERE id=$1 AND status<>'approved'`,[stage]);
    if(st.rowCount)target=stage;
  }
  const plan=planIds.get(String(q.strat));
  const planId=plan?.stageId===target?plan.id:null;
  if(target!==row.stage_id||(planId!==row.plan_id&&(row.plan_id===null||row.plan_id===plan?.id))){
    await c.query('UPDATE game_quests SET stage_id=$2,plan_id=$3 WHERE id=$1',[id,target,row.plan_id===null||row.plan_id===plan?.id?planId:row.plan_id]);
    changed=true;
  }
  return changed;
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
  if(!seedPromise)seedPromise=(async()=>syncGameSeedCatalog(pool,JSON.parse(await readFile(seedPath,'utf8')) as Item[],JSON.parse(await readFile(historyPath,'utf8')) as CatalogHistory))().catch(e=>{seedPromise=undefined;throw e;});
  return seedPromise;
}
