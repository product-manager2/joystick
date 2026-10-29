export const GAME_ACTIONS = [
  'profile.update','mission.create','mission.update','mission.join','mission.leave',
  'stage.create','stage.approve','stage.advance','plan.create','plan.update','plan.join',
  'quest.create','quest.update','quest.claim','quest.release','quest.assign','quest.decide','quest.submit','quest.review',
  'need.create','need.support','pledge.create','invite.create','invite.accept','invite.decline',
  'notification.read','funding.reserve','payout.simulate','room.create',
  'mission.voice','plan.back','plan.approve','merge.propose','merge.decide','merge.dismiss',
  'quest.watch','quest.nudge','pair.request','spend.flag','tool.preference','skill.assert',
] as const;
export type GameAction = typeof GAME_ACTIONS[number];
export interface GameActionInput { action: GameAction; entityId?: string; payload?: Record<string,unknown>; requestId: string }
export interface GameSnapshot {
  revision: number;
  profile: Record<string,unknown>;
  missions: Record<string,unknown>[];
  threads: Record<string,unknown>[];
  people: Record<string,unknown>[];
  trust: Record<string,unknown>;
  notifications: Record<string,unknown>[];
  wallet: Record<string,unknown>;
  invites: Record<string,unknown>[];
  policy: Record<string,unknown>;
}
