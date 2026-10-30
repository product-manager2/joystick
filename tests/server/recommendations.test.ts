import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecommendationService } from '../../server/game/recommendations.js';
import type { GameSnapshot } from '../../contracts/game.js';

const ids = [1, 2, 3, 4, 5, 6, 7].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const [missionId, stageId, planId, openId, blockedId, claimedId, otherMissionId] = ids;
const mission = { id: missionId, title: 'Clean rivers', pitch: 'Map pollution', tag: 'Planet', joined: true, current: 0,
  stages: [{ id: stageId, status: 'active', goal: 'Map a river' }],
  strategies: [{ id: planId, stageId, status: 'active', name: 'Field survey', bet: 'Collect water samples' }],
  quests: [
    { id: openId, stageId, strat: planId, title: 'Gather samples', role: 'scientist', brief: { description: 'Test water' }, state: 'open', claimedBy: null, done: false, dependencies: [] },
    { id: blockedId, stageId, strat: planId, title: 'Analyze samples', state: 'open', claimedBy: null, done: false, dependencies: [openId] },
    { id: claimedId, stageId, strat: planId, title: 'Assigned task', state: 'claimed', claimedBy: 'someone', done: false, dependencies: [] },
  ] };
const snapshot = (roles = ['scientist']): GameSnapshot => ({ revision: 1, profile: { roles, skills: ['water testing'] }, missions: [mission], threads: [], people: [], trust: {}, notifications: [], wallet: {}, invites: [], policy: {} });
const config = { aiGatewayApiKey: 'test-secret', jevModel: 'typesafe-ai/jev' };
function providerResponse(request: RequestInit, score = 3) {
  const sent = JSON.parse(String(request.body));
  const answers = Object.fromEntries(Object.keys(sent.questions).map(key => [key, { type: 'score', score, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0 } }]));
  return new Response(JSON.stringify({ model: 'typesafe-ai/jev', answers }), { status: 200 });
}

test('server selects eligible tasks and sends only minimal profile and catalog fields', async () => {
  let sent: any, calls = 0;
  const recommend = createRecommendationService(null as any, config, { snapshot: async () => snapshot(), fetch: async (_url, init) => { calls++; sent = JSON.parse(String(init?.body)); return providerResponse(init!); } });
  const result = await recommend('user-a', { kind: 'tasks', missionId, planId });
  assert.equal(result.source, 'jev');
  assert.deepEqual(Object.keys(result.scores), [openId]);
  assert.equal(result.scores[openId], 0.75);
  assert.equal(calls, 1);
  assert.deepEqual(sent.state.candidates.map((x: any) => x.title), ['Gather samples']);
  assert.equal(sent.state.candidates[0].roleNeeded, 'scientist');
  assert.ok(!JSON.stringify(sent.state).includes(openId));
  assert.deepEqual(sent.state.profile, { roles: ['scientist'], skills: ['water testing'], interests: ['Planet'] });
  assert.equal(sent.providerOptions, undefined);
  assert.deepEqual(Object.keys(sent.questions), ['role_0', 'skill_0', 'interest_0']);
  assert.ok(!JSON.stringify(sent).includes('test-secret'));
});

test('scope is authorized from fresh snapshot, and client cannot supply candidate content', async () => {
  let calls = 0;
  const recommend = createRecommendationService(null as any, config, { snapshot: async () => ({ ...snapshot(), missions: [{ ...mission, joined: false }] }), fetch: async () => { calls++; return new Response(); } });
  await assert.rejects(() => recommend('user-a', { kind: 'tasks', missionId, planId }), /scope not found/i);
  await assert.rejects(() => recommend('user-a', { kind: 'tasks', missionId, candidate: 'spoofed' }), /Invalid recommendation request/);
  await assert.rejects(() => recommend('user-a', { kind: 'plans', missionId: otherMissionId }), /scope not found/i);
  assert.equal(calls, 0);
});

test('cache and singleflight are user and profile specific', async () => {
  let calls = 0, roles = ['scientist'];
  const recommend = createRecommendationService(null as any, config, { snapshot: async () => snapshot(roles), fetch: async (_url, init) => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return providerResponse(init!); } });
  const input = { kind: 'tasks', missionId, planId };
  const [a, b] = await Promise.all([recommend('user-a', input), recommend('user-a', input)]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await recommend('user-a', input); assert.equal(calls, 1);
  await recommend('user-b', input); assert.equal(calls, 2);
  roles = ['designer']; await recommend('user-a', input); assert.equal(calls, 3);
});

test('fresh authorization and candidate state invalidate a cached recommendation', async () => {
  let calls = 0, joined = true, state = 'open', title = 'Gather samples';
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => ({ ...snapshot(), missions: [{ ...mission, joined, quests: [{ ...mission.quests[0], state, title }] }] }),
    fetch: async (_url, init) => { calls++; return providerResponse(init!); },
  });
  const input = { kind: 'tasks', missionId, planId };
  assert.equal((await recommend('user-a', input)).source, 'jev');
  title = 'Survey shoreline';
  assert.equal((await recommend('user-a', input)).source, 'jev');
  assert.equal(calls, 2);
  state = 'claimed';
  assert.equal((await recommend('user-a', input)).source, 'fallback');
  assert.equal(calls, 2);
  joined = false;
  await assert.rejects(() => recommend('user-a', input), /scope not found/i);
});

test('malformed answers and provider failure fall back without exposing errors', async () => {
  let calls = 0;
  const recommend = createRecommendationService(null as any, config, { snapshot: async () => snapshot(), fetch: async () => { calls++; return new Response(JSON.stringify({ model: 'typesafe-ai/jev', answers: { unknown: { score: 4 } } })); } });
  const input = { kind: 'tasks', missionId, planId };
  assert.deepEqual((await recommend('user-a', input)).scores, {});
  assert.equal((await recommend('user-a', input)).source, 'fallback');
  assert.equal(calls, 1);
});

test('missing key or empty profile avoids provider calls', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(); };
  const withoutKey = createRecommendationService(null as any, { ...config, aiGatewayApiKey: undefined }, { snapshot: async () => snapshot(), fetch: fetcher });
  const withoutProfile = createRecommendationService(null as any, config, { snapshot: async () => ({ ...snapshot([]), profile: { roles: [], skills: [] }, missions: [{ ...mission, tag: '', joined: true }] }), fetch: fetcher });
  assert.equal((await withoutKey('user-a', { kind: 'tasks', missionId, planId })).source, 'fallback');
  assert.equal((await withoutProfile('user-a', { kind: 'tasks', missionId, planId })).source, 'fallback');
  assert.equal(calls, 0);
});

test('missing profile dimensions are omitted and remaining weights are normalized', async () => {
  let sent: any;
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => ({ ...snapshot([]), profile: { roles: [], skills: ['water testing'] }, missions: [{ ...mission, tag: '' }] }),
    fetch: async (_url, init) => { sent = JSON.parse(String(init?.body)); return providerResponse(init!, 4); },
  });
  const result = await recommend('user-a', { kind: 'tasks', missionId, planId });
  assert.equal(result.scores[openId], 1);
  assert.deepEqual(Object.keys(sent.questions), ['skill_0']);
  assert.deepEqual(sent.state.profile, { roles: [], skills: ['water testing'], interests: [] });
});

test('malformed probability distribution fails closed', async () => {
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => snapshot(),
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const answers = Object.fromEntries(Object.keys(body.questions).map(key => [key, { type: 'score', score: 3, probabilities: { 0: 0, 1: 0, 2: 0, 3: 0.4, 4: 0.4 } }]));
      return new Response(JSON.stringify({ model: config.jevModel, answers }));
    },
  });
  assert.equal((await recommend('user-a', { kind: 'tasks', missionId, planId })).source, 'fallback');
});

test('provider timeout returns fallback and aborts the request', async () => {
  let aborted = false;
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => snapshot(), timeoutMs: 10,
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    }),
  });
  assert.equal((await recommend('user-a', { kind: 'tasks', missionId, planId })).source, 'fallback');
  assert.equal(aborted, true);
});

test('per-user quota limits paid calls across changed candidate content', async () => {
  let title = 'Candidate 0', calls = 0;
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => ({ ...snapshot(), missions: [{ ...mission, quests: [{ ...mission.quests[0], title }] }] }),
    fetch: async (_url, init) => { calls++; return providerResponse(init!); },
  });
  for (let i = 0; i < 11; i++) {
    title = `Candidate ${i}`;
    const result = await recommend('user-a', { kind: 'tasks', missionId, planId });
    assert.equal(result.source, i < 10 ? 'jev' : 'fallback');
  }
  assert.equal(calls, 10);
});

test('pending future-stage work is eligible only through an active target plan', async () => {
  const futureStage = '00000000-0000-4000-8000-000000000008';
  const futurePlan = '00000000-0000-4000-8000-000000000009';
  const futureTask = '00000000-0000-4000-8000-000000000010';
  let payload: any;
  const futureMission = { ...mission,
    stages: [...mission.stages, { id: futureStage, status: 'pending', goal: 'Publish results' }],
    strategies: [...mission.strategies, { id: futurePlan, stageId: futureStage, status: 'active', joined: false, name: 'Direct publication', bet: 'Publish findings' }],
    quests: [...mission.quests, { id: futureTask, stageId: futureStage, strat: futurePlan, title: 'Prepare manuscript', role: 'scientist', state: 'open', claimedBy: null, done: false, dependencies: [] },
      { id: '00000000-0000-4000-8000-000000000011', stageId: futureStage, strat: null, title: 'Premature standalone', state: 'open', claimedBy: null, done: false, dependencies: [] }],
  };
  const recommend = createRecommendationService(null as any, config, {
    snapshot: async () => ({ ...snapshot(), missions: [futureMission] }),
    fetch: async (_url, init) => { payload = JSON.parse(String(init?.body)); return providerResponse(init!); },
  });
  const plans = await recommend('user-a', { kind: 'plans', missionId });
  assert.deepEqual(Object.keys(plans.scores), [planId, futurePlan]);
  assert.ok(payload.state.candidates.some((c: any) => c.stageGoal === 'Publish results'));
  const tasks = await recommend('user-a', { kind: 'tasks', missionId, stageId: futureStage, planId: futurePlan });
  assert.deepEqual(Object.keys(tasks.scores), [futureTask]);
  const standalone = await recommend('user-a', { kind: 'tasks', missionId, stageId: futureStage });
  assert.equal(standalone.source, 'fallback');
  assert.deepEqual(standalone.scores, {});
});
