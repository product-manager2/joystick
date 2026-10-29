export interface User { id: string; email: string; name: string }
export interface Room { id: string; title: string; kind: 'agent' }
export interface Message { id: string; roomId: string; sequence: number; role: 'user' | 'assistant'; text: string; clientId?: string; providerEventId?: string; createdAt: string }
export type ClientFrame = { type: 'authenticate'; ticket: string } | { type: 'subscribe'; roomId: string; after?: number } | { type: 'message.send'; roomId: string; clientId: string; text: string };
export type ServerFrame = { type: 'ready' } | { type: 'subscribed'; roomId: string } | { type: 'message.saved'; message: Message } | { type: 'message.delta'; roomId: string; messageId: string; text: string } | { type: 'agent.status'; roomId: string; status: string; message?: string } | { type: 'error'; code: string; message: string; clientId?: string };
