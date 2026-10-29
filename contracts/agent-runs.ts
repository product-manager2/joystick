export const AGENT_RUN_KINDS = ['mission-draft','plan-draft','quest-draft','quest-execute','context-chat'] as const;
export type AgentRunKind = typeof AGENT_RUN_KINDS[number];
export type AgentRunStatus = 'queued'|'starting'|'running'|'needs_input'|'completed'|'failed'|'uncertain'|'cancelled';
export interface AgentRunInput { requestId:string; kind:AgentRunKind; missionId?:string; planId?:string; questId?:string; prompt?:string }
export interface AgentRun { id:string; kind:AgentRunKind; status:AgentRunStatus; missionId:string|null; planId:string|null; questId:string|null; roomId:string|null; prompt:string; response:string|null; error:string|null; createdAt:string; updatedAt:string }
export interface AgentDraft { id:string; kind:'mission'|'plan'|'quest'; data:Record<string,unknown>; createdAt:string }
export interface AgentArtifact { id:string; title:string; content:string; contentType:string; version:number; createdAt:string }
export interface AgentDecision { id:string; prompt:string; options:Array<{id:string;label:string}>; selectedOptionId:string|null; createdAt:string }
export interface AgentRunDetail { run:AgentRun; drafts:AgentDraft[]; artifacts:AgentArtifact[]; decisions:AgentDecision[] }
