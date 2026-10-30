import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { resolveApiOrigin } from "./api-origin.js";
import "../design/tokens.css";
import "../design/base.css";
import "../design/components.css";
import "./style.css";

const root = document.querySelector("#live");
let apiOrigin, wsOrigin;
let apiConfigError;
try {
  apiOrigin = resolveApiOrigin(import.meta.env.VITE_API_ORIGIN, location.origin, import.meta.env.PROD);
  wsOrigin = resolveApiOrigin(import.meta.env.VITE_WS_ORIGIN, apiOrigin, import.meta.env.PROD);
}
catch (error) { apiConfigError = error; }
const state = {
  epoch: 0, user: null, room: null, agentAvailable: false, messages: [], previews: new Map(),
  finalizedPreviews: new Set(), socket: null, retryTimer: null, gapTimer: null,
  retryCount: 0, cursor: 0, online: false, connectionAttempt: 0,
};

async function request(path, options = {}) {
  const response = await fetch(new URL(`/api/v1${path}`, apiOrigin), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issue = body.error;
    const error = new Error(issue?.message || body.message || "Something went wrong. Please try again.");
    error.status = response.status;
    error.code = issue?.code;
    throw error;
  }
  return body;
}

function errorText(error) {
  if (error?.name === "NotAllowedError" || error?.name === "AbortError") return "Passkey was cancelled. Try again when you’re ready.";
  if (error?.name === "NotSupportedError" || error?.name === "SecurityError") return "Passkeys are not available here. Try a browser or device that supports passkeys.";
  return error?.message || "Something went wrong. Please try again.";
}

function stopConnection() {
  ++state.connectionAttempt;
  clearTimeout(state.retryTimer);
  clearTimeout(state.gapTimer);
  state.retryTimer = null;
  state.gapTimer = null;
  const socket = state.socket;
  state.socket = null;
  state.online = false;
  if (socket) { socket.onclose = null; socket.close(); }
}

function clearAccount() {
  ++state.epoch;
  stopConnection();
  state.user = null;
  state.room = null;
  state.messages = [];
  state.previews.clear();
  state.finalizedPreviews.clear();
  state.cursor = 0;
  state.agentAvailable = false;
  state.retryCount = 0;
}

function authView(mode = "signup", message = "") {
  // Switching forms invalidates any in-flight options or device prompt.
  ++state.epoch;
  root.innerHTML = `<div class="live-auth-wrap"><a class="live-logo" href="/">Joystick<span class="live-logo-dot">.</span></a>
    <main class="live-auth card" aria-labelledby="auth-title">
      <div class="live-kicker">Your space</div>
      <h1 id="auth-title" class="display">${mode === "signup" ? "Start with a passkey." : "Welcome back."}</h1>
      <p class="live-intro">${mode === "signup" ? "Create your account to keep a private conversation with your agent." : "Use your passkey to open your private chat."}</p>
      <div class="live-switch" role="group" aria-label="Account action"><button type="button" data-mode="signup" aria-pressed="${mode === "signup"}">Create account</button><button type="button" data-mode="login" aria-pressed="${mode === "login"}">Sign in</button></div>
      <form id="auth-form" data-mode="${mode}">
        ${mode === "signup" ? `<label for="account-username">Pick a username</label><input id="account-username" class="inp" name="username" autocomplete="username webauthn" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" title="3 to 20 letters, numbers or _">` : `<label for="account-username">Username <span class="muted">(optional)</span></label><input id="account-username" class="inp" name="username" autocomplete="username webauthn" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="Or just tap sign in">`}
        <button class="btn red block" type="submit">${mode === "signup" ? "Create account with passkey" : "Sign in with passkey"}</button>
      </form>
      <p class="live-form-error" id="auth-error" role="alert">${escapeHtml(message)}</p>
      <p class="live-fine">Your device will ask you to create or use a passkey. No password or email code needed.</p>
    </main><a class="live-demo-link" href="/">Explore the demo</a></div>`;
  root.querySelectorAll("[data-mode]").forEach(button => {
    if (button.tagName === "BUTTON") button.addEventListener("click", () => authView(button.dataset.mode));
  });
  root.querySelector("#auth-form").addEventListener("submit", authenticate);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

async function authenticate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const mode = form.dataset.mode;
  const epoch = ++state.epoch;
  const button = form.querySelector("button[type=submit]");
  const error = root.querySelector("#auth-error");
  const username = form.elements.username.value.trim();
  if (mode === "signup" && !username) return;
  button.disabled = true;
  button.textContent = "Waiting for your passkey…";
  error.textContent = "";
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext) throw Object.assign(new Error(), { name: "NotSupportedError" });
    const base = mode === "signup" ? "/auth/register" : "/auth/login";
    const { options } = await request(`${base}/options`, { method: "POST", body: JSON.stringify({ username }) });
    if (epoch !== state.epoch) return;
    const response = mode === "signup" ? await startRegistration({ optionsJSON: options }) : await startAuthentication({ optionsJSON: options });
    if (epoch !== state.epoch) return;
    const result = await request(`${base}/verify`, { method: "POST", body: JSON.stringify({ response }) });
    if (epoch !== state.epoch) return;
    await enterAccount(result.user, epoch);
  } catch (caught) {
    if (epoch === state.epoch) error.textContent = errorText(caught);
  } finally {
    if (epoch === state.epoch && button.isConnected) {
      button.disabled = false;
      button.textContent = mode === "signup" ? "Create account with passkey" : "Sign in with passkey";
    }
  }
}

async function enterAccount(user, epoch = state.epoch) {
  state.user = user;
  state.messages = [];
  state.previews.clear();
  state.finalizedPreviews.clear();
  state.cursor = 0;
  let rooms, agentAvailable;
  try { ({ rooms, agentAvailable } = await request("/rooms")); }
  catch (error) {
    if (epoch === state.epoch) recoveryView(errorText(error));
    return;
  }
  if (epoch !== state.epoch) return;
  state.room = rooms.find(room => room.kind === "agent") || rooms[0];
  state.agentAvailable = Boolean(agentAvailable);
  if (!state.room) { recoveryView("Your chat is not ready yet. Please try again shortly."); return; }
  chatView();
  try { await catchUp(epoch); }
  catch (error) {
    if (epoch !== state.epoch) return;
    if (error.status === 401) { await checkAccess(epoch); return; }
    updateStatus("Previous messages couldn’t load. Reconnecting to your chat…");
  }
  if (epoch !== state.epoch) return;
  connect(epoch);
}

function chatView() {
  root.innerHTML = `<div class="live-chat-shell">
    <header class="live-header"><a class="live-logo" href="/">Joystick<span class="live-logo-dot">.</span></a><div class="live-header-actions"><span class="live-user" id="user-name"></span><button class="live-signout" id="signout" type="button">Sign out</button></div></header>
    <main class="live-chat-main" aria-label="Private agent chat"><div class="live-chat-head"><div class="live-agent-mark" aria-hidden="true">✦</div><div><div class="live-kicker">Your private space</div><h1 class="display" id="room-title"></h1><p class="live-chat-subtitle">A place to think, ask, and make progress together.</p></div></div>
      <p class="live-status" id="agent-status" role="status"></p>
      <div class="live-messages" id="messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text"></div>
      <form class="live-composer card" id="composer"><label class="sr-only" for="message-input">Message your agent</label><textarea id="message-input" rows="1" maxlength="4000" placeholder="What’s on your mind?" required></textarea><button class="btn red" type="submit" aria-label="Send message">Send <span aria-hidden="true">↗</span></button></form>
    </main><div class="live-footer">Your messages are saved to your account.</div>
  </div>`;
  root.querySelector("#user-name").textContent = state.user.name || state.user.username;
  root.querySelector("#room-title").textContent = state.room.title || "Your agent";
  root.querySelector("#signout").addEventListener("click", signOut);
  root.querySelector("#composer").addEventListener("submit", sendMessage);
  root.querySelector("#message-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); root.querySelector("#composer").requestSubmit(); }
  });
  updateStatus();
  renderMessages();
}

function updateStatus(override) {
  const target = root.querySelector("#agent-status");
  if (!target) return;
  target.className = `live-status ${state.agentAvailable ? (state.online ? "connected" : "connecting") : "unavailable"}`;
  target.textContent = override || (!state.agentAvailable ? "Chat is saved. Your agent is not connected yet." : state.online ? "Agent connected" : "Reconnecting to your chat…");
}

function messageNode(message) {
  const row = document.createElement("article");
  row.className = `live-message ${message.role === "user" ? "mine" : "agent"}`;
  row.dataset.key = message.id || message.clientId;
  const label = document.createElement("div");
  label.className = "live-message-label";
  label.textContent = message.role === "user" ? "You" : "Agent";
  const bubble = document.createElement("div");
  bubble.className = "live-bubble";
  bubble.textContent = message.text;
  row.append(label, bubble);
  if (message.role === "user") {
    const meta = document.createElement("div");
    meta.className = "live-message-meta";
    meta.textContent = message.delivery === "error" ? (message.failure || "Couldn’t send") : message.delivery === "pending" ? "Pending…" : "Saved";
    row.append(meta);
    if (message.delivery === "error") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "live-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => retryMessage(message.clientId));
      row.append(retry);
    }
  }
  return row;
}

function renderMessages() {
  const target = root.querySelector("#messages");
  if (!target) return;
  const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
  target.replaceChildren();
  if (!state.messages.length && !state.previews.size) {
    const empty = document.createElement("div");
    empty.className = "live-empty";
    empty.innerHTML = `<span aria-hidden="true">✦</span><h2>Start a conversation.</h2><p>Your messages will be here when you return.</p>`;
    target.append(empty);
  } else {
    for (const message of state.messages) target.append(messageNode(message));
    for (const [id, text] of state.previews) target.append(messageNode({ id, role: "assistant", text }));
  }
  if (atBottom) target.scrollTop = target.scrollHeight;
}

function insertSaved(message) {
  if (message.roomId !== state.room?.id) return;
  const index = state.messages.findIndex(item => item.id === message.id || (message.clientId && item.clientId === message.clientId));
  const saved = { ...message, delivery: "saved" };
  if (index >= 0) state.messages[index] = saved;
  else state.messages.push(saved);
  if (message.role === "assistant") {
    if (message.providerEventId) {
      state.previews.delete(message.providerEventId);
      state.finalizedPreviews.add(message.providerEventId);
    } else state.previews.clear();
  }
  state.messages.sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity));
  if (Number.isSafeInteger(message.sequence) && message.sequence > state.cursor) {
    while (state.messages.some(item => item.sequence === state.cursor + 1)) state.cursor++;
    if (message.sequence > state.cursor + 1) scheduleGapRecovery();
  }
  renderMessages();
}

function scheduleGapRecovery() {
  if (state.gapTimer) return;
  const epoch = state.epoch;
  state.gapTimer = setTimeout(async () => {
    state.gapTimer = null;
    if (epoch !== state.epoch) return;
    try { await catchUp(epoch); }
    catch (error) {
      if (error.status === 401) await checkAccess(epoch);
      else updateStatus("Some messages couldn’t load. Reconnecting…");
    }
  }, 100);
}

async function catchUp(epoch) {
  if (!state.room) return;
  let cursor = state.cursor;
  for (let page = 0; page < 100; page++) {
    const { messages = [], hasMore } = await request(`/rooms/${encodeURIComponent(state.room.id)}/messages?after=${cursor}`);
    if (epoch !== state.epoch) return;
    for (const message of messages) insertSaved(message);
    const next = state.cursor;
    if (!hasMore || next <= cursor) break;
    cursor = next;
  }
}

function socketSend(value) {
  if (state.socket?.readyState !== WebSocket.OPEN) return false;
  state.socket.send(JSON.stringify(value));
  return true;
}

async function checkAccess(epoch) {
  if (epoch !== state.epoch) return;
  try {
    const { user } = await request("/me");
    if (epoch !== state.epoch) return;
    if (!user || user.id !== state.user?.id) {
      clearAccount();
      authView("login", "Your session ended. Sign in again to continue.");
      return;
    }
    const { rooms } = await request("/rooms");
    if (epoch !== state.epoch) return;
    if (!rooms.some(room => room.id === state.room?.id)) {
      clearAccount();
      recoveryView("This chat is no longer available to your account.", false);
      return;
    }
    updateStatus("Connection paused. Retry to reopen your chat.");
    showConnectionRetry(epoch);
  } catch {
    if (epoch === state.epoch) {
      updateStatus("Connection paused. Retry to reopen your chat.");
      showConnectionRetry(epoch);
    }
  }
}

function showConnectionRetry(epoch) {
  const status = root.querySelector("#agent-status");
  if (!status || status.querySelector("button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "live-status-retry";
  button.textContent = "Retry";
  button.addEventListener("click", async () => {
    button.remove();
    try { await catchUp(epoch); if (epoch === state.epoch) connect(epoch); }
    catch (error) { if (error.status === 401) await checkAccess(epoch); else if (epoch === state.epoch) showConnectionRetry(epoch); }
  });
  status.append(" ", button);
}

function scheduleReconnect(epoch) {
  if (epoch !== state.epoch) return;
  clearTimeout(state.retryTimer);
  const delay = Math.min(30000, 500 * 2 ** Math.min(state.retryCount++, 6)) * (0.8 + Math.random() * 0.4);
  state.retryTimer = setTimeout(async () => {
    if (epoch !== state.epoch) return;
    try { await catchUp(epoch); }
    catch (error) { if (error.status === 401) { await checkAccess(epoch); return; } }
    connect(epoch);
  }, delay);
}

async function connect(epoch) {
  if (epoch !== state.epoch || !state.room) return;
  stopConnection();
  const attempt = state.connectionAttempt;
  updateStatus();
  let ticket;
  try { ({ ticket } = await request("/ws-ticket", { method: "POST", body: "{}" })); }
  catch (error) {
    if (epoch !== state.epoch || attempt !== state.connectionAttempt) return;
    if (error.status === 401) { await checkAccess(epoch); return; }
    updateStatus("Couldn’t connect to your chat. Retrying…");
    scheduleReconnect(epoch);
    return;
  }
  if (epoch !== state.epoch || attempt !== state.connectionAttempt) return;
  if (typeof ticket !== "string" || !ticket) { updateStatus("Couldn’t connect to your chat. Retrying…"); scheduleReconnect(epoch); return; }
  const socketUrl = new URL("/api/v1/ws", wsOrigin);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl);
  state.socket = socket;
  socket.onopen = () => {
    if (epoch !== state.epoch || attempt !== state.connectionAttempt || socket !== state.socket) return;
    socket.send(JSON.stringify({ type: "authenticate", ticket }));
    ticket = undefined;
  };
  socket.onmessage = async event => {
    if (epoch !== state.epoch || socket !== state.socket) return;
    let frame;
    try { frame = JSON.parse(event.data); } catch { return; }
    if (frame.type === "ready") socketSend({ type: "subscribe", roomId: state.room.id, after: state.cursor });
    if (frame.type === "subscribed" && frame.roomId === state.room.id) {
      state.online = true;
      state.retryCount = 0;
      updateStatus();
      // Resending the original client ID is safe if the acknowledgement was lost.
      for (const message of state.messages.filter(item => item.role === "user" && item.delivery === "pending")) transmit(message);
    }
    if (frame.type === "message.saved" && frame.message) insertSaved(frame.message);
    if (frame.type === "message.delta" && frame.roomId === state.room.id && frame.messageId && !state.finalizedPreviews.has(frame.messageId)) {
      state.previews.set(frame.messageId, (state.previews.get(frame.messageId) || "") + (frame.text || ""));
      renderMessages();
    }
    if (frame.type === "agent.status" && frame.roomId === state.room.id) {
      if (frame.status === "unavailable") state.agentAvailable = false;
      updateStatus(frame.status === "unavailable" ? "Chat is saved. Your agent is not connected yet." : frame.message || undefined);
    }
    if (frame.type === "error") {
      if (frame.code === "unauthorized") { stopConnection(); await checkAccess(epoch); return; }
      const message = state.messages.find(item => item.clientId === frame.clientId);
      if (message) { message.delivery = "error"; message.failure = frame.message || "Couldn’t send"; renderMessages(); }
      else updateStatus(frame.message || "The connection had a problem. Please try again.");
    }
  };
  socket.onclose = async event => {
    if (epoch !== state.epoch || socket !== state.socket) return;
    state.online = false;
    state.previews.clear();
    renderMessages();
    updateStatus();
    if (event.code === 1008) { stopConnection(); await checkAccess(epoch); return; }
    scheduleReconnect(epoch);
  };
  socket.onerror = () => socket.close();
}

function transmit(message) {
  if (!state.online) return;
  const frame = { type: "message.send", roomId: state.room.id, clientId: message.clientId, text: message.text };
  // JSON escaping can expand a 4,000-character message. Keep below the gateway frame limit.
  if (new TextEncoder().encode(JSON.stringify(frame)).length > 31_000) {
    message.delivery = "error";
    message.failure = "Message is too long to send";
    renderMessages();
    return;
  }
  if (!socketSend(frame)) updateStatus();
}

function sendMessage(event) {
  event.preventDefault();
  const input = root.querySelector("#message-input");
  const text = input.value.trim();
  if (!text) return;
  const message = { clientId: crypto.randomUUID(), roomId: state.room.id, role: "user", text, delivery: "pending" };
  state.messages.push(message);
  input.value = "";
  renderMessages();
  transmit(message);
  input.focus();
}

function retryMessage(clientId) {
  const message = state.messages.find(item => item.clientId === clientId);
  if (!message) return;
  message.delivery = "pending";
  message.failure = undefined;
  renderMessages();
  transmit(message);
}

async function signOut() {
  const button = root.querySelector("#signout");
  button.disabled = true;
  try {
    await request("/auth/logout", { method: "POST", body: "{}" });
    clearAccount();
    authView("login");
  } catch (error) {
    button.disabled = false;
    updateStatus(errorText(error));
  }
}

async function boot() {
  if (apiConfigError) { recoveryView(apiConfigError.message, false); return; }
  const epoch = state.epoch;
  root.innerHTML = `<div class="live-loading" role="status">Opening Joystick…</div>`;
  try {
    const { user } = await request("/me");
    if (epoch !== state.epoch) return;
    if (user) await enterAccount(user, epoch);
    else authView();
  } catch (error) {
    if (epoch === state.epoch) recoveryView(errorText(error));
  }
}

function recoveryView(message, retry = true) {
  root.innerHTML = `<div class="live-auth-wrap"><a class="live-logo" href="/">Joystick<span class="live-logo-dot">.</span></a><main class="live-auth card"><div class="live-kicker">Your space</div><h1 class="display">Can’t open your chat.</h1><p class="live-intro" id="recovery-message"></p>${retry ? `<button class="btn red block" id="retry-boot" type="button">Try again</button>` : `<a class="btn red block" href="/chat.html">Open Joystick</a>`}</main></div>`;
  root.querySelector("#recovery-message").textContent = message;
  root.querySelector("#retry-boot")?.addEventListener("click", boot);
}

boot();
