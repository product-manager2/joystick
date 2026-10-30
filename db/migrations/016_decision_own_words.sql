-- A person can answer an agent's question in their own words instead of picking an option.
ALTER TABLE agent_run_decisions ADD COLUMN IF NOT EXISTS answer_text text CHECK (answer_text IS NULL OR length(answer_text) BETWEEN 1 AND 1000);
