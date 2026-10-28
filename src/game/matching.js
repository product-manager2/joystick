import { POOL, stakeOf } from "./economy.js";
import { strats } from "./strategies.js";

// ===================== Matching rounds =====================
// Each milestone the treasury's matching pool is shared across strategies by quadratic funding:
// a strategy's raw score is (Σ√cᵢ)² − Σcᵢ over its backers, so breadth of belief beats size of wallet.
// Each backer's signals are combined first, so giving time and money still counts as one person.
// Mock data stores only backers and money raised per strategy, so other backers are treated as giving the average.
// A +1 ("voice") counts as 1 credit. No strategy takes more than CAP of the pool; the excess is shared again.
export const CAP = .4;
export const poolOf = m => POOL[m.id] || 2000;

// Everyone but you, plus your own combined contribution (with an optional extra amount you're considering)
function rawScore(s, extra = 0) {
  const mine = stakeOf(s) + extra;
  const others = Math.max(0, s.backers - (stakeOf(s) ? 1 : 0)), avg = others ? (s.raised || 0) / others : 0;
  const voices = s.voices || 0;
  const roots = others * Math.sqrt(avg) + Math.sqrt(mine) + voices;
  const total = (s.raised || 0) + mine + voices;
  return Math.max(0, roots * roots - total);
}

// Match per strategy id for this round, with the cap applied
export function matches(m, extra = {}, voice = null) {
  const P = poolOf(m), list = strats(m).filter(s => s.status !== "merged");
  const q = Object.fromEntries(list.map(s => [s.id, s === voice ? rawScore({ ...s, voices: (s.voices || 0) + 1 }) : rawScore(s, extra[s.id] || 0)]));
  const out = {};
  let left = P, open = list.map(s => s.id);
  while (open.length) {
    const sum = open.reduce((a, id) => a + q[id], 0) || 1;
    const capped = open.filter(id => left * q[id] / sum > CAP * P);
    if (!capped.length) { open.forEach(id => { out[id] = Math.round(left * q[id] / sum); }); break; }
    capped.forEach(id => { out[id] = Math.round(CAP * P); left -= CAP * P; });
    open = open.filter(id => !capped.includes(id));
  }
  return out;
}
export const matchOf = (m, s) => matches(m)[s.id] || 0;
// Extra match your $x would pull into s (what the "with match" estimate shows)
export const matchGain = (m, s, x) => Math.max(0, (matches(m, { [s.id]: x })[s.id] || 0) - matchOf(m, s));
export const voiceGain = (m, s) => Math.max(0, (matches(m, {}, s)[s.id] || 0) - matchOf(m, s));
// Money a strategy has: what backers put in (yours included) plus its match
export const raisedOf = s => (s.raised || 0) + stakeOf(s);
export const backersOf = s => s.backers;
