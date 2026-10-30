// The request contains only a scope. The server selects authorized candidates and profile data.
const stable = value => JSON.stringify(value);
const taskContent = q => [q.id,q.title,q.role,q.size,q.stageId,q.strat,q.state,q.done,q.claimedBy,q.parent,q.dependencies,q.brief?.description,q.detail?.skills,q.fit,q.out,q.brief?.out];
const planContent = p => [p.id,p.name,p.bet,p.stageId,p.status,p.joined,p.rolesNeeded,p.howItWorks,p.tags,p.squad];
const missionContent = m => [m.id,m.title,m.pitch,m.tag,m.roles,m.joined,m.current,m.ownerId,
  m.stages?.map(s=>[s.id,s.name,s.goal,s.status,s.plainWords]),m.strategies?.map(planContent),m.quests?.map(taskContent)];
export const recommendationFingerprint = (profile, candidates) => stable({
  profile: [profile?.roles,profile?.skills,profile?.joined,profile?.joinedTopics,profile?.preferences?.interests,profile?.preferences?.topics],
  candidates: candidates.map(item => item.quests ? missionContent(item) : item.strategies ? missionContent(item) : item.bet !== undefined ? planContent(item) : item.q ? [item.m.id,taskContent(item.q)] : taskContent(item)),
});
export function createRecommendationClient(request, now = () => Date.now()) {
  const cache = new Map();
  let account = null;
  let generation = 0;
  const keyOf = (id, scope) => `${id}:${stable(scope)}`;
  function reset(id = null) { account = id; generation++; cache.clear(); }
  function sync(id) { if (id !== account) reset(id); }
  function peek(id, scope, fingerprint) {
    sync(id);
    const entry = cache.get(keyOf(id,scope));
    return entry?.fingerprint === fingerprint && entry.until > now() && entry.source === "jev" ? entry.scores : null;
  }
  function requestScope(id, scope, fingerprint) {
    if (!id || !fingerprint) return Promise.resolve(null);
    sync(id);
    const key = keyOf(id,scope), old = cache.get(key), time = now();
    if (old?.fingerprint === fingerprint && old.until > time) return old.pending || Promise.resolve(old.source === "jev" ? old.scores : null);
    const ticket = generation;
    const entry = { fingerprint, until: time + 30_000, source: "fallback", scores: null, pending: null };
    cache.set(key, entry);
    entry.pending = Promise.resolve().then(() => request(scope)).then(data => {
      if (ticket !== generation || cache.get(key) !== entry || entry.fingerprint !== fingerprint) return null;
      const scores = data?.source === "jev" && data.scores && typeof data.scores === "object" && !Array.isArray(data.scores)
        ? Object.fromEntries(Object.entries(data.scores).filter(([key,value]) => key && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) : null;
      entry.source = scores && Object.keys(scores).length ? "jev" : "fallback";
      entry.scores = entry.source === "jev" ? scores : null;
      entry.until = entry.source === "jev" ? Math.min(Math.max(Number(data.expiresAt) || 0, now() + 15_000), now() + 300_000) : now() + 30_000;
      return entry.scores;
    }).catch(() => {
      if (ticket === generation && cache.get(key) === entry) entry.until = now() + 30_000;
      return null;
    }).finally(() => { entry.pending = null; });
    return entry.pending;
  }
  return { peek, requestScope, reset };
}
