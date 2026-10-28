import { esc } from "../ui/helpers.js";

// Markup for shared components. Screens call these instead of hand-writing the HTML,
// so a component looks and behaves the same everywhere. Styles live in components.css.

const attrs = o => Object.entries(o).filter(([, v]) => v != null && v !== false).map(([k, v]) => v === true ? ` ${k}` : ` ${k}="${v}"`).join("");
const data = ({ action, value, ...rest } = {}) => ({ "data-a": action, "data-x": value, ...rest });

// Button: variant "red" (primary), "blue" (play), "gold" (reward) or plain. size "sm" for compact.
export const Button = (label, { variant = "", size = "", block = false, disabled = false, type, ...on } = {}) =>
  `<button class="btn ${variant} ${size} ${block ? "block" : ""}"${attrs({ type, disabled, ...data(on) })}>${label}</button>`;

// Chip: a static label, or a toggle when it has an action
export const Chip = (label, { pressed, tone, ...on } = {}) => on.action
  ? `<button class="chip ${tone || ""}"${attrs({ ...data(on), "aria-pressed": pressed == null ? null : String(pressed) })}>${label}</button>`
  : `<span class="chip ${tone || ""}">${label}</span>`;

// Segmented tabs: items are [key, label]
export const Tabs = (items, current, action) =>
  `<div class="tabs" role="tablist" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([k, l]) =>
    `<button role="tab" data-a="${action}" data-x="${k}" aria-selected="${current === k}">${l}</button>`).join("")}</div>`;

// Stat tiles: items are [value, label]
export const Stats = items => `<div class="stats" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([v, l]) =>
  `<div class="stat"><b>${v}</b><span>${esc(l)}</span></div>`).join("")}</div>`;

export const Meter = (pct, fill = "var(--gold)") => `<div class="meter"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${fill}"></i></div>`;

export const Eyebrow = text => `<div class="eyebrow">${text}</div>`;

export const CloseButton = (attr = "data-close") => `<button class="sheet-x" ${attr} aria-label="Close">✕</button>`;

// Bottom sheet. render() returns the sheet's inner HTML; onClick gets (event, close).
// Tapping the scrim or any [data-close] closes it.
export function openSheet({ label, render, onClick, onClose, className = "" }) {
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const close = () => { scrim.remove(); onClose?.(); };
  const draw = () => { scrim.innerHTML = `<div class="sheet ${className}" role="dialog" aria-label="${esc(label)}">${render()}</div>`; };
  draw();
  scrim.addEventListener("click", e => {
    if (e.target === scrim || e.target.closest("[data-close]")) return close();
    onClick?.(e, close, draw);
  });
  document.getElementById("app").appendChild(scrim);
  return { close, draw };
}
