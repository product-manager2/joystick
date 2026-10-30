-- An agent in a shared room can offer one action to the person who asked; it runs only when they tap it.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS action jsonb;
