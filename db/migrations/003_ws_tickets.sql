CREATE TABLE IF NOT EXISTS ws_tickets (
  ticket_hash text PRIMARY KEY,
  session_token_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  origin text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ws_tickets_expires_at ON ws_tickets(expires_at);
