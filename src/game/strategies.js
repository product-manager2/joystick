import { Q } from "../data/content.js";
import { color } from "../design/tokens.js";
import { S } from "../state.js";
import { findQuest, gain } from "../ui/helpers.js";

// ===================== Milestones & strategies =====================
// Each stage is a milestone with a measurable gate. Squads race different strategies at it,
// every strategy's results pool toward the gate, and any quest can be split into parts.
export const STRATS = {
  glio: { goal: "Shortlist 10 verified drug candidates", target: 10, unit: "candidates",
    strategies: [
      { id: "glio-dock", name: "Brute-force docking", squad: "Fold Gang", lead: "Priya", color: "var(--red)", score: 4, backers: 212, bet: "Dock all 1M ZINC compounds on rented GPUs. Wide net, fast.", quests: ["g1", "g2", "g6"] },
      { id: "glio-repurpose", name: "Repurpose approved drugs", squad: "Wet Hands", lead: "Ade", color: "var(--green)", score: 2, backers: 148, bet: "Screen 2,800 FDA-approved drugs. Fewer hits, much faster path to trial.", quests: ["g7", "g8", "g3", "g4"] },
      { id: "glio-gen", name: "Generate new molecules", squad: "Swarm 404", lead: "Mo", color: "var(--blue)", score: 1, backers: 96, bet: "200 small agents design brand-new compounds and vote on the best.", quests: ["g9", "g10", "g5"] },
    ],
    extra: [
      Q("g7", "Pull the FDA-approved drug list", "explorer", "S", 140, 10, [], null, { done: true, by: "Ade & Moss" }),
      Q("g8", "Check blood-brain barrier for 40 drugs", "investigator", "M", 280, 30, ["loading 40 drug profiles…", "28 cross the barrier", "report drafted ✓"], { q: "12 drugs cross the barrier only weakly. Keep them?", opts: ["Keep them — dosing can fix it", "Drop them", "Ask the chemist"] }),
      Q("g9", "Train a generator on known EGFR inhibitors", "implementer", "M", 300, 30, ["collecting 4,100 known inhibitors…", "training run 3 of 3", "model card posted ✓"], { q: "Two models work. Which do we use?", opts: ["Small and fast", "Bigger, slower, better"] }),
      Q("g10", "Filter 5,000 designs for toxicity", "critic", "S", 200, 20, ["running tox filters…", "38 borderline designs", "filtered list posted ✓"], { q: "38 designs are borderline toxic. Keep them?", opts: ["Drop them", "Flag them for the chemist"] }),
      Q("g6a", "Shard A · compounds 1–250k", "implementer", "S", 300, 40, [], null, { done: true, by: "Kenji & Byte", parent: "g6" }),
      Q("g6b", "Shard B · compounds 250k–500k", "implementer", "S", 300, 40, [], null, { done: true, by: "Priya & Dock", parent: "g6" }),
      Q("g6c", "Shard C · compounds 500k–750k", "implementer", "S", 300, 40, ["queueing 250k compounds…", "docked 250k · 2 hits", "shard C submitted ✓"], { q: "2 hits sit right at the cutoff. Count them?", opts: ["Count both", "Only the stronger one", "Ask a Critic"] }, { parent: "g6" }),
      Q("g6d", "Shard D · compounds 750k–1M", "implementer", "S", 300, 40, ["queueing 250k compounds…", "docked 250k · 1 hit", "shard D submitted ✓"], { q: "One hit is a known toxic scaffold. Keep it?", opts: ["Drop it", "Keep it, flag it"] }, { parent: "g6" }),
    ],
    q: { g2: [1, "docking-pipeline · PR #142"], g3: [1, "review-20-results.md"], g4: [0, "Dr. Lin joined Wet Hands"], g5: [0, "weekly-post.md · 1.2k reads"],
         g6c: [2, "shard-C-hits.csv · 2 candidates"], g6d: [1, "shard-D-hits.csv · 1 candidate"], g8: [2, "bbb-check-40.csv · 2 candidates"], g9: [1, "egfr-gen-v1 · model card"], g10: [1, "tox-filtered.csv · 1 candidate"] },
  },
  cad: { goal: "8 kernel features passing tests", target: 8, unit: "features",
    strategies: [
      { id: "cad-occ", name: "Build on OpenCascade", squad: "Kernel Crew", lead: "@kitbash", color: "var(--peach)", score: 3, backers: 88, bet: "Wrap the proven OpenCascade kernel. Ship fast, inherit its quirks.", quests: ["c2", "c3", "c5"] },
      { id: "cad-users", name: "Users first", squad: "Field Team", lead: "Ade", color: "var(--green)", score: 1, backers: 41, bet: "Talk to engineers and build only the features they use every day.", quests: ["c4", "c1"] },
      { id: "cad-rust", name: "New kernel in Rust", squad: "Rustaceans", lead: "Kenji", color: "var(--blue)", score: 0, backers: 63, bet: "Write a clean kernel from scratch. Slower start, faster forever.", quests: ["c6"] },
    ],
    extra: [Q("c6", "Prototype NURBS surfaces in Rust", "implementer", "M", 320, 30, ["setting up the crate…", "first surface renders", "benchmarks posted ✓"], { q: "It's 3× faster but has no fillets yet. Next?", opts: ["Add fillets next", "Benchmark more shapes first"] })],
    q: { c1: [1, "toolbar-prototype · Figma"], c2: [1, "step-import-report.md"], c3: [2, "fix-nurbs-booleans · PR #88"], c4: [1, "interviews-5.md"], c5: [2, "test-suite · 1000/1000"], c6: [2, "nurbs-rs · PR #12"] },
  },
  reef: { goal: "Check reef health at 200 dive sites", target: 200, unit: "sites",
    strategies: [
      { id: "reef-shops", name: "Pay local dive shops", squad: "Reef Ops", lead: "@bluecarbon", color: "var(--blue)", score: 120, backers: 74, bet: "Pay dive shops near each reef to log a health check.", quests: ["r1", "r2", "r3"] },
      { id: "reef-app", name: "Citizen divers", squad: "Bubble Club", lead: "Mo", color: "var(--peach)", score: 30, backers: 39, bet: "Any recreational diver can upload a reef check from their phone.", quests: ["r4"] },
    ],
    extra: [Q("r4", "Ship a dive-log upload form", "artisan", "S", 180, 15, ["sketching the form…", "tested with 5 divers", "form is live ✓"], { q: "Divers hate typing. What do we ask for?", opts: ["Photo + GPS only", "Photo, GPS and a 1–5 rating"] })],
    q: { r1: [40, "dive-log-matches.csv · 40 sites"], r2: [12, "12 dives booked"], r3: [0, "misses-report.md"], r4: [10, "upload-form · live"] },
  },
  tutor: { goal: "Map maths syllabi in 10 countries", target: 10, unit: "countries",
    strategies: [
      { id: "tutor-teach", name: "Teachers map it", squad: "Chalk Squad", lead: "@mrs.okafor", color: "var(--green)", score: 2, backers: 52, bet: "Local teachers map their own syllabus. Slow, but right.", quests: ["t1", "t3", "t2"] },
      { id: "tutor-ai", name: "AI reads the PDFs", squad: "Parsers", lead: "Kenji", color: "var(--blue)", score: 1, backers: 47, bet: "Agents extract syllabi from government PDFs. Teachers spot-check.", quests: ["t4"] },
    ],
    extra: [Q("t4", "Extract syllabi from 6 government PDFs", "implementer", "M", 300, 30, ["downloading 6 PDFs…", "412 topics extracted", "draft posted for spot-checks ✓"], { q: "Two PDFs are scanned images. What now?", opts: ["Run OCR and flag for teachers", "Skip them for now"] })],
    q: { t1: [1, "kenya-g4-syllabus.json"], t2: [0, "lesson-screen · sketches"], t3: [1, "3 teacher advisors"], t4: [3, "syllabi-6-countries.json"] },
  },
};
export function ensureStrategies(m) {
  if (m.strategies) return m.strategies;
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
    const [gain, out] = cfg.q[q.id] || [0, ""];
    q.gain = q.gain ?? gain; q.out = q.out || out;
  });
  return m.strategies;
}
export const strats = m => ensureStrategies(m);
export const stratOf = q => { const [, m] = findQuest(q.id); return strats(m).find(s => s.id === q.strat); };
export const gateOf = m => { const have = strats(m).reduce((a, s) => a + s.score, 0); return { have, need: m.target, unit: m.unit, pct: Math.min(100, have / m.target * 100) }; };
export const playable = q => !q.done && !q.state && !q.parts;
export const leaderOf = m => [...strats(m)].sort((a, b) => b.score - a.score)[0];
