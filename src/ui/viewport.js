const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isEditable(element) {
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") return !NON_TEXT_INPUTS.has(element.type?.toLowerCase());
  return element.isContentEditable === true;
}

// iOS can shrink and pan the visual viewport independently of 100dvh and window.scrollY.
// Anchor the app to the visible area only while typing; leave pinch zoom to the browser.
export function installViewportSizing(win = window, doc = document) {
  const app = doc.querySelector(".app");
  const viewport = win.visualViewport;
  if (!app || !viewport) return () => {};

  let installed = true;
  let shift = 0;
  const reset = () => {
    shift = 0;
    app.style.removeProperty("--app-visible-height");
    app.style.removeProperty("--app-viewport-shift");
  };
  const update = () => {
    if (!installed) return;
    if (win.innerWidth > 959 || !isEditable(doc.activeElement) || Math.abs(viewport.scale - 1) > 0.01) {
      reset();
      return;
    }
    const height = Math.min(win.innerHeight, viewport.height);
    if (!Number.isFinite(height) || height <= 0) return;
    const reportedTop = Math.max(0,
      Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0,
      Number.isFinite(viewport.pageTop - win.scrollY) ? viewport.pageTop - win.scrollY : 0);
    const visibleTop = Math.min(reportedTop, Math.max(0, win.innerHeight - height));
    // Subtract the last translation so repeated viewport events never compound it.
    const naturalTop = app.getBoundingClientRect().top - shift;
    shift = Math.max(0, visibleTop - naturalTop);
    app.style.setProperty("--app-visible-height", `${height}px`);
    app.style.setProperty("--app-viewport-shift", `${shift}px`);
  };
  const afterBlur = () => queueMicrotask(update);

  doc.addEventListener("focusin", update);
  doc.addEventListener("focusout", afterBlur);
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  win.addEventListener("resize", update);
  win.addEventListener("scroll", update);
  update();

  return () => {
    installed = false;
    doc.removeEventListener("focusin", update);
    doc.removeEventListener("focusout", afterBlur);
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    win.removeEventListener("resize", update);
    win.removeEventListener("scroll", update);
    reset();
  };
}
