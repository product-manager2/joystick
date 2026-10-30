-- Accounts are a username and a passkey. Email is optional and kept only for older accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
UPDATE users SET username = left(coalesce(nullif(regexp_replace(lower(split_part(email,'@',1)),'[^a-z0-9_]','','g'),''),'player'),14) || '_' || substr(md5(id::text),1,5)
  WHERE username IS NULL;
ALTER TABLE users ALTER COLUMN username SET DEFAULT ('player_' || substr(md5(random()::text),1,8));
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_check;
ALTER TABLE users ADD CONSTRAINT users_username_check CHECK (username ~ '^[a-z0-9_]{3,20}$');
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users(username);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Challenges point at the account by id; a passkey-picker sign-in has none until the passkey answers.
ALTER TABLE auth_challenges ALTER COLUMN email DROP NOT NULL;
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Community missions move off the dark play-blue so black titles stay readable.
UPDATE game_missions SET color='var(--tangerine)' WHERE color='var(--blue)';
ALTER TABLE game_missions ALTER COLUMN color SET DEFAULT 'var(--tangerine)';
