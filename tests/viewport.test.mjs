import test from "node:test";
import assert from "node:assert/strict";
import { installViewportSizing } from "../src/ui/viewport.js";

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of listeners.get(type) || []) fn(); },
  });
}

function fixture() {
  const values = new Map();
  const app = { style: {
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name) || ""; },
  } };
  const viewport = events({ height: 844, scale: 1 });
  const win = events({ innerWidth: 390, innerHeight: 844, visualViewport: viewport });
  const doc = events({ activeElement: null, querySelector: () => app });
  return { app, viewport, win, doc, height: () => app.style.getPropertyValue("--app-visible-height") };
}

test("keyboard height affects only a focused editable field at normal scale", async () => {
  const f = fixture();
  const uninstall = installViewportSizing(f.win, f.doc);
  assert.equal(f.height(), "");

  f.doc.activeElement = { tagName: "INPUT", type: "text" };
  f.doc.dispatch("focusin");
  f.viewport.height = 520;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "520px");

  f.viewport.height = 900;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "844px", "visual viewport cannot grow the shell beyond layout viewport");

  f.viewport.scale = 1.5;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "", "pinch zoom uses the browser viewport");

  f.viewport.scale = 1;
  f.viewport.height = 520;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "520px");
  f.doc.activeElement = null;
  f.doc.dispatch("focusout");
  await Promise.resolve();
  assert.equal(f.height(), "", "blur restores CSS viewport sizing");

  uninstall();
  f.doc.activeElement = { tagName: "TEXTAREA" };
  f.doc.dispatch("focusin");
  assert.equal(f.height(), "", "cleanup removes the listeners");
});

test("non-text controls and desktop focus do not resize the app", () => {
  const f = fixture();
  installViewportSizing(f.win, f.doc);
  f.viewport.height = 510;
  f.doc.activeElement = { tagName: "INPUT", type: "checkbox" };
  f.doc.dispatch("focusin");
  assert.equal(f.height(), "");
  f.win.innerWidth = 1024;
  f.doc.activeElement = { tagName: "TEXTAREA" };
  f.doc.dispatch("focusin");
  assert.equal(f.height(), "");
});
