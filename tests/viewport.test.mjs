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
  let naturalTop = 0;
  const app = { style: {
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name) || ""; },
  }, getBoundingClientRect() { return { top: naturalTop + Number.parseFloat(values.get("--app-viewport-shift") || 0) }; } };
  const viewport = events({ height: 844, scale: 1, offsetTop: 0, pageTop: 0 });
  const win = events({ innerWidth: 390, innerHeight: 844, scrollY: 0, visualViewport: viewport });
  const doc = events({ activeElement: null, querySelector: () => app });
  return { app, viewport, win, doc, height: () => app.style.getPropertyValue("--app-visible-height"), shift: () => app.style.getPropertyValue("--app-viewport-shift"), setNaturalTop: value => { naturalTop = value; } };
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
  assert.equal(f.shift(), "", "pinch zoom also clears the pan correction");

  f.viewport.scale = 1;
  f.viewport.height = 520;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "520px");
  f.doc.activeElement = null;
  f.doc.dispatch("focusout");
  await Promise.resolve();
  assert.equal(f.height(), "", "blur restores CSS viewport sizing");
  assert.equal(f.shift(), "", "blur removes the shell's pan correction");

  uninstall();
  f.doc.activeElement = { tagName: "TEXTAREA" };
  f.doc.dispatch("focusin");
  assert.equal(f.height(), "", "cleanup removes the listeners");
});

test("keyboard pan anchors the shell without compounding repeated viewport events", async () => {
  const f = fixture();
  const uninstall = installViewportSizing(f.win, f.doc);
  f.doc.activeElement = { tagName: "TEXTAREA" };
  f.doc.dispatch("focusin");
  f.viewport.height = 510;
  f.setNaturalTop(-124);
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "510px");
  assert.equal(f.shift(), "124px");
  f.viewport.dispatch("scroll");
  f.win.dispatch("scroll");
  assert.equal(f.shift(), "124px", "prior translation is excluded from the next measurement");

  f.viewport.offsetTop = 18;
  f.viewport.pageTop = 34;
  f.viewport.dispatch("scroll");
  assert.equal(f.shift(), "158px", "pageTop catches viewport pan when offsetTop lags");

  f.viewport.scale = 1.25;
  f.viewport.dispatch("resize");
  assert.equal(f.height(), "", "pinch zoom restores native viewport sizing after a pan");
  assert.equal(f.shift(), "", "pinch zoom releases the shell anchor");
  f.viewport.scale = 1;
  f.viewport.dispatch("resize");
  assert.equal(f.shift(), "158px");

  f.doc.activeElement = { tagName: "INPUT", type: "text" };
  f.doc.dispatch("focusout");
  f.doc.dispatch("focusin");
  await Promise.resolve();
  assert.equal(f.shift(), "158px", "moving between editable fields keeps the anchor");

  f.doc.activeElement = null;
  f.doc.dispatch("focusout");
  await Promise.resolve();
  assert.equal(f.height(), "");
  assert.equal(f.shift(), "");
  uninstall();
});

test("stale viewport offsets cannot move a full-height shell or exceed keyboard space", () => {
  const f = fixture();
  installViewportSizing(f.win, f.doc);
  f.doc.activeElement = { tagName: "INPUT", type: "text" };
  f.viewport.offsetTop = 300;
  f.viewport.pageTop = 300;
  f.doc.dispatch("focusin");
  assert.equal(f.shift(), "0px", "a full-height viewport has no available pan space");

  f.viewport.height = 510;
  f.viewport.offsetTop = 900;
  f.viewport.pageTop = 900;
  f.viewport.dispatch("resize");
  assert.equal(f.shift(), "334px", "reported pan is limited to the keyboard's available space");

  f.viewport.height = 844;
  f.setNaturalTop(-80);
  f.viewport.dispatch("resize");
  assert.equal(f.shift(), "80px", "a panned app rectangle still gets corrected when offsets are stale");
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
