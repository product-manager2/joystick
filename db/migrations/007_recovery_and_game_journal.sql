ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS recovery_generation bigint;
CREATE TABLE IF NOT EXISTS auth_recovery_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 0
);
ALTER TABLE game_ledger DROP CONSTRAINT IF EXISTS game_ledger_kind_check;
ALTER TABLE game_ledger ADD CONSTRAINT game_ledger_kind_check CHECK (kind IN ('reserve','award','earning','payout_simulation'));
ALTER TABLE game_ledger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
