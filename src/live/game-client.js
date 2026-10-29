import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { resolveApiOrigin } from "./api-origin.js";
import { landingView } from "./onboarding.js";

const origin = resolveApiOrigin(import.meta.env.VITE_API_ORIGIN, location.origin, import.meta.env.PROD);
export const apiOrigin = origin;
export const live = { user: null, snapshot: null, revision: null, ready: false };

export async function api(path, options = {}) {
  const requestUser = live.user;
  const response = await fetch(new URL(`/api/v1${path}`, origin), {
    credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (requestUser && live.user !== requestUser) {
    const error = new Error("Account changed while this request was in progress.");
    error.code = "account_changed";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(body.error?.message || body.message || "Please try again.");
    error.status = response.status;
    error.code = body.error?.code;
    throw error;
  }
  return body;
}

export async function loadGame() {
  const data = await api("/game");
  live.snapshot = data;
  live.revision = data.revision;
  live.ready = true;
  return data;
}

export async function gameAction(action, entityId, payload = {}, requestId = crypto.randomUUID()) {
  const data = await api("/game/actions", {
    method: "POST",
    body: JSON.stringify({ requestId, action, ...(entityId ? { entityId } : {}), payload }),
  });
  if (data.snapshot) {
    live.snapshot = data.snapshot;
    live.revision = data.revision;
  } else await loadGame();
  return data;
}

const escape = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function authMarkup(mode, error = "") {
  return `<div class="live-auth-wrap"><button type="button" class="live-logo live-home-link" data-mode="landing">Joystick<span class="live-logo-dot">.</span></button><main class="live-auth card" aria-labelledby="auth-title"><div class="live-kicker">Your space</div><h1 id="auth-title" class="display">${mode === "signup" ? "Start with a passkey." : mode === "recovery" ? "Recover your account." : "Welcome back."}</h1><p class="live-intro">Your missions, plans, tasks, and chats are saved to your account.</p><div class="live-switch" role="group" aria-label="Account action"><button type="button" data-mode="signup" aria-pressed="${mode === "signup"}">Create account</button><button type="button" data-mode="login" aria-pressed="${mode === "login"}">Sign in</button></div><form id="auth-form" data-mode="${mode}">${mode === "signup" ? '<label for="account-name">Your name</label><input id="account-name" class="inp" name="name" autocomplete="name" required maxlength="80">' : ""}<label for="account-email">Email</label><input id="account-email" class="inp" name="email" type="email" autocomplete="email webauthn" required>${mode === "recovery" ? '<label for="account-code">Recovery code</label><input id="account-code" class="inp" name="code" autocomplete="off" required>' : ""}<button class="btn red block" type="submit">${mode === "signup" ? "Create account with passkey" : mode === "recovery" ? "Create new passkey" : "Sign in with passkey"}</button></form><p class="live-form-error" id="auth-error" role="alert">${escape(error)}</p><p class="live-fine">${mode === "recovery" ? "A valid single-use recovery code replaces your old passkeys and signs out other sessions." : "Your device will ask you to create or use a passkey."}</p>${mode !== "recovery" ? '<button type="button" class="linkbtn" data-mode="recovery">Use a recovery code</button>' : ""}</main></div>`;
}

export function showLanding(onReady) {
  const root = document.querySelector("#main");
  document.querySelector("#hud").hidden = true;
  document.querySelector("#nav").hidden = true;
  root.innerHTML = `<div class="live-landing">${landingView()}</div>`;
  root.querySelectorAll("[data-entry]").forEach(button => button.addEventListener("click", () => showAuth(onReady, button.dataset.entry)));
}

export function showAuth(onReady, mode = "signup", message = "") {
  const root = document.querySelector("#main");
  document.querySelector("#hud").hidden = true;
  document.querySelector("#nav").hidden = true;
  root.innerHTML = authMarkup(mode, message);
  root.querySelectorAll("button[data-mode]").forEach(button => button.addEventListener("click", () => button.dataset.mode === "landing" ? showLanding(onReady) : showAuth(onReady, button.dataset.mode)));
  root.querySelector("#auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const kind = form.dataset.mode;
    const button = form.querySelector("button[type=submit]");
    const error = root.querySelector("#auth-error");
    button.disabled = true;
    button.textContent = "Waiting for your passkey…";
    error.textContent = "";
    try {
      if (!window.PublicKeyCredential || !window.isSecureContext) throw new Error("Passkeys need a secure browser connection.");
      const base = kind === "signup" ? "/auth/register" : kind === "recovery" ? "/auth/recovery" : "/auth/login";
      const email = form.elements.email.value.trim();
      const name = kind === "signup" ? form.elements.name.value.trim() : undefined;
      const { options } = await api(`${base}/options`, { method: "POST", body: JSON.stringify(kind === "signup" ? { email, name } : kind === "recovery" ? {email,code:form.elements.code.value.trim()} : { email }) });
      const response = kind === "signup" || kind === "recovery" ? await startRegistration({ optionsJSON: options }) : await startAuthentication({ optionsJSON: options });
      const result = await api(`${base}/verify`, { method: "POST", body: JSON.stringify({ response }) });
      live.user = result.user;
      await onReady();
    } catch (caught) {
      error.textContent = caught.name === "NotAllowedError" ? "Passkey was cancelled. Try again when you’re ready." : caught.message;
    } finally {
      if (button.isConnected) { button.disabled = false; button.textContent = kind === "signup" ? "Create account with passkey" : kind === "recovery" ? "Create new passkey" : "Sign in with passkey"; }
    }
  });
}

export async function bootAccount(onReady) {
  // Keep the original public mission carousel before live snapshots replace the catalog.
  landingView();
  try {
    const { user } = await api("/me");
    if (!user) return showLanding(onReady);
    live.user = user;
    await onReady();
  } catch (error) {
    showAuth(onReady, "login", error.message);
  }
}

export async function signOut(onReady, onReset) {
  await api("/auth/logout", { method: "POST", body: "{}" });
  live.user = null;
  live.snapshot = null;
  live.ready = false;
  onReset?.();
  showLanding(onReady);
}
