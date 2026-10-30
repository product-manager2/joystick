CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_hash text NOT NULL UNIQUE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX push_subscriptions_session ON push_subscriptions(session_hash);

CREATE TABLE push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','cancelled')),
  leased_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,subscription_id)
);
CREATE INDEX push_deliveries_ready ON push_deliveries(next_attempt_at,created_at) WHERE status IN ('pending','sending');

CREATE FUNCTION enqueue_message_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO push_deliveries(message_id,subscription_id)
  SELECT NEW.id,s.id
  FROM rooms r
  JOIN push_subscriptions s ON (
    (r.kind IN ('agent','dm') AND EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=s.user_id))
    OR (r.kind='mission' AND EXISTS (SELECT 1 FROM game_memberships gm WHERE gm.mission_id=r.scope_id AND gm.user_id=s.user_id))
    OR (r.kind='stage' AND EXISTS (SELECT 1 FROM game_stages gs JOIN game_memberships gm ON gm.mission_id=gs.mission_id WHERE gs.id=r.scope_id AND gm.user_id=s.user_id))
    OR (r.kind='plan' AND EXISTS (SELECT 1 FROM game_plans gp JOIN game_memberships gm ON gm.mission_id=gp.mission_id WHERE gp.id=r.scope_id AND gm.user_id=s.user_id))
    OR (r.kind='quest' AND EXISTS (SELECT 1 FROM game_quests gq JOIN game_memberships gm ON gm.mission_id=gq.mission_id WHERE gq.id=r.scope_id AND gm.user_id=s.user_id))
  )
  JOIN sessions sess ON sess.token_hash=s.session_hash AND sess.user_id=s.user_id
  WHERE r.id=NEW.room_id AND s.user_id IS DISTINCT FROM NEW.user_id
    AND sess.revoked_at IS NULL AND sess.expires_at>now()
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_enqueue_push AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION enqueue_message_push();
