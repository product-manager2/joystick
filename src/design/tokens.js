
// JS side of the design system. Colours live in tokens.css; JS refers to them as var(--name)
// and only resolves them to hex when it has to do maths on them.
export const color = name => `var(--${name})`;

export function cssColor(c) {
  const m = /^var\((--[\w-]+)\)$/.exec(c);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c;
}

// Every custom property declared on :root, in source order (the style guide lists these)
export function allTokens() {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.selectorText !== ":root") continue;
      for (const prop of r.style) if (prop.startsWith("--")) out.push([prop, r.style.getPropertyValue(prop).trim()]);
    }
  }
  return out;
}
