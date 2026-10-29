import { ROLES } from "../data/content.js";
import { LEDGER } from "../data/world.js";
import { strats } from "./strategies.js";
import { S } from "../state.js";
import { esc, fmt } from "../ui/helpers.js";
import { chName } from "../screens/quests.js";

// ===================== Economy =====================
// Missions run on four fuels and pay out four rewards. Every contribution turns into
// mission shares at the current milestone's multiplier, so early players earn more.
export const FUELS = {
  money:   { name: "Money",     color: "var(--gold)", icon: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v11"/>' },
  time:    { name: "Time",      color: "var(--sky)", icon: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>' },
  know:    { name: "Knowledge", color: "var(--lilac)", icon: '<path d="M9 17h6M10 20h4M12 4a6 6 0 0 0-3.5 10.9V17h7v-2.1A6 6 0 0 0 12 4z"/>' },
  compute: { name: "Compute",   color: "var(--leaf)", icon: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>' },
};
export const RATE = { money: 1, time: 50, know: 200, compute: 2 };   // contribution value in $
export const MULT = [3, 2, 1.5, 1.2, 1, 1];
export const mult = m => MULT[Math.min(m.current, MULT.length - 1)];
export const FUEL0 = {
  glio:  { money: [9200, 12000], time: [310, 400], know: [14, 20], compute: [2100, 3000], dryDays: 9,  supply: 480000, more: [41, 312] },
  cad:   { money: [2600, 5000],  time: [140, 300], know: [6, 12],  compute: [200, 600],   dryDays: 21, supply: 120000, more: [12, 96] },
  reef:  { money: [6000, 8000],  time: [220, 260], know: [9, 10],  compute: [80, 200],    dryDays: 30, supply: 210000, more: [6, 40] },
  tutor: { money: [3000, 10000], time: [40, 200],  know: [3, 15],  compute: [50, 400],    dryDays: 12, supply: 90000,  more: [9, 77] },
};
export const ASK = { "glio-dock": [15000, 150, 2500], "glio-repurpose": [10000, 120, 200], "glio-gen": [9000, 100, 1500], "glio-whole": [6000, 90, 100],
  "cad-occ": [12000, 300, 600], "cad-users": [4000, 120, 0], "cad-rust": [40000, 600, 1000], "reef-shops": [7000, 200, 0], "reef-app": [3000, 80, 0], "tutor-teach": [4000, 150, 0], "tutor-ai": [3000, 60, 300] };
// Matching pool for each milestone round: the part of the treasury that matches backers quadratically
export const POOL = { glio: 25000, cad: 8000, reef: 10000, tutor: 12000 };
export function fuelOf(m) {
  if (!m.fuel) m.fuel = JSON.parse(JSON.stringify(FUEL0[m.id] || { money: [0, 2000], time: [0, 100], know: [0, 5], compute: [0, 100], dryDays: 30, supply: 10000, more: [0, 0] }));
  return m.fuel;
}
export const fuelIcon = (k, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${FUELS[k].icon}</svg>`;
export const fuelNum = (k, v) => k === "money" ? "$" + fmt(v) : k === "time" ? fmt(v) + "h" : k === "know" ? fmt(v) : fmt(v);
export const fuelUnit = k => ({ money: "", time: "", know: "", compute: " GPU-h" })[k];
// Your piece of the mission, in plain words: no ticker, no supply, no holder counts
export function tokenCard(m) {
  const pct = ownPct(m), name = chName(m), x = mult(m);
  return `<div class="tokcard">
    <div class="row"><span class="tokcoin">%</span><span style="flex:1;min-width:0"><b class="tokname">Your piece of ${esc(name)}</b><span class="small muted" style="display:block">Owners get paid if it makes money</span></span>
      ${pct ? `<span class="tokmine"><b>${pct.toFixed(2)}%</b><span>yours</span></span>` : ""}</div>
    <p class="small">${pct ? `You own <b>${pct.toFixed(2)}%</b> of ${esc(name)}.` : `Own a small piece of ${esc(name)}.`} Back a plan to get a bigger piece${x > 1 ? `. Early players get ${x}× more` : ""}.</p>
    <button class="btn gold sm" data-a="fuelit" data-x="${m.id}">Get a bigger piece</button>
  </div>`;
}
// Credit a contribution: fuel goes in, mission tokens come out
export function contribute(m, parts) {
  const f = fuelOf(m);
  let cv = 0;
  Object.entries(parts).forEach(([k, v]) => { if (!v) return; f[k][0] += v; cv += v * RATE[k]; });
  const shares = Math.round(cv * mult(m) / 10);
  S.wallet.shares[m.id] = (S.wallet.shares[m.id] || 0) + shares;
  return shares;
}
// Each mission has its own governance token: your vote now, your cut of what it builds later
export const TOKEN = {
  glio:  { tick: "GLIO", pays: ["Drug licences", "Trial data access", "Bounty payouts"] },
  cad:   { tick: "OCAD", pays: ["Pro & team plans", "Plugin store fees", "Bounty payouts"] },
  reef:  { tick: "REEF", pays: ["Data licences", "Insurer risk feeds", "Bounty payouts"] },
  tutor: { tick: "TUTR", pays: ["School licences", "Grant funding", "Bounty payouts"] },
};
export const tok = m => "$" + ((TOKEN[m.id] || {}).tick || m.id.slice(0, 4).toUpperCase());
export const holders = m => Math.round(m.players * .62 + fuelOf(m).more[1]);
export const ownPct = m => { const mine = S.wallet.shares[m.id] || 0; return mine ? (mine / (fuelOf(m).supply + mine) * 100) : 0; };
export const tokFor = (m, parts) => Math.round(Object.entries(parts).reduce((a, [k, v]) => a + (v || 0) * RATE[k], 0) * mult(m) / 10);
export const questFuel = q => ({ time: { S: 1, M: 4, L: 8 }[q.size] || 1, know: ["explorer", "checker", "planner"].includes(q.role) ? 1 : 0, compute: /part \d|dock|train|screen/i.test(q.title) ? 200 : 0 });
// Team stakes: money you put straight into a strategy. They pay from that team's product, not the mission's.
export const stakeOf = s => (S.stakes || {})[s.id] || 0;
export const askOf = s => { const a = ASK[s.id] || [3000, 80, 300]; return { money: a[0], time: a[1], compute: a[2] }; };
// Every spend from a mission's treasury, with a receipt
export const ledgerOf = m => (m.ledger = m.ledger || (LEDGER[m.id] || []).map(([what, squad, amt, when]) => ({ what, squad, amt, when })));
