-- The squad a player plays in by default for each mission. Joining or switching squads moves it.
ALTER TABLE game_memberships ADD COLUMN IF NOT EXISTS home_plan_id uuid REFERENCES game_plans(id) ON DELETE SET NULL;
UPDATE game_memberships gm SET home_plan_id=(SELECT pm.plan_id FROM game_plan_memberships pm JOIN game_plans p ON p.id=pm.plan_id WHERE pm.user_id=gm.user_id AND p.mission_id=gm.mission_id AND p.status<>'merged' ORDER BY pm.joined_at DESC LIMIT 1) WHERE home_plan_id IS NULL;
