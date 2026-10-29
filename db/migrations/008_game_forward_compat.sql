-- Older local databases applied 004 before the first-cut fields were finalized.
ALTER TABLE game_missions ADD COLUMN IF NOT EXISTS roles jsonb NOT NULL DEFAULT '[]';
ALTER TABLE game_missions ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT '';
ALTER TABLE game_missions ADD COLUMN IF NOT EXISTS bounty_goal integer NOT NULL DEFAULT 0;
ALTER TABLE game_missions ADD COLUMN IF NOT EXISTS sample jsonb NOT NULL DEFAULT '{}';
ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS gate_target integer NOT NULL DEFAULT 1;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS recovery_generation bigint;
CREATE TABLE IF NOT EXISTS auth_recovery_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS game_voices (
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(mission_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_plan_backers (
  plan_id uuid NOT NULL REFERENCES game_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_quest_watchers (
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(quest_id,user_id)
);
CREATE TABLE IF NOT EXISTS game_merge_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  source_plan_id uuid NOT NULL REFERENCES game_plans(id),
  target_plan_id uuid NOT NULL REFERENCES game_plans(id),
  proposer_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_plan_id <> target_plan_id)
);
CREATE TABLE IF NOT EXISTS game_spend_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE game_ledger DROP CONSTRAINT IF EXISTS game_ledger_kind_check;
ALTER TABLE game_ledger ADD CONSTRAINT game_ledger_kind_check CHECK (kind IN ('reserve','award','earning','payout_simulation'));
ALTER TABLE game_ledger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE game_funding ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES game_plans(id);
CREATE UNIQUE INDEX IF NOT EXISTS game_rooms_unique_scope ON rooms(kind,scope_id) WHERE scope_id IS NOT NULL;
