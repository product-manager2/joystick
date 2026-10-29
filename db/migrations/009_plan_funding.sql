ALTER TABLE game_funding ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES game_plans(id);
