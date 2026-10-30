// A plan can aim past the next checkpoint. Its target stage then opens for that plan's
// tasks while it is still pending for everyone else.
export const stageOpenFor=(stage:string,plan:string)=>`EXISTS (SELECT 1 FROM game_stages st WHERE st.id=${stage} AND (st.status='active' OR (st.status='pending' AND EXISTS (SELECT 1 FROM game_plans pl WHERE pl.id=${plan} AND pl.stage_id=st.id AND pl.status='active'))))`;
