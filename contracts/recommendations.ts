export type RecommendationRequest = {
  kind: 'missions' | 'plans' | 'tasks';
  missionId?: string;
  stageId?: string;
  planId?: string;
};

export type RecommendationResponse = {
  source: 'jev' | 'fallback';
  scores: Record<string, number>;
  expiresAt: number;
};
