const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isEditable(element) {
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") return !NON_TEXT_INPUTS.has(element.type?.toLowerCase());
  return element.isContentEditable === true;
}

// The software keyboard reduces visualViewport.height without reliably changing 100dvh on iOS.
// Only adapt while typing at normal scale; pinch zoom remains the browser's own viewport.
export function installViewportSizing(win = window, doc = document) {
  const app = doc.querySelector(".app");
  const viewport = win.visualViewport;
  if (!app || !viewport) return () => {};

  let installed = true;
  const update = () => {
    if (!installed) return;
    if (win.innerWidth > 959 || !isEditable(doc.activeElement) || Math.abs(viewport.scale - 1) > 0.01) {
      app.style.removeProperty("--app-visible-height");
      return;
    }
    const height = Math.min(win.innerHeight, viewport.height);
    if (Number.isFinite(height) && height > 0) app.style.setProperty("--app-visible-height", `${height}px`);
  };
  const afterBlur = () => queueMicrotask(update);

  doc.addEventListener("focusin", update);
  doc.addEventListener("focusout", afterBlur);
  viewport.addEventListener("resize", update);
  win.addEventListener("resize", update);
  update();

  return () => {
    installed = false;
    doc.removeEventListener("focusin", update);
    doc.removeEventListener("focusout", afterBlur);
    viewport.removeEventListener("resize", update);
    win.removeEventListener("resize", update);
    app.style.removeProperty("--app-visible-height");
  };
}
