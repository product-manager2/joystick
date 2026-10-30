import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { Config } from '../../server/config.js';
import { applyGameAction, applyGameCommand, getGameSnapshot } from '../../server/game/service.js';
import { processNextSubmissionCheck } from '../../server/game/submission-checks.js';
import { executeAgentCommand } from '../../server/agent-commands.js';
import type { GameActionInput } from '../../contracts/game.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl)throw new Error('TEST_DATABASE_URL is required for server integration tests');
const fakeConfig={aiGatewayApiKey:'fake',jevModel:'typesafe-ai/jev'} as Config;
const answer=(scores:number[])=>new Response(JSON.stringify({answers:Object.fromEntries(['deliverable','task','output'].map((key,i)=>[key,{type:'noul',noul:scores[i]}]))}),{status:200});
const fakeFetch=(scores:number[])=>async()=>answer(scores);
async function isolatedDatabase(){
  const admin=new pg.Pool({connectionString:databaseUrl});
  const schema=`submission_check_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:databaseUrl,options:`-c search_path=${schema}`});
  try{
    const directory=new URL('../../db/migrations/',import.meta.url);
    for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort())await pool.query(await readFile(new URL(name,directory),'utf8'));
  }catch(error){await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();throw error;}
  return {pool,cleanup:async()=>{await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}};
}

test('submission checks stay tied to an artifact and never mint final rewards before two human reviews',async()=>{
  const {pool,cleanup}=await isolatedDatabase();
  const oldCredits=process.env.GAME_TEST_CREDITS;process.env.GAME_TEST_CREDITS='true';
  const users:string[]=[],missions:string[]=[];
  const makeUser=async(name:string)=>{const result=await pool.query('INSERT INTO users(email,name) VALUES($1,$2) RETURNING id',[`${randomUUID()}@example.test`,name]);users.push(result.rows[0].id);return result.rows[0].id as string;};
  const action=(user:string,name:GameActionInput['action'],entityId?:string,payload?:Record<string,unknown>)=>applyGameAction(pool,user,{action:name,entityId,payload,requestId:randomUUID()});
  const questFrom=(snapshot:Awaited<ReturnType<typeof getGameSnapshot>>,missionId:string,questId:string)=>(snapshot.missions.find(m=>m.id===missionId)!.quests as any[]).find(q=>q.id===questId);
  try{
    const owner=await makeUser('Owner'),maker=await makeUser('Maker'),reviewerA=await makeUser('Reviewer A'),reviewerB=await makeUser('Reviewer B'),outsider=await makeUser('Outsider');
    const mission=(await action(owner,'mission.create',undefined,{title:'Submission check integration',stages:[{name:'Build'}]})).missions.find(m=>m.title==='Submission check integration')!;
    const mid=mission.id as string,stage=(mission.stages as any[])[0].id as string;missions.push(mid);
    for(const user of [maker,reviewerA,reviewerB])await action(user,'mission.join',mid);
    await action(owner,'funding.reserve',mid,{amount:20});
    const created=await action(owner,'quest.create',stage,{title:'Publish the report',description:'Deliver a report with data',rewardCredits:20});
    const q=(created.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='Publish the report').id as string;
    await pool.query(`UPDATE game_quests SET brief=jsonb_set(brief,'{catalog}', $2::jsonb,true) WHERE id=$1`,[q,JSON.stringify({detail:{brief:'A complete report',handIn:'Ten-row report',doneWhen:'All rows have sources'}})]);
    await action(maker,'quest.claim',q);
    const requestId=randomUUID(),submission={action:'quest.submit' as const,entityId:q,payload:{title:'Report',content:'Report with ten observations and a method.'},requestId};
    const first=await applyGameCommand(pool,maker,submission),replay=await applyGameCommand(pool,maker,submission);
    assert.deepEqual(replay,first);
    const artifactId=first.entityId!;
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_submission_checks WHERE quest_id=$1',[q])).rows[0].n,1);
    const frozen=(await pool.query('SELECT requirements FROM game_submission_checks WHERE artifact_id=$1',[artifactId])).rows[0].requirements;
    assert.deepEqual(frozen,{title:'Publish the report',description:'Deliver a report with data',expectedOutput:'',doneWhen:'All rows have sources',handIn:'Ten-row report',requestedChanges:''});
    assert.equal(questFrom(await getGameSnapshot(pool,maker),mid,q).instantCheck.status,'queued');
    assert.equal(questFrom(await getGameSnapshot(pool,outsider),mid,q).instantCheck,null);
    assert.equal(await processNextSubmissionCheck(pool,fakeConfig,{fetch:fakeFetch([.9,.9,.9])}),true);
    const passed=await getGameSnapshot(pool,maker),check=questFrom(passed,mid,q).instantCheck;
    assert.equal(check.status,'passed');assert.equal(check.artifactId,artifactId);assert.ok(check.provisionalTokens>0);
    assert.equal((passed.wallet.pendingMissionTokens as any[]).find(x=>x.missionId===mid).amount,check.provisionalTokens);
    assert.equal((passed.wallet.missionTokens as any[]).find(x=>x.missionId===mid),undefined);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM game_token_ledger WHERE source_type='quest' AND source_id=$1`,[q])).rows[0].n,0);
    assert.equal(passed.profile.xp,0);assert.equal(passed.wallet.balance,1000);
    await assert.rejects(()=>action(reviewerA,'quest.review',q,{artifactId:randomUUID(),verdict:'approve'}),/Action is not allowed/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_reviews WHERE quest_id=$1',[q])).rows[0].n,0);
    await assert.rejects(()=>applyGameCommand(pool,reviewerA,{action:'quest.review',entityId:q,payload:{artifactId,verdict:'approve'},requestId:randomUUID()},'agent'),/Open the task/);
    const handoff=await executeAgentCommand(pool,{} as Config,reviewerA,{command:'quest.review',entityId:q},randomUUID());
    assert.equal(handoff.handoff?.type,'navigate');if(handoff.handoff?.type==='navigate')assert.equal(handoff.handoff.screen,'quest');
    await action(reviewerA,'quest.review',q,{artifactId,verdict:'approve'});
    assert.equal((await getGameSnapshot(pool,maker)).wallet.balance,1000);
    await action(reviewerB,'quest.review',q,{artifactId,verdict:'approve'});
    const final=await getGameSnapshot(pool,maker);
    assert.equal(questFrom(final,mid,q).state,'approved');
    assert.equal((final.wallet.pendingMissionTokens as any[]).find(x=>x.missionId===mid),undefined);
    assert.equal((final.wallet.missionTokens as any[]).find(x=>x.missionId===mid).balance,check.provisionalTokens);
    assert.equal(final.wallet.balance,1020);assert.equal(final.profile.xp,120);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM game_token_ledger WHERE source_type='quest' AND source_id=$1`,[q])).rows[0].n,1);

    // A negative first pass permits a revised artifact, while stale reviews cannot apply to it.
    const second=await action(owner,'quest.create',stage,{title:'A second report'});
    const q2=(second.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A second report').id as string;
    await action(maker,'quest.claim',q2);
    const old=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q2,payload:{title:'Plan',content:'I will prepare a report.'},requestId:randomUUID()})).entityId!;
    await processNextSubmissionCheck(pool,fakeConfig,{fetch:fakeFetch([.1,.9,.9])});
    assert.equal(questFrom(await getGameSnapshot(pool,maker),mid,q2).instantCheck.status,'needs_attention');
    await action(reviewerA,'quest.review',q2,{artifactId:old,verdict:'changes_requested',note:'Include the completed data table.'});
    const revised=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q2,payload:{title:'Finished report',content:'Completed report with the data and method.'},requestId:randomUUID()})).entityId!;
    assert.notEqual(revised,old);
    assert.equal((await pool.query('SELECT requirements FROM game_submission_checks WHERE artifact_id=$1',[revised])).rows[0].requirements.requestedChanges,'Include the completed data table.');
    await assert.rejects(()=>action(reviewerA,'quest.review',q2,{artifactId:old,verdict:'approve'}),/Action is not allowed/);
    await processNextSubmissionCheck(pool,fakeConfig,{fetch:fakeFetch([.9,.9,.9])});
    const revisedQuest=questFrom(await getGameSnapshot(pool,maker),mid,q2);
    assert.equal(revisedQuest.instantCheck.artifactId,revised);
    assert.deepEqual(revisedQuest.artifacts.map((artifact:{id:string})=>artifact.id),[old,revised]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM game_reviews WHERE artifact_id=$1',[old])).rows[0].n,1);

    // The older provider response cannot overwrite a result committed by a newer lease.
    const third=await action(owner,'quest.create',stage,{title:'A third report'});
    const q3=(third.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A third report').id as string;
    await action(maker,'quest.claim',q3);
    const thirdArtifact=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q3,payload:{title:'Report',content:'Completed third report.'},requestId:randomUUID()})).entityId!;
    let releaseOld!:()=>void,startedOld!:()=>void;
    const oldStarted=new Promise<void>(resolve=>{startedOld=resolve;});
    const holdOld=new Promise<void>(resolve=>{releaseOld=resolve;});
    const oldWork=processNextSubmissionCheck(pool,fakeConfig,{fetch:async()=>{startedOld();await holdOld;return answer([.1,.9,.9]);}});
    await Promise.race([oldStarted,new Promise<void>((_,reject)=>setTimeout(()=>reject(new Error('Timed out waiting for the leased provider call')),5000))]);
    await pool.query(`UPDATE game_submission_checks SET lease_expires_at=now()-interval '1 second' WHERE artifact_id=$1`,[thirdArtifact]);
    await processNextSubmissionCheck(pool,fakeConfig,{fetch:fakeFetch([.9,.9,.9])});
    releaseOld();await oldWork;
    assert.equal(questFrom(await getGameSnapshot(pool,maker),mid,q3).instantCheck.status,'passed');
    assert.equal((await pool.query('SELECT attempts FROM game_submission_checks WHERE artifact_id=$1',[thirdArtifact])).rows[0].attempts,2);

    // A second expired lease is terminal and cannot become a third paid attempt.
    const fourth=await action(owner,'quest.create',stage,{title:'A fourth report'});
    const q4=(fourth.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A fourth report').id as string;
    await action(maker,'quest.claim',q4);
    const fourthArtifact=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q4,payload:{title:'Report',content:'Completed fourth report.'},requestId:randomUUID()})).entityId!;
    await pool.query(`UPDATE game_submission_checks SET status='running',attempts=2,lease_token=$2,lease_expires_at=now()-interval '1 second' WHERE artifact_id=$1`,[fourthArtifact,randomUUID()]);
    assert.equal(await processNextSubmissionCheck(pool,fakeConfig,{fetch:async()=>{throw new Error('must not call provider');}}),false);
    const terminal=await pool.query('SELECT status,attempts FROM game_submission_checks WHERE artifact_id=$1',[fourthArtifact]);
    assert.deepEqual([terminal.rows[0].status,terminal.rows[0].attempts],['unavailable',2]);

    // Revoking membership before dispatch supersedes the check without sending evidence.
    await pool.query(`UPDATE game_submission_checks SET created_at=now()-interval '2 minutes' WHERE mission_id=$1`,[mid]);
    const fifth=await action(owner,'quest.create',stage,{title:'A fifth report'});
    const q5=(fifth.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A fifth report').id as string;
    await action(maker,'quest.claim',q5);
    const fifthArtifact=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q5,payload:{title:'Report',content:'Completed fifth report.'},requestId:randomUUID()})).entityId!;
    await pool.query('DELETE FROM game_memberships WHERE mission_id=$1 AND user_id=$2',[mid,maker]);
    await processNextSubmissionCheck(pool,fakeConfig,{fetch:async()=>{throw new Error('must not send revoked submission');}});
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[fifthArtifact])).rows[0].status,'superseded');
    assert.equal(questFrom(await getGameSnapshot(pool,maker),mid,q5).instantCheck,null);

    // The budget declines only the automatic check; submission and member review still work.
    await action(maker,'mission.join',mid);
    await pool.query('UPDATE game_submission_checks SET created_at=now() WHERE mission_id=$1',[mid]);
    const sixth=await action(owner,'quest.create',stage,{title:'A sixth report'});
    const q6=(sixth.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A sixth report').id as string;
    await action(maker,'quest.claim',q6);
    const sixthArtifact=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q6,payload:{title:'Report',content:'Completed sixth report.'},requestId:randomUUID()})).entityId!;
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[sixthArtifact])).rows[0].status,'unavailable');
    await action(reviewerA,'quest.review',q6,{artifactId:sixthArtifact,verdict:'approve'});
    await action(reviewerB,'quest.review',q6,{artifactId:sixthArtifact,verdict:'approve'});
    assert.equal(questFrom(await getGameSnapshot(pool,maker),mid,q6).state,'approved');

    // Older checks consume the daily budget without tripping the minute budget.
    await pool.query(`UPDATE game_submission_checks SET created_at=now()-interval '2 minutes' WHERE mission_id=$1`,[mid]);
    const seventh=await action(owner,'quest.create',stage,{title:'A seventh report'});
    const q7=(seventh.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title==='A seventh report').id as string;
    await action(maker,'quest.claim',q7);
    const daily=(await pool.query('SELECT count(*)::int AS n FROM game_submission_checks WHERE submitter_id=$1',[maker])).rows[0].n as number;
    await pool.query(`WITH artifacts AS (INSERT INTO game_artifacts(quest_id,version,submitter_id,title,content) SELECT $1,series,$2,'Historical evidence',convert_to('Historical evidence','UTF8') FROM generate_series(1,$3::int) series RETURNING id) INSERT INTO game_submission_checks(artifact_id,quest_id,mission_id,submitter_id,requirements,provisional_tokens,status,created_at) SELECT id,$1,$4,$2,'{}'::jsonb,0,'unavailable',now()-interval '2 minutes' FROM artifacts`,[q7,maker,100-daily,mid]);
    const seventhArtifact=(await applyGameCommand(pool,maker,{action:'quest.submit',entityId:q7,payload:{title:'Report',content:'Completed seventh report.'},requestId:randomUUID()})).entityId!;
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[seventhArtifact])).rows[0].status,'unavailable');

    // Concurrent submissions by one player serialize at the admission gate.
    const quotaMaker=await makeUser('Quota maker');await action(quotaMaker,'mission.join',mid);
    const quotaQuests:string[]=[];
    for(let i=0;i<6;i++){
      const title=`Quota report ${i}`;
      const snapshot=await action(owner,'quest.create',stage,{title});
      const questId=(snapshot.missions.find(m=>m.id===mid)!.quests as any[]).find(q=>q.title===title).id as string;
      quotaQuests.push(questId);await action(quotaMaker,'quest.claim',questId);
    }
    await Promise.all(quotaQuests.map((questId,i)=>applyGameCommand(pool,quotaMaker,{action:'quest.submit',entityId:questId,payload:{title:`Evidence ${i}`,content:`Completed report ${i}.`},requestId:randomUUID()})));
    const quotaRows=await pool.query('SELECT artifact_id,quest_id,status FROM game_submission_checks WHERE submitter_id=$1 ORDER BY created_at,id',[quotaMaker]);
    assert.equal(quotaRows.rows.filter(r=>r.status==='queued').length,5);
    assert.equal(quotaRows.rows.filter(r=>r.status==='unavailable').length,1);

    // Human approval wins even if an automatic provider call is outstanding.
    let releaseApproval!:()=>void,approvalStarted!:()=>void;
    const approvalStart=new Promise<void>(resolve=>{approvalStarted=resolve;});
    const approvalHold=new Promise<void>(resolve=>{releaseApproval=resolve;});
    const approvalWork=processNextSubmissionCheck(pool,fakeConfig,{fetch:async()=>{approvalStarted();await approvalHold;return answer([.9,.9,.9]);}});
    await Promise.race([approvalStart,new Promise<void>((_,reject)=>setTimeout(()=>reject(new Error('Timed out waiting for approval race')),5000))]);
    const active=(await pool.query(`SELECT artifact_id,quest_id FROM game_submission_checks WHERE submitter_id=$1 AND status='running'`,[quotaMaker])).rows[0];
    await action(reviewerA,'quest.review',active.quest_id,{artifactId:active.artifact_id,verdict:'approve'});
    await action(reviewerB,'quest.review',active.quest_id,{artifactId:active.artifact_id,verdict:'approve'});
    releaseApproval();await approvalWork;
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[active.artifact_id])).rows[0].status,'superseded');

    // A human change request and replacement artifact also fence the old provider result.
    let releaseReplacement!:()=>void,replacementStarted!:()=>void;
    const replacementStart=new Promise<void>(resolve=>{replacementStarted=resolve;});
    const replacementHold=new Promise<void>(resolve=>{releaseReplacement=resolve;});
    const replacementWork=processNextSubmissionCheck(pool,fakeConfig,{fetch:async()=>{replacementStarted();await replacementHold;return answer([.9,.9,.9]);}});
    await Promise.race([replacementStart,new Promise<void>((_,reject)=>setTimeout(()=>reject(new Error('Timed out waiting for replacement race')),5000))]);
    const replace=(await pool.query(`SELECT artifact_id,quest_id FROM game_submission_checks WHERE submitter_id=$1 AND status='running'`,[quotaMaker])).rows[0];
    await action(reviewerA,'quest.review',replace.quest_id,{artifactId:replace.artifact_id,verdict:'changes_requested',note:'Attach the finished report.'});
    const replacement=(await applyGameCommand(pool,quotaMaker,{action:'quest.submit',entityId:replace.quest_id,payload:{title:'Finished report',content:'The completed report is attached.'},requestId:randomUUID()})).entityId!;
    releaseReplacement();await replacementWork;
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[replace.artifact_id])).rows[0].status,'superseded');
    assert.equal(questFrom(await getGameSnapshot(pool,quotaMaker),mid,replace.quest_id).instantCheck.artifactId,replacement);

    // A worker with no optional provider configuration drains a queued job as unavailable.
    const nextQueued=(await pool.query(`SELECT artifact_id FROM game_submission_checks WHERE submitter_id=$1 AND status='queued' ORDER BY created_at,id LIMIT 1`,[quotaMaker])).rows[0];
    await processNextSubmissionCheck(pool,{} as Config,{fetch:async()=>{throw new Error('must not call provider without credentials');}});
    assert.equal((await pool.query('SELECT status FROM game_submission_checks WHERE artifact_id=$1',[nextQueued.artifact_id])).rows[0].status,'unavailable');
  }finally{
    await cleanup();
    if(oldCredits===undefined)delete process.env.GAME_TEST_CREDITS;else process.env.GAME_TEST_CREDITS=oldCredits;
  }
});
