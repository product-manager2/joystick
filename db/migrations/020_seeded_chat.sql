-- Illustrative demo messages have no account behind them, only a display name.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_label text CHECK (sender_label IS NULL OR length(sender_label) BETWEEN 1 AND 120);
