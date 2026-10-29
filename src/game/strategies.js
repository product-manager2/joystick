import { Q } from "../data/content.js";
import { PEOPLE, QX } from "../data/world.js";
import { color } from "../design/tokens.js";
import { S } from "../state.js";
import { findQuest, gain } from "../ui/helpers.js";

// ===================== Milestones & strategies =====================
// Each stage is a milestone with a measurable goal. Every strategy is a thesis: a squad's bet on how to
// hit it, with its own backers and money. Results from every strategy count, and any quest can be split.
// status: none = running · "proposed" = raising backers to launch · "review" = awaiting the creator's OK
//         "queued" = waits on another strategy · "merged" = folded into another squad
export const STRATS = {
  glio: { goal: "Shortlist 10 verified drug candidates", target: 10, unit: "candidates",
    strategies: [
      { id: "glio-dock", name: "Brute-force docking", squad: "Fold Gang", lead: "Priya", color: "var(--red)", score: 4, backers: 212, raised: 4200, tags: ["Fast track"], rel: [["competes", "glio-gen"]], bet: "Test all 1 million molecules on rented computers. Wide net, fast.", quests: ["g1", "g2", "g6"] },
      { id: "glio-repurpose", name: "Repurpose approved drugs", squad: "Wet Hands", lead: "Ade", color: "var(--green)", score: 2, backers: 148, raised: 3100, tags: ["Low cost", "Patient-led"], rel: [["feeds", "glio-whole", "Its approved drugs seed the combos"]], bet: "Screen 2,800 FDA-approved drugs. Fewer hits, much faster path to trial.", quests: ["g7", "g8", "g3", "g4", "g11"] },
      { id: "glio-whole", name: "Diet + drug combos", squad: "Whole Health", lead: "Sana", color: "var(--lilac)", score: 0, backers: 141, need: 150, status: "proposed", raised: 2600, tags: ["Holistic", "Patient-led"], rel: [["needs", "glio-repurpose", "Builds on its approved drugs"]], bet: "Pair approved drugs with metabolic diet changes. Treat the whole patient, not just the tumour.", quests: ["g12"] },
      { id: "glio-gen", name: "Generate new molecules", squad: "Swarm 404", lead: "Mo", color: "var(--blue)", score: 1, backers: 96, raised: 1900, tags: ["Open science"], bet: "200 small agents design brand-new compounds and vote on the best.", quests: ["g9", "g10", "g5"] },
    ],
    extra: [
      Q("g7", "Pull the FDA-approved drug list", "expert", "S", 140, 10, [], null, { done: true, by: "Ade & Moss" }),
      Q("g8", "Check blood-brain barrier for 40 drugs", "expert", "M", 280, 30, ["loading 40 drug profiles…", "28 cross the barrier", "report drafted ✓"], { q: "12 drugs cross the barrier only weakly. Keep them?", opts: ["Keep them — dosing can fix it", "Drop them", "Ask the chemist"] }),
      Q("g9", "Train a generator on known EGFR inhibitors", "maker", "M", 300, 30, ["collecting 4,100 known inhibitors…", "training run 3 of 3", "model card posted ✓"], { q: "Two models work. Which do we use?", opts: ["Small and fast", "Bigger, slower, better"] }),
      Q("g10", "Filter 5,000 designs for toxicity", "checker", "S", 200, 20, ["running tox filters…", "38 borderline designs", "filtered list posted ✓"], { q: "38 designs are borderline toxic. Keep them?", opts: ["Drop them", "Flag them for the chemist"] }),
      Q("g11", "Run the top 3 drugs in the Basel lab", "maker", "M", 400, 40, ["confirming the slot…", "samples shipped", "results in ✓"], { q: "The lab offers a 4th well free. Use it?", opts: ["Add a 4th drug", "Run a control"] }),
      Q("g12", "Review 30 diet + drug combo studies", "expert", "M", 260, 25, ["pulling 30 studies…", "6 combos look promising", "shortlist posted ✓"], { q: "Two combos clash with chemo. Keep them?", opts: ["Drop them", "Flag for Dr. Lin"] }),
      Q("g6a", "Part 1 of 4 · first 250k molecules", "maker", "S", 300, 40, [], null, { done: true, by: "Kenji & Byte", parent: "g6" }),
      Q("g6b", "Part 2 of 4 · next 250k molecules", "maker", "S", 300, 40, [], null, { done: true, by: "Priya & Dock", parent: "g6" }),
      Q("g6c", "Part 3 of 4 · next 250k molecules", "maker", "S", 300, 40, ["queueing 250k molecules…", "docked 250k · 2 hits", "part 3 sent ✓"], { q: "2 hits sit right at the cutoff. Count them?", opts: ["Count both", "Only the stronger one", "Ask a Critic"] }, { parent: "g6" }),
      Q("g6d", "Part 4 of 4 · last 250k molecules", "maker", "S", 300, 40, ["queueing 250k molecules…", "docked 250k · 1 hit", "part 4 sent ✓"], { q: "One hit is a known toxic scaffold. Keep it?", opts: ["Drop it", "Keep it, flag it"] }, { parent: "g6" }),
    ],
    q: { g2: [1, "docking-pipeline · PR #142"], g3: [1, "review-20-results.md"], g4: [0, "Dr. Lin joined Wet Hands"], g5: [0, "weekly-post.md · 1.2k reads"],
         g6c: [2, "part-3-hits.csv · 2 candidates"], g6d: [1, "part-4-hits.csv · 1 candidate"], g8: [2, "bbb-check-40.csv · 2 candidates"], g11: [3, "basel-run-1 · lab report"], g12: [1, "combo-shortlist.md · 1 candidate"], g9: [1, "egfr-gen-v1 · model card"], g10: [1, "tox-filtered.csv · 1 candidate"] },
  },
  cad: { goal: "8 kernel features passing tests", target: 8, unit: "features",
    strategies: [
      { id: "cad-occ", name: "Build on OpenCascade", squad: "Kernel Crew", lead: "@kitbash", color: "var(--peach)", score: 3, backers: 88, raised: 3800, tags: ["Fast track"], rel: [["feeds", "cad-rust", "Beta revenue funds the Rust kernel"]], bet: "Wrap the proven OpenCascade kernel. Ship fast, inherit its quirks.", quests: ["c2", "c3", "c5"] },
      { id: "cad-users", name: "Users first", squad: "Field Team", lead: "Ade", color: "var(--green)", score: 1, backers: 41, raised: 600, tags: ["Low cost"], bet: "Talk to engineers and build only the features they use every day.", quests: ["c4", "c1"] },
      { id: "cad-rust", name: "New kernel in Rust", squad: "Rustaceans", lead: "Kenji", color: "var(--blue)", score: 0, backers: 63, raised: 2100, status: "queued", when: "Starts when the beta makes $20k", tags: ["Open science"], rel: [["needs", "cad-occ", "Starts on beta revenue"]], bet: "Write a clean kernel from scratch. Slower start, faster forever. Needs $40k upfront.", quests: ["c6"] },
    ],
    extra: [Q("c6", "Prototype NURBS surfaces in Rust", "maker", "M", 320, 30, ["setting up the crate…", "first surface renders", "benchmarks posted ✓"], { q: "It's 3× faster but has no fillets yet. Next?", opts: ["Add fillets next", "Benchmark more shapes first"] })],
    q: { c1: [1, "toolbar-prototype · Figma"], c2: [1, "step-import-report.md"], c3: [2, "fix-nurbs-booleans · PR #88"], c4: [1, "interviews-5.md"], c5: [2, "test-suite · 1000/1000"], c6: [2, "nurbs-rs · PR #12"] },
  },
  reef: { goal: "Check reef health at 200 dive sites", target: 200, unit: "sites",
    strategies: [
      { id: "reef-shops", name: "Pay local dive shops", squad: "Reef Ops", lead: "@bluecarbon", color: "var(--blue)", score: 120, backers: 74, raised: 2900, tags: ["Fast track"], bet: "Pay dive shops near each reef to log a health check.", quests: ["r1", "r2", "r3"] },
      { id: "reef-app", name: "Citizen divers", squad: "Bubble Club", lead: "Mo", color: "var(--peach)", score: 30, backers: 39, raised: 1100, tags: ["Low cost", "Open science"], bet: "Any recreational diver can upload a reef check from their phone.", quests: ["r4"] },
    ],
    extra: [Q("r4", "Ship a dive-log upload form", "maker", "S", 180, 15, ["sketching the form…", "tested with 5 divers", "form is live ✓"], { q: "Divers hate typing. What do we ask for?", opts: ["Photo + GPS only", "Photo, GPS and a 1–5 rating"] })],
    q: { r1: [40, "dive-log-matches.csv · 40 sites"], r2: [12, "12 dives booked"], r3: [0, "misses-report.md"], r4: [10, "upload-form · live"] },
  },
  tutor: { goal: "Map maths syllabi in 10 countries", target: 10, unit: "countries",
    strategies: [
      { id: "tutor-teach", name: "Teachers map it", squad: "Chalk Squad", lead: "@mrs.okafor", color: "var(--green)", score: 2, backers: 52, raised: 1500, tags: ["Patient-led"], bet: "Local teachers map their own syllabus. Slow, but right.", quests: ["t1", "t3", "t2"] },
      { id: "tutor-ai", name: "AI reads the PDFs", squad: "Parsers", lead: "Kenji", color: "var(--blue)", score: 1, backers: 47, raised: 1300, tags: ["Fast track", "Low cost"], bet: "Agents extract syllabi from government PDFs. Teachers spot-check.", quests: ["t4"] },
    ],
    extra: [Q("t4", "Extract syllabi from 6 government PDFs", "maker", "M", 300, 30, ["downloading 6 PDFs…", "412 topics extracted", "draft posted for spot-checks ✓"], { q: "Two PDFs are scanned images. What now?", opts: ["Run OCR and flag for teachers", "Skip them for now"] })],
    q: { t1: [1, "kenya-g4-syllabus.json"], t2: [0, "lesson-screen · sketches"], t3: [1, "3 teacher advisors"], t4: [3, "syllabi-6-countries.json"] },
  },
};
export function ensureStrategies(m) {
  if (m.strategies) return m.strategies;
  buildStrategies(m);
  // Backing a plan is a quest too, played as a Patron: put in money, or back it for free
  m.strategies.forEach(s => m.quests.push(Q(`${s.id}-back`, `Back ${s.squad}`, "patron", "S", 20, 0, [], null, { strat: s.id, back: s.id, gain: 0 })));
  return m.strategies;
}
function buildStrategies(m) {
  const cfg = STRATS[m.id];
  if (!cfg) {
    m.target = Math.max(3, m.quests.length); m.unit = "results";
    m.strategies = [{ id: m.id + "-s1", name: "Founding plan", squad: "Founders", lead: m.creator, color: "var(--peach)", score: 0, backers: 1, bet: "The creator's first plan. Propose a better one!" }];
    m.quests.forEach(q => { q.strat = m.strategies[0].id; if (q.gain == null) q.gain = 1; });
    return m.strategies;
  }
  m.stages[m.current].goal = cfg.goal;
  m.target = cfg.target; m.unit = cfg.unit;
  m.quests.push(...cfg.extra);
  m.strategies = cfg.strategies.map(({ quests, ...s }) => s);
  cfg.strategies.forEach(s => s.quests.forEach(id => { m.quests.find(q => q.id === id).strat = s.id; }));
  m.quests.forEach(q => {
    if (q.parent) { const p = m.quests.find(x => x.id === q.parent); q.strat = p.strat; (p.parts = p.parts || []).push(q.id); }
    Object.assign(q, QX[q.id] || {});
    const [gain, out] = cfg.q[q.id] || [0, ""];
    q.gain = q.gain ?? gain; q.out = q.out || out;
  });
  return m.strategies;
}
export const strats = m => ensureStrategies(m);
export const stratOf = q => { const [, m] = findQuest(q.id); return strats(m).find(s => s.id === q.strat); };
export const gateOf = m => { const have = strats(m).reduce((a, s) => a + s.score, 0); return { have, need: m.target, unit: m.unit, pct: Math.min(100, have / m.target * 100) }; };
export const playable = q => q.back ? !q.done : !q.done && !q.state && !q.parts && !q.claimed && !q.blocked && !lockedBy(q) && stratLive(q);
// A quest can wait on another quest, and on its strategy being live
export const lockedBy = q => { if (!q.after) return null; const [d] = findQuest(q.after); return d && !d.done ? d : null; };
export const stratLive = q => { if (!q.strat) return true; const [, m] = findQuest(q.id); const s = m && m.strategies && m.strategies.find(x => x.id === q.strat); return !s || !s.status; };
// Players see three states: Racing, Waiting (with one short reason) and Won. Merged plans are hidden.
export const waitWhy = s => s.status === "proposed" ? `Needs ${Math.max(1, s.need - s.backers)} more backers` : s.status === "review" ? "Waiting for the mission's OK" : s.status === "queued" ? (s.when || "Starts later") : "";
export const STATUS = { proposed: s => `Waiting · ${waitWhy(s)}`, review: s => `Waiting · ${waitWhy(s)}`, queued: s => `Waiting · ${waitWhy(s)}`, merged: s => `Merged into ${s.into}` };
export const shown = m => strats(m).filter(s => s.status !== "merged");
export const leaderOf = m => [...strats(m)].sort((a, b) => b.score - a.score)[0];
// Every plan belongs to a squad: its people (each with an agent) race the plan together.
// Named players come from PEOPLE; the rest of the headcount is filled from the plan's size.
export function squadOf(m, s) {
  const named = Object.entries(PEOPLE).filter(([, p]) => p.squad === s.squad).map(([n, p]) => ({ who: n, color: p.color, agent: p.agent }));
  if (!named.some(x => x.who === s.lead)) named.unshift({ who: s.lead, color: s.color, lead: true });
  const you = S.squads?.[m.id] === s.id;
  const people = Math.max(named.length + (you ? 1 : 0), s.crew || Math.max(3, Math.round(s.backers / 15)));
  return { name: s.squad, named, you, people, agents: people + (s.status ? 0 : 2) };
}
// Which plan's squad you're in for a mission, if any
export const mySquad = m => strats(m).find(s => s.id === S.squads?.[m.id]);
