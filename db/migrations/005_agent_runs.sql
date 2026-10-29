CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mission-draft','plan-draft','quest-draft','quest-execute','context-chat')),
  mission_id uuid REFERENCES game_missions(id),
  plan_id uuid REFERENCES game_plans(id),
  quest_id uuid REFERENCES game_quests(id),
  room_id uuid REFERENCES rooms(id),
  prompt text NOT NULL DEFAULT '' CHECK (length(prompt)<=8000),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','starting','running','needs_input','completed','failed','uncertain','cancelled')),
  provider_session_id text UNIQUE,
  cancel_state text CHECK (cancel_state IN ('pending','sending','sent','uncertain')),
  response text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,request_id)
);
CREATE INDEX agent_runs_active ON agent_runs(created_at) WHERE status IN ('queued','starting','running','needs_input');
CREATE TABLE agent_run_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_use_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mission','plan','quest')),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,tool_use_id)
);
CREATE TABLE agent_run_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_use_id text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  content text NOT NULL CHECK (octet_length(content)<=262144),
  content_type text NOT NULL DEFAULT 'text/plain',
  version integer NOT NULL CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,tool_use_id), UNIQUE(run_id,version)
);
CREATE TABLE agent_run_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_use_id text NOT NULL,
  prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 1000),
  options jsonb NOT NULL,
  selected_option_id text,
  selected_at timestamptz,
  result_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,tool_use_id)
);
CREATE TABLE agent_run_tool_receipts (
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_use_id text NOT NULL,
  name text NOT NULL,
  result jsonb NOT NULL,
  is_error boolean NOT NULL DEFAULT false,
  send_state text NOT NULL DEFAULT 'pending' CHECK (send_state IN ('pending','sending','sent','uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,tool_use_id)
);
