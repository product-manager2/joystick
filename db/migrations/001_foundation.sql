CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS passkeys (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text NOT NULL,
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
CREATE TABLE IF NOT EXISTS auth_challenges (
  id_hash text PRIMARY KEY,
  challenge text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('register','login')),
  email text NOT NULL,
  name text,
  passkey_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'agent' CHECK (kind = 'agent'),
  next_sequence bigint NOT NULL DEFAULT 1,
  provider_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(room_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 65536),
  user_id uuid REFERENCES users(id),
  client_id text,
  request_hash text,
  provider_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id,sequence),
  UNIQUE(room_id,user_id,client_id),
  UNIQUE(room_id,provider_event_id)
);
CREATE INDEX IF NOT EXISTS messages_room_sequence ON messages(room_id,sequence);
CREATE TABLE IF NOT EXISTS agent_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  message_id uuid NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','sending','sent','completed','uncertain','unavailable')),
  provider_session_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_dispatches_pending ON agent_dispatches(created_at) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS provider_event_receipts (
  session_id text NOT NULL,
  event_id text NOT NULL,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,event_id)
);
