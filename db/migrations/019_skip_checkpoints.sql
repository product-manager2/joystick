-- A plan can aim past the next checkpoint. When it gets there first, the checkpoints it jumped over are skipped.
ALTER TABLE game_stages DROP CONSTRAINT IF EXISTS game_stages_status_check;
ALTER TABLE game_stages ADD CONSTRAINT game_stages_status_check CHECK (status IN ('pending','active','approved','skipped'));
