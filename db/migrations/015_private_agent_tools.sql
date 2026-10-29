CREATE TABLE private_agent_tool_receipts (
  session_id text NOT NULL,
  event_id text NOT NULL,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  dispatch_id uuid NOT NULL REFERENCES agent_dispatches(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  result jsonb,
  is_error boolean NOT NULL DEFAULT false,
  state text NOT NULL CHECK (state IN ('running','completed','failed')),
  send_state text NOT NULL DEFAULT 'pending' CHECK (send_state IN ('pending','sending','sent','uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id,event_id)
);
CREATE INDEX private_agent_tool_receipts_room_activity ON private_agent_tool_receipts(room_id,created_at DESC) WHERE tool_name='execute_command';
