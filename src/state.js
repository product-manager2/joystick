import { onboard } from "./screens/onboarding.js";
import { thread } from "./ui/helpers.js";

// ===================== State =====================
export const S = {
  screen: "onboard", ob: 0,
  name: "", agentName: "Pip", roles: [],
  level: 4, xp: 640, xpMax: 1200, coins: 180, sync: 24, streak: 3,
  joined: {}, missionId: "glio", tab: "map", filter: "All",
  learned: [], together: 0, solo: 0,
  badges: [],
  thread: null,
  forge: null,
  pendingQuest: null,
  botColor: "var(--white)", raid: 0, from: null, styleOpen: false, home: "deck",
  wallet: { shares: {}, timeCredits: 0, insights: 0 }, votes: {}, locked: {}, pledge: { time: 5, money: 25, compute: 20 }, showAll: {},
};
export const threads = [
  { id: "partner", kind: "agent", title: "", unread: 1, msgs: [] },
];
export const TEAMMATES = [["Rosa", "var(--pink)"], ["Kenji", "var(--sky)"], ["Ade", "var(--leaf)"], ["Mo", "var(--gold)"]];
