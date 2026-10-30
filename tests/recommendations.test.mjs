import test from 'node:test';
import assert from 'node:assert/strict';
import { taskReady, taskMatch, missionMatch, planMatch, rankTasks, rankByMatch, visibleItems, disclosureKey } from '../src/live/recommendations.js';

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
