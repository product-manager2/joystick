-- Mission tokens are pilot participation points. They carry no ownership, payout,
-- governance, or other financial rights. The journal is the source of truth.
ALTER TABLE game_missions ADD COLUMN token_symbol text GENERATED ALWAYS AS (
  CASE seed_key
    WHEN 'glio' THEN 'GLIO'
    WHEN 'cad' THEN 'OCAD'
    WHEN 'reef' THEN 'REEF'
    WHEN 'tutor' THEN 'TUTR'
    ELSE CASE WHEN seed_key IS NOT NULL THEN upper(left(regexp_replace(seed_key,'[^a-zA-Z0-9]','','g'),5))
      ELSE 'J' || upper(left(replace(id::text,'-',''),8)) END
  END
) STORED;

CREATE TABLE game_token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  source_type text NOT NULL CHECK (source_type IN ('quest','funding')),
  source_id uuid NOT NULL,
  multiplier numeric(4,1) NOT NULL CHECK (multiplier IN (1,1.2,1.5,2,3)),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type,source_id)
);
CREATE INDEX game_token_ledger_user_mission ON game_token_ledger(user_id,mission_id);
CREATE INDEX game_token_ledger_user_recent ON game_token_ledger(user_id,created_at DESC,id DESC);

-- Restored approved work uses its own stage ordinal. We cannot recover the
-- approval timestamp from old rows, so the last approving review is the closest
-- recorded time (falling back to quest creation for older imported work).
INSERT INTO game_token_ledger(mission_id,user_id,amount,source_type,source_id,multiplier,metadata,created_at)
SELECT q.mission_id,q.claimed_by,
  round((50*(CASE q.size WHEN 'L' THEN 8 WHEN 'M' THEN 4 ELSE 1 END)
    +200*(CASE WHEN lower(q.role) IN ('expert','checker','planner') THEN 1 ELSE 0 END)
    +400*(CASE WHEN q.title ~* '(part [0-9]|dock|train|screen)' THEN 1 ELSE 0 END))
    *(CASE s.ordinal WHEN 0 THEN 3 WHEN 1 THEN 2 WHEN 2 THEN 1.5 WHEN 3 THEN 1.2 ELSE 1 END)/10)::integer,
  'quest',q.id,(CASE s.ordinal WHEN 0 THEN 3 WHEN 1 THEN 2 WHEN 2 THEN 1.5 WHEN 3 THEN 1.2 ELSE 1 END),
  '{"restored":true}'::jsonb,COALESCE((SELECT MAX(r.created_at) FROM game_reviews r WHERE r.quest_id=q.id AND r.verdict='approve'),q.created_at)
FROM game_quests q JOIN game_stages s ON s.id=q.stage_id
WHERE q.state='approved' AND q.claimed_by IS NOT NULL
ON CONFLICT (source_type,source_id) DO NOTHING;

-- Historical paid reservations are real recorded backing, but their event-time
-- stage is unavailable. Restore them at 1x, without inventing an early bonus.
INSERT INTO game_token_ledger(mission_id,user_id,amount,source_type,source_id,multiplier,metadata,created_at)
SELECT f.mission_id,f.user_id,round(f.amount::numeric/10)::integer,'funding',f.id,1,
  '{"restored":true,"historicalMultiplierUnavailable":true}'::jsonb,f.created_at
FROM game_funding f WHERE f.amount >= 5
ON CONFLICT (source_type,source_id) DO NOTHING;
