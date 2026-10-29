ALTER TABLE agent_dispatches ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX agent_dispatches_ready ON agent_dispatches(next_attempt_at,created_at) WHERE status='pending';
