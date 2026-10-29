import { api, live } from "./game-client.js";
import { threads } from "../state.js";
import { resolveApiOrigin } from "./api-origin.js";

const origin = resolveApiOrigin(import.meta.env.VITE_WS_ORIGIN || import.meta.env.VITE_API_ORIGIN, location.origin, import.meta.env.PROD);
const states = new Map();
let socket, connecting, ready = false, reconnect;
let onChange = () => {};
export function onRoomsChanged(callback) { onChange = callback; }
export function roomState(id) {
  if (!states.has(id)) states.set(id, { messages: [], cursor: 0, pending: new Map(), activities: [], preview: null });
  return states.get(id);
}
export async function loadRoom(id) {
  const state = roomState(id);
  const { messages = [] } = await api(`/rooms/${encodeURIComponent(id)}/messages?after=${state.cursor}`);
  for (const message of messages) save(message);
  if (isAgentRoom(id)) await refreshRoomActivity(id).catch(() => {});
  subscribe(id);
  return state;
}
function isAgentRoom(id) { return live.snapshot?.threads?.some(room => room.id === id && room.kind === "agent"); }
export async function refreshRoomActivity(id) {
  if (!live.user || !isAgentRoom(id)) return;
  const account = live.user, state = roomState(id), request = (state.activityRequest || 0) + 1;
  state.activityRequest = request;
  const { activities = [] } = await api(`/rooms/${encodeURIComponent(id)}/agent-activity`);
  if (live.user !== account || !isAgentRoom(id) || states.get(id) !== state || request !== state.activityRequest) return;
  const next = activities.filter(activity => activity && typeof activity.id === "string");
  if (JSON.stringify(state.activities) !== JSON.stringify(next)) {
    const completed = next.some(activity => activity.status === "completed" && !state.activities.some(old => old.id === activity.id && old.status === "completed"));
    state.activities = next;
    onChange({ type: "agent.activity", roomId: id, completed });
  }
}
export async function markRoomRead(id) {
  const state=roomState(id), sequence=Math.max(0,...state.messages.filter(m=>!m.pending).map(m=>Number(m.sequence)||0));
  if (!sequence || sequence <= (state.readCursor||0)) return;
  await api(`/rooms/${encodeURIComponent(id)}/read`,{method:"POST",body:JSON.stringify({sequence})});
  state.readCursor=sequence;
  const room=live.snapshot?.threads?.find(t=>t.id===id);
  if(room)room.unread=0;
  const summary=threads.find(t=>t.id===id);
  if(summary)summary.unread=0;
  onChange({type:"room.read",roomId:id});
}
function save(message) {
  const state = roomState(message.roomId);
  const i = state.messages.findIndex(m => m.id === message.id || (message.clientId && m.clientId === message.clientId));
  if (i < 0) state.messages.push(message); else state.messages[i] = message;
  state.messages.sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity));
  state.cursor = Math.max(state.cursor, message.sequence || 0);
  state.pending.delete(message.clientId);
  if (message.role === "assistant" && state.preview?.messageId === message.providerEventId) state.preview = null;
  onChange(message);
}
function send(frame) { if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame)); }
function subscribe(id) { send({ type: "subscribe", roomId: id, after: roomState(id).cursor }); }
export async function connectRooms() {
  if (connecting || socket?.readyState === WebSocket.OPEN || !live.user) return connecting;
  connecting = (async () => {
    const { ticket } = await api("/ws-ticket", { method: "POST", body: "{}" });
    const url = new URL("/api/v1/ws", origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onopen = () => socket.send(JSON.stringify({ type: "authenticate", ticket }));
    socket.onmessage = event => {
      let frame; try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.type === "ready") { ready = true; for (const id of states.keys()) { subscribe(id); if (isAgentRoom(id)) refreshRoomActivity(id).catch(() => {}); } for (const [id, state] of states) for (const message of state.pending.values()) send({ type: "message.send", roomId: id, clientId: message.clientId, text: message.text }); }
      if (frame.type === "message.saved" && frame.message) save(frame.message);
      if (frame.type === "message.delta" && isAgentRoom(frame.roomId) && typeof frame.text === "string") { const state = roomState(frame.roomId); if (!state.messages.some(message => message.providerEventId === frame.messageId)) { state.preview = { messageId: frame.messageId, text: (state.preview?.messageId === frame.messageId ? state.preview.text : "") + frame.text }; onChange({type:"message.delta",roomId:frame.roomId}); } }
      if (frame.type === "agent.activity") refreshRoomActivity(frame.roomId).catch(() => {});
      if (frame.type === "error" && frame.clientId) { for (const state of states.values()) { const message = state.pending.get(frame.clientId); if (message) { message.error = frame.message || "Could not send"; state.pending.delete(frame.clientId); onChange(); } } }
    };
    socket.onclose = () => { ready = false; socket = null; for (const [id,state] of states) if (state.preview) { state.preview=null; onChange({type:"message.delta",roomId:id}); } clearTimeout(reconnect); if (live.user) reconnect = setTimeout(() => { connecting = null; connectRooms(); }, 1200); };
    socket.onerror = () => socket.close();
  })().catch(() => { connecting = null; clearTimeout(reconnect); reconnect = setTimeout(connectRooms, 1500); });
  return connecting;
}
export function sendRoom(id, text) {
  const message = { roomId: id, clientId: crypto.randomUUID(), role: "user", senderId: live.user.id, senderName: live.user.name, text, createdAt: new Date().toISOString(), pending: true };
  const state = roomState(id);
  state.messages.push(message); state.pending.set(message.clientId, message); onChange();
  if (!ready) connectRooms(); else send({ type: "message.send", roomId: id, clientId: message.clientId, text });
}
export function resetRooms() {
  clearTimeout(reconnect);
  reconnect = null;
  ready = false;
  connecting = null;
  states.clear();
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
}
setInterval(() => {
  if (document.visibilityState === "hidden" || !live.user) return;
  for (const id of states.keys()) if (isAgentRoom(id)) refreshRoomActivity(id).catch(() => {});
}, 7000);
