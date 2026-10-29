import { api, live } from "./game-client.js";
import { resolveApiOrigin } from "./api-origin.js";

const origin = resolveApiOrigin(import.meta.env.VITE_WS_ORIGIN || import.meta.env.VITE_API_ORIGIN, location.origin, import.meta.env.PROD);
const states = new Map();
let socket, connecting, ready = false, reconnect;
let onChange = () => {};
export function onRoomsChanged(callback) { onChange = callback; }
export function roomState(id) {
  if (!states.has(id)) states.set(id, { messages: [], cursor: 0, pending: new Map() });
  return states.get(id);
}
export async function loadRoom(id) {
  const state = roomState(id);
  const { messages = [] } = await api(`/rooms/${encodeURIComponent(id)}/messages?after=${state.cursor}`);
  for (const message of messages) save(message);
  subscribe(id);
  return state;
}
function save(message) {
  const state = roomState(message.roomId);
  const i = state.messages.findIndex(m => m.id === message.id || (message.clientId && m.clientId === message.clientId));
  if (i < 0) state.messages.push(message); else state.messages[i] = message;
  state.messages.sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity));
  state.cursor = Math.max(state.cursor, message.sequence || 0);
  state.pending.delete(message.clientId);
  onChange();
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
      if (frame.type === "ready") { ready = true; for (const id of states.keys()) subscribe(id); for (const [id, state] of states) for (const message of state.pending.values()) send({ type: "message.send", roomId: id, clientId: message.clientId, text: message.text }); }
      if (frame.type === "message.saved" && frame.message) save(frame.message);
      if (frame.type === "error" && frame.clientId) { for (const state of states.values()) { const message = state.pending.get(frame.clientId); if (message) { message.error = frame.message || "Could not send"; state.pending.delete(frame.clientId); onChange(); } } }
    };
    socket.onclose = () => { ready = false; socket = null; clearTimeout(reconnect); if (live.user) reconnect = setTimeout(() => { connecting = null; connectRooms(); }, 1200); };
    socket.onerror = () => socket.close();
  })().catch(() => { connecting = null; clearTimeout(reconnect); reconnect = setTimeout(connectRooms, 1500); });
  return connecting;
}
export function sendRoom(id, text) {
  const message = { roomId: id, clientId: crypto.randomUUID(), role: "user", senderId: live.user.id, senderName: live.user.name, text, pending: true };
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
