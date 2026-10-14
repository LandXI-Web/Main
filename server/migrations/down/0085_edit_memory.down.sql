-- 0085 되돌리기
DROP TABLE IF EXISTS edit_rechecks;
DROP TABLE IF EXISTS edit_memory_runs;
DROP INDEX IF EXISTS result_edits_memory;
DROP INDEX IF EXISTS result_edits_place;
DROP INDEX IF EXISTS result_edits_from;
ALTER TABLE result_edits DROP COLUMN IF EXISTS year;
ALTER TABLE result_edits DROP COLUMN IF EXISTS from_edit;
ALTER TABLE result_edits DROP COLUMN IF EXISTS project_id;
ALTER TABLE train_tiles DROP COLUMN IF EXISTS project_id;
