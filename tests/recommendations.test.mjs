import test from 'node:test';
import assert from 'node:assert/strict';
import { taskReady, taskMatch, missionMatch, planMatch, rankTasks, rankByMatch, rankByRecommendation, visibleItems, disclosureKey } from '../src/live/recommendations.js';
import { createRecommendationClient, recommendationFingerprint } from '../src/live/recommendation-client.js';
import { mayRefreshRecommendation } from '../src/live/recommendation-refresh.js';

const mission = (id='m1') => ({ id, title:'Clean water', tag:'Water', current:0, joined:true,
  stages:[{id:`${id}-stage`,status:'active'}], strategies:[{id:`${id}-plan`,stageId:`${id}-stage`,joined:false,status:null}], quests:[] });
const task = (m,id,more={}) => ({id,title:'Design water filter',role:'maker',state:'open',stageId:m.stages[0].id,strat:m.strategies[0].id,dependencies:[],...more});

test('readiness fails closed on inactive stage, plan, dependencies, children, and ownership', () => {
  const cases = [
    (m,q) => {m.stages[0].status='approved'},
    (m,q) => {m.stages[0].status='skipped'},
    (m,q) => {m.stages[0].status='pending';delete q.strat},
    (m,q) => {m.strategies[0].status='proposed'},
    (m,q) => {m.strategies=[]},
    (m,q) => {q.dependencies=['missing']},
    (m,q) => {m.quests.push(task(m,'child',{parent:q.id}))},
    (m,q) => {q.claimedBy='someone-else'},
    (m,q) => {q.state='approved'},
  ];
  for (const change of cases) {
    const m=mission(), q=task(m,'q');m.quests=[q];assert.equal(taskReady(m,q),true);
    change(m,q);assert.equal(taskReady(m,q),false);
  }
  // A later stage opens early for the plan aimed straight at it.
  const ahead=mission();ahead.stages[0].status='pending';const leap=task(ahead,'leap');ahead.quests=[leap];assert.equal(taskReady(ahead,leap),true);
  const x=mission();const dep=task(x,'dep',{state:'approved',done:true});const ready=task(x,'ready',{dependencies:['dep']});x.quests=[dep,ready];assert.equal(taskReady(x,ready),true);
});

test('grounded role, skill, and mission affinity reasons; cold start stays unlabeled', () => {
  const m=mission(), q=task(m,'q');m.quests=[q];
  assert.match(taskMatch(m,q,{roles:['maker']}).reason,/Maker|maker/);
  assert.match(taskMatch(m,q,{skills:['water']}).reason,/water skill/);
  const cold=mission('cold');cold.joined=false;const other=task(cold,'other',{title:'Build a bridge',role:'builder'});cold.quests=[other];
  assert.equal(taskMatch(cold,other,{}).reason,'');
  assert.equal(missionMatch(cold,{}).reason,'');
  const similar=mission('similar');similar.joined=false;similar.quests=[];
  assert.equal(missionMatch(similar,{joinedMissions:[m]}).reason,'Similar to missions you joined');
  assert.equal(planMatch(m,{...m.strategies[0],joined:true},{}).reason,'Your squad');
});

test('ranking does not mutate sources and caps repeated mission tasks in first page', () => {
  const a=mission('a'),b=mission('b');
  const entries=[...Array.from({length:50},(_,i)=>({m:a,q:task(a,`a${i}`)})),{m:b,q:task(b,'b0')}];
  a.quests=entries.filter(x=>x.m===a).map(x=>x.q);b.quests=[entries.at(-1).q];
  const before=entries.map(x=>x.q.id);
  const ranked=rankTasks(entries,{roles:['maker']});
  assert.deepEqual(entries.map(x=>x.q.id),before);
  assert.equal(ranked[3].q.id,'b0');
  assert.equal(ranked.length,51);
  const original=[{id:1},{id:2}];rankByMatch(original,x=>({score:x.id}));assert.deepEqual(original.map(x=>x.id),[1,2]);
});

test('progressive disclosure reveals all 50, collapses, and leaves short lists intact', () => {
  const items=Array.from({length:50},(_,i)=>i);
  assert.deepEqual(visibleItems(items,0).visible,[0,1,2,3]);
  assert.equal(visibleItems(items,0).remaining,46);
  assert.equal(visibleItems(items,1).visible.length,12);
  assert.equal(visibleItems(items,6).visible.length,50);
  assert.equal(visibleItems(items,6).remaining,0);
  assert.equal(visibleItems(items,0).expanded,false);
  assert.deepEqual(visibleItems([1,2,3],0).visible,[1,2,3]);
  assert.notEqual(disclosureKey("accountA","plan:p1"),disclosureKey("accountA","play-open"));
  assert.notEqual(disclosureKey("accountA","plan:p1"),disclosureKey("accountB","plan:p1"));
});

test('model scores lead local match, but own squad and ready work stay first', () => {
  const m=mission(), own=task(m,'own',{strat:'own-plan',role:'other'}), other=task(m,'other',{role:'maker'}), blocked=task(m,'blocked',{dependencies:['missing']});
  m.strategies.push({id:'own-plan',stageId:m.stages[0].id,joined:true,status:null});m.quests=[own,other,blocked];
  const ready=rankTasks([ {m,q:other},{m,q:own} ],{roles:['maker']},3,{other:1,own:0});
  assert.deepEqual(ready.map(x=>x.q.id),['own','other']);
  const noOwn=rankTasks([{m,q:other},{m,q:task(m,'low',{role:'other'})}],{roles:['maker']},3,{other:0,low:1});
  assert.deepEqual(noOwn.map(x=>x.q.id),['low','other']);
  assert.equal(taskReady(m,blocked),false);
  const plans=[{id:'a',joined:false},{id:'b',joined:true}];
  assert.deepEqual(rankByRecommendation(plans,()=>({score:0}),{a:1,b:0},p=>Number(p.joined)).map(p=>p.id),['b','a']);
  assert.equal(visibleItems(ready,0).visible.length,2);
});

test('client dedupes by account and scope, ignores switched account and changed inputs', async () => {
  let time=1000, calls=0, release;
  const client=createRecommendationClient(()=>{calls++;return new Promise(resolve=>{release=resolve;});},()=>time);
  const scope={kind:'tasks',planId:'p1'}, fp='profile-and-candidates-v1';
  const first=client.requestScope('a',scope,fp), duplicate=client.requestScope('a',scope,fp);
  await Promise.resolve();assert.equal(calls,1);
  release({source:'jev',scores:{q:0.9},expiresAt:time+100000});
  assert.deepEqual(await first,{q:0.9});assert.deepEqual(await duplicate,{q:0.9});
  assert.deepEqual(client.peek('a',scope,fp),{q:0.9});
  assert.equal(client.peek('a',scope,'new-input'),null);
  const stale=client.requestScope('a',scope,'new-input');await Promise.resolve();
  assert.equal(calls,2);client.reset('b');release({source:'jev',scores:{q:1},expiresAt:time+100000});
  assert.equal(await stale,null);assert.equal(client.peek('b',scope,'new-input'),null);
  const next=client.requestScope('b',scope,fp);await Promise.resolve();release({source:'jev',scores:{q:0.2},expiresAt:time+100000});
  assert.deepEqual(await next,{q:0.2});assert.equal(calls,3);
});

test('fallback has cooldown, invalid scores are ignored, fingerprint tracks content without revision', async () => {
  let time=1000,calls=0;
  const client=createRecommendationClient(async()=>{calls++;return {source:'fallback',scores:{q:1},expiresAt:time+1};},()=>time);
  const scope={kind:'missions'}, fp='same';
  await client.requestScope('a',scope,fp);await client.requestScope('a',scope,fp);
  assert.equal(calls,1);assert.equal(client.peek('a',scope,fp),null);
  time+=30001;await client.requestScope('a',scope,fp);assert.equal(calls,2);
  const m=mission();m.quests=[task(m,'q')];
  const profile={roles:['maker'],joinedTopics:[['m1','Water']]};
  const initial=recommendationFingerprint(profile,[m]);
  assert.equal(initial,recommendationFingerprint({...profile,revision:22},[m]));
  m.quests[0].out='A tested filter';assert.notEqual(initial,recommendationFingerprint(profile,[m]));
  const invalid=createRecommendationClient(async()=>({source:'jev',scores:{q:2,other:0.7},expiresAt:time+100000}),()=>time);
  await invalid.requestScope('a',scope,fp);assert.deepEqual(invalid.peek('a',scope,fp),{other:0.7});
});

test('first Jev result refreshes only an untouched current view at the top', () => {
  const safe={scores:{q:0.8},accountId:'a',currentAccountId:'a',view:'play',currentView:'play',
    fingerprint:'content-v1',currentFingerprint:'content-v1',navigation:4,currentNavigation:4,
    interaction:10,currentInteraction:10,atTop:true,editing:false,focusedInput:false};
  assert.equal(mayRefreshRecommendation(safe),true);
  for (const changed of [
    {scores:null},{currentAccountId:'b'},{currentView:'plan'},{currentFingerprint:'content-v2'},
    {currentNavigation:5},{currentInteraction:11},{atTop:false},{editing:true},{focusedInput:true},
  ]) assert.equal(mayRefreshRecommendation({...safe,...changed}),false,JSON.stringify(changed));
});
