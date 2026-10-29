UPDATE game_quests SET xp=CASE size WHEN 'S' THEN 120 WHEN 'M' THEN 280 WHEN 'L' THEN 800 ELSE 120 END
WHERE seed_key IS NOT NULL AND xp=0;
UPDATE game_quests SET reward_credits=0 WHERE seed_key IS NOT NULL AND state<>'approved' AND reward_credits>0;
