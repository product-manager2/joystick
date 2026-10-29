import { ROLES } from "../data/content.js";
import { leaderOf, playable } from "./strategies.js";
import { crewOf } from "../screens/quests.js";
import { S } from "../state.js";
import { esc } from "../ui/helpers.js";

// ===================== Personalisation =====================
// With hundreds of strategies and quests, show what matters to you first, and say why
export function questWhy(q, m) {
  const r = [];
  if (["call", "spend", "proof", "changes"].includes(q.state)) r.push([9, `${S.agentName} needs you`]);
  if (S.roles.includes(q.role)) r.push([4, `Fits ${ROLES[q.role].name}`]);
  if (S.backed?.[m.id] === q.strat) r.push([3, "Your strategy"]);
  if ((S.contrib?.[q.strat] || 0) > 0) r.push([2, "You've played here"]);
  const friend = crewOf(q).find(x => !x.bot && ["Rosa", "Kenji"].includes(x.who));
  if (friend) r.push([2, `${friend.who}'s in it`]);
  if (q.gain >= 2) r.push([1, `+${q.gain} to the goal`]);
  return r.sort((a, b) => b[0] - a[0]);
}
export const questScore = (q, m) => questWhy(q, m).reduce((a, [w]) => a + w, 0) + (S.joined[m.id] ? 1 : 0);
export function stratWhy(s, m) {
  const r = [];
  if (S.backed?.[m.id] === s.id) r.push([5, "You backed it"]);
  if ((S.contrib?.[s.id] || 0) > 0) r.push([4, "You've played here"]);
  const fit = m.quests.filter(q => q.strat === s.id && playable(q) && S.roles.includes(q.role)).length;
  if (fit) r.push([2 + fit, `${fit} quest${fit > 1 ? "s" : ""} fit you`]);
  if (s === leaderOf(m) && s.score) r.push([1, "Leading"]);
  return r.sort((a, b) => b[0] - a[0]);
}
export const stratScore = (s, m) => stratWhy(s, m).reduce((a, [w]) => a + w, 0);
export const why = list => list.length ? `<span class="why">${esc(list[0][1])}</span>` : "";

export const hasSkill = k => S.skills.some(([n]) => n === k);
