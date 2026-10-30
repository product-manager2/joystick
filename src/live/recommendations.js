// Local, explainable ordering only. The server remains authoritative for claiming work.
const stop = new Set(["the","and","for","you","your","with","from","into","that","this","our","are","will","all","new","more","work","help","make","mission","missions","plan","plans","task","tasks"]);
const words = value => new Set((String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !stop.has(word)));
const overlap = (a, b) => [...words(a)].some(word => words(b).has(word));
const skillsOf = profile => (profile.skills || []).map(skill => Array.isArray(skill) ? skill[0] : skill).filter(Boolean);
const topic = mission => [mission.tag, mission.title, mission.pitch].filter(Boolean).join(" ");
const taskText = task => [task.title, task.brief?.description, task.detail?.skills, task.fit, task.role].filter(Boolean).join(" ");
export function taskReady(mission, task) {
  if (task.state !== "open" || task.claimedBy || task.done) return false;
  const stage = mission.stages?.[mission.current];
  if (!stage || stage.id !== task.stageId || stage.status !== "active") return false;
  if (task.strat) {
    const plan = mission.strategies?.find(item => item.id === task.strat);
    if (!plan || plan.stageId !== stage.id || (plan.status && plan.status !== "active")) return false;
  }
  if ((mission.quests || []).some(child => child.parent === task.id && !child.done)) return false;
  return (task.dependencies || []).every(id => mission.quests?.some(dep => dep.id === id && dep.done));
}
export function taskMatch(mission, task, profile = {}) {
  if (!taskReady(mission, task)) return { score: 0, reason: "" };
  const roles = profile.roles || [], skills = skillsOf(profile);
  const role = roles.includes(task.role) && task.role;
  const skill = skills.find(value => overlap(value, taskText(task)));
  const joinedTopics = (profile.joinedMissions || []).filter(item => item.id !== mission.id).map(topic);
  const similar = joinedTopics.some(value => overlap(value, topic(mission)));
  const ownSquad = mission.strategies?.some(plan => plan.id === task.strat && plan.joined);
  const ownMission = mission.joined;
  const reason = role ? `Fits your ${role[0].toUpperCase()+role.slice(1)} role` : skill ? `Matches your ${skill} skill` : ownSquad ? "From your squad" : similar ? "Similar to missions you joined" : ownMission ? "In a mission you joined" : "";
  return { score: (role ? 40 : 0) + (skill ? 24 : 0) + (ownSquad ? 16 : 0) + (similar ? 12 : 0) + (ownMission ? 6 : 0), reason };
}
export function rankTasks(items, profile = {}, capPerMission = 3) {
  const ranked = items.map((item, index) => ({ ...item, index, match: taskMatch(item.m, item.q, profile) }))
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index);
  const result = [], deferred = [], counts = new Map();
  for (const item of ranked) {
    const count = counts.get(item.m.id) || 0;
    if (count < capPerMission) { result.push(item); counts.set(item.m.id, count + 1); }
    else deferred.push(item);
  }
  return [...result, ...deferred];
}
export function missionMatch(mission, profile = {}) {
  const matches = (mission.quests || []).filter(task => taskReady(mission, task)).map(task => taskMatch(mission, task, profile));
  const best = matches.sort((a, b) => b.score - a.score)[0];
  if (best?.reason) return { score: best.score, reason: best.reason };
  const similar = (profile.joinedMissions || []).filter(item => item.id !== mission.id).some(item => overlap(topic(item), topic(mission)));
  return similar ? { score: 12, reason: "Similar to missions you joined" } : { score: 0, reason: "" };
}
export function planMatch(mission, plan, profile = {}) {
  const own = !!plan.joined;
  const matches = (mission.quests || []).filter(task => task.strat === plan.id && taskReady(mission, task)).map(task => taskMatch(mission, task, profile));
  const best = matches.sort((a, b) => b.score - a.score)[0];
  return { score: (own ? 100 : 0) + (best?.score || 0), reason: own ? "Your squad" : best?.reason || "" };
}
export function rankByMatch(items, match) {
  return items.map((item, index) => ({ item, index, match: match(item) }))
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index).map(entry => entry.item);
}
export const disclosureKey = (accountId, scope) => `${accountId || "guest"}:${scope}`;
export function visibleItems(items, expanded = 0, initial = 4, batch = 8) {
  const count = Math.min(items.length, initial + Math.max(0, expanded) * batch);
  return { visible: items.slice(0, count), remaining: items.length - count, expanded: expanded > 0 };
}
