-- 0127_change_service 되돌리기
ALTER TABLE change_runs DROP COLUMN IF EXISTS src_key;
ALTER TABLE change_runs DROP COLUMN IF EXISTS sources;
ALTER TABLE change_ranges DROP COLUMN IF EXISTS origin;
