CREATE TABLE room_reads (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  PRIMARY KEY(room_id,user_id)
);
