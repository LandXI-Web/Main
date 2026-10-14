-- 0095_improve_release 되돌리기
ALTER TABLE improve_rules DROP CONSTRAINT IF EXISTS improve_rules_mode_check;
DELETE FROM improve_rules WHERE mode = 'example';
ALTER TABLE improve_rules ADD CONSTRAINT improve_rules_mode_check CHECK (mode IN ('alias', 'intent', 'phrase'));
ALTER TABLE improve_rules DROP COLUMN IF EXISTS release_id;
ALTER TABLE improve_items DROP COLUMN IF EXISTS release_id;
DROP TABLE IF EXISTS improve_releases;
