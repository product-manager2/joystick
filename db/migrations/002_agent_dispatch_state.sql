ALTER TABLE agent_dispatches DROP CONSTRAINT IF EXISTS agent_dispatches_status_check;
ALTER TABLE agent_dispatches ADD CONSTRAINT agent_dispatches_status_check CHECK (status IN ('pending','sending','sent','completed','uncertain','unavailable'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_text_check;
ALTER TABLE messages ADD CONSTRAINT messages_text_check CHECK (length(text) BETWEEN 1 AND 65536);
