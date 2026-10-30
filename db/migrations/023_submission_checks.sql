-- One durable first-pass check per submitted artifact. Rewards remain provisional
-- until the existing two independent member approvals close the quest.
CREATE TABLE game_submission_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL UNIQUE REFERENCES game_artifacts(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  submitter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirements jsonb NOT NULL,
  provisional_tokens integer NOT NULL CHECK (provisional_tokens >= 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','passed','needs_attention','unavailable','superseded')),
  source text CHECK (source IN ('jev','llm')),
  feedback text NOT NULL DEFAULT '',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 2),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_submission_checks_work ON game_submission_checks(status,lease_expires_at,created_at);
CREATE INDEX game_submission_checks_quest ON game_submission_checks(quest_id,created_at DESC);
