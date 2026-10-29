ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_kind_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_kind_check CHECK (kind IN ('agent','dm','mission','stage','plan','quest'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scope_id uuid;

CREATE TABLE game_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agent_name text NOT NULL DEFAULT 'Pip' CHECK (length(agent_name) BETWEEN 1 AND 60),
  roles text[] NOT NULL DEFAULT '{}',
  skills jsonb NOT NULL DEFAULT '[]',
  preferences jsonb NOT NULL DEFAULT '{}',
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text UNIQUE,
  owner_id uuid REFERENCES users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  pitch text NOT NULL DEFAULT '',
  tag text NOT NULL DEFAULT 'Community',
  glyph text NOT NULL DEFAULT 'spark',
  color text NOT NULL DEFAULT 'var(--blue)',
  rules jsonb NOT NULL DEFAULT '[]',
  roles jsonb NOT NULL DEFAULT '[]',
  team text NOT NULL DEFAULT '',
  bounty_goal integer NOT NULL DEFAULT 0 CHECK (bounty_goal >= 0),
  sample jsonb NOT NULL DEFAULT '{}',
  seed_notice text,
  stage_index integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  goal text NOT NULL DEFAULT '',
  tracks jsonb NOT NULL DEFAULT '[]',
  target integer NOT NULL DEFAULT 1 CHECK (target > 0),
  gate_target integer NOT NULL DEFAULT 1 CHECK (gate_target > 0),
  unit text NOT NULL DEFAULT 'results',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','approved')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  UNIQUE(mission_id,ordinal)
);
CREATE TABLE game_memberships (
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mission_id,user_id)
);
CREATE TABLE game_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES game_stages(id) ON DELETE CASCADE,
  seed_key text,
  creator_id uuid REFERENCES users(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  squad text NOT NULL,
  bet text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','proposed','queued','merged')),
  metadata jsonb NOT NULL DEFAULT '{}',
  version bigint NOT NULL DEFAULT 1,
  UNIQUE(mission_id,seed_key)
);
CREATE TABLE game_plan_memberships (
  plan_id uuid NOT NULL REFERENCES game_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE game_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES game_stages(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES game_plans(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES game_quests(id) ON DELETE SET NULL,
  seed_key text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  role text NOT NULL DEFAULT 'user',
  size text NOT NULL DEFAULT 'S' CHECK (size IN ('S','M','L')),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  reward_credits integer NOT NULL DEFAULT 0 CHECK (reward_credits >= 0),
  brief jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','claimed','submitted','changes_requested','approved')),
  claimed_by uuid REFERENCES users(id),
  claimed_at timestamptz,
  decision jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,seed_key)
);
CREATE TABLE game_quest_dependencies (
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  depends_on_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  PRIMARY KEY(quest_id,depends_on_id),
  CHECK (quest_id <> depends_on_id)
);
CREATE TABLE game_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  submitter_id uuid NOT NULL REFERENCES users(id),
  content_type text NOT NULL DEFAULT 'text/plain',
  title text NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) <= 262144),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quest_id,version)
);
CREATE TABLE game_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES game_artifacts(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  verdict text NOT NULL CHECK (verdict IN ('approve','changes_requested')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(artifact_id,reviewer_id)
);
CREATE TABLE game_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_need_support (
  need_id uuid NOT NULL REFERENCES game_needs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(need_id,user_id)
);
CREATE TABLE game_voices (
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(mission_id,user_id)
);
CREATE TABLE game_plan_backers (
  plan_id uuid NOT NULL REFERENCES game_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE game_quest_watchers (
  quest_id uuid NOT NULL REFERENCES game_quests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY(quest_id,user_id)
);
CREATE TABLE game_merge_proposals (
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
CREATE TABLE game_spend_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('time','compute','test_credits')),
  amount integer NOT NULL CHECK (amount BETWEEN 1 AND 100000),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users(id),
  invitee_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id,inviter_id,invitee_id)
);
CREATE TABLE game_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  text text NOT NULL,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  CHECK (reserved <= balance)
);
CREATE TABLE game_funding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  amount integer NOT NULL CHECK (amount > 0),
  remaining integer NOT NULL CHECK (remaining >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE game_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid REFERENCES game_missions(id),
  quest_id uuid REFERENCES game_quests(id),
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('reserve','award','payout_simulation')),
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quest_id,user_id,kind)
);
CREATE TABLE game_commands (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);
CREATE TABLE game_revision (id boolean PRIMARY KEY DEFAULT true CHECK (id), revision bigint NOT NULL DEFAULT 1);
INSERT INTO game_revision(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE INDEX game_quests_stage_state ON game_quests(stage_id,state);
CREATE INDEX game_notifications_user ON game_notifications(user_id,created_at DESC);
CREATE INDEX game_funding_mission ON game_funding(mission_id,id);
CREATE INDEX game_rooms_scope ON rooms(kind,scope_id);
CREATE UNIQUE INDEX game_rooms_unique_scope ON rooms(kind,scope_id) WHERE scope_id IS NOT NULL;
