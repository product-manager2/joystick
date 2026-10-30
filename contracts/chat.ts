export interface User { id: string; username: string; email: string|null; name: string }
export interface Room { id: string; title: string; kind: 'agent'|'dm'|'mission'|'stage'|'plan'|'quest' }
// An action the room agent offered one person; nothing happens until that person taps it.
export interface RoomAction { kind: 'back_squad' | 'claim_task' | 'join_squad' | 'draft_work'; forUserId: string; label: string; missionId: string; planId?: string; questId?: string; credits?: number; handIn?: boolean }
export interface Message { id: string; roomId: string; sequence: number; role: 'user' | 'assistant'; text: string; senderId?: string; senderName?: string; clientId?: string; providerEventId?: string; action?: RoomAction; createdAt: string }
export type ClientFrame = { type: 'authenticate'; ticket: string } | { type: 'subscribe'; roomId: string; after?: number } | { type: 'message.send'; roomId: string; clientId: string; text: string };
export type ServerFrame = { type: 'ready' } | { type: 'subscribed'; roomId: string } | { type: 'message.saved'; message: Message } | { type: 'message.delta'; roomId: string; messageId: string; text: string } | { type: 'agent.status'; roomId: string; status: string; message?: string } | { type: 'agent.activity'; roomId: string } | { type: 'error'; code: string; message: string; clientId?: string };
