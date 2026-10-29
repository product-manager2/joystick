ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_kind_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_kind_check CHECK (kind IN ('register','login','reauth','add_passkey','recovery'));
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS session_hash text;

CREATE TABLE auth_manage_grants (
  session_hash text PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE auth_recovery_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_recovery_codes_user ON auth_recovery_codes(user_id);
