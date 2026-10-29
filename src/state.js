import { onboard } from "./screens/onboarding.js";
import { thread } from "./ui/helpers.js";

// ===================== State =====================
export const S = {
  live: false, screen: "lobby", ob: 0,
  name: "", agentName: "Pip", roles: [],
  level: 1, xp: 0, xpMax: 1200, coins: 0,
  joined: {}, squads: {}, missionId: "glio", tab: "map", filter: "All",
  learned: [], together: 0, shipped: 0, values: [],
  badges: [],
  thread: null,
  forge: null,
  pendingQuest: null,
  botShape: "blob", from: null, styleOpen: false, home: "deck",
  skills: [], tools: { "Shared drive": true, "GPU pool": true }, credits: [], notifs: [], spendCap: 25, kyc: false,
  wallet: { shares: {}, timeCredits: 0, insights: 0, pending: 0 }, stakes: {}, voiced: {}, mergeSeen: {}, pledge: { time: 5, money: 25, compute: 20 }, showAll: {},
};
export const threads = [
  { id: "partner", kind: "agent", title: "", unread: 1, msgs: [] },
];
export const TEAMMATES = [["Rosa", "var(--pink)"], ["Kenji", "var(--sky)"], ["Ade", "var(--leaf)"], ["Mo", "var(--gold)"]];
