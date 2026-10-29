import type { GameAction } from './game.js';

export type AgentCommand = GameAction | 'chat.send' | 'chat.read' | 'agent_run.create' | 'agent_run.decide' | 'agent_run.cancel' | 'artifact.download' | 'credits.export' | 'ui.open' | 'passkeys.manage';
export interface AgentCommandInput { command: AgentCommand | string; entityId?: string; payload?: Record<string, unknown> }
export interface AgentQueryInput { view: string; entityId?: string; query?: string; after?: number; limit?: number }
export interface AgentCommandInfo { name: AgentCommand; description: string; entityId?: string; payload?: string; kind: 'write' | 'read' | 'handoff' }
export interface AgentCommandResult { ok: true; command: string; summary: string; data?: unknown; handoff?: {type:'navigate';screen:string;entityId?:string}|{type:'download';path:string;label:string} }
