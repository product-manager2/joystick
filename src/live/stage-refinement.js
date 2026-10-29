export const stage = s => ({name:String(s?.name || s || "").slice(0,120), goal:String(s?.goal || s?.name || s || "").slice(0,500), target:Math.max(1,Number(s?.target)||1), gateTarget:Math.max(1,Number(s?.gateTarget)||1), unit:String(s?.unit || "approved tasks").slice(0,40)});

export function refinedStages(previous, proposed) {
  const matched = new Map(), used = new Set();
  // Match stable text first so a reordered draft keeps each stage's threshold.
  for (const field of ["name", "goal"]) for (let i=0;i<proposed.length;i++) {
    if (matched.has(i) || proposed[i]?.gateTarget !== undefined) continue;
    const value=String(proposed[i]?.[field] || "").trim().toLowerCase();
    if (!value || proposed.filter(s=>String(s?.[field] || "").trim().toLowerCase()===value).length!==1) continue;
    const candidates=previous.map((s,j)=>({s,j})).filter(({s,j})=>!used.has(j)&&String(s?.[field] || "").trim().toLowerCase()===value);
    if (candidates.length===1) { matched.set(i,candidates[0].j); used.add(candidates[0].j); }
  }
  // Position is useful for one stage or a simple rename with unchanged order.
  const orderStable=[...matched].every(([newIndex,oldIndex])=>newIndex===oldIndex);
  if (proposed.length===previous.length && orderStable && (proposed.length===1 || matched.size)) for (let i=0;i<proposed.length;i++) {
    if (!matched.has(i) && !used.has(i)) {matched.set(i,i);used.add(i);}
  }
  return proposed.map((s,i)=>stage({...s,gateTarget:s?.gateTarget ?? previous[matched.get(i)]?.gateTarget}));
}
