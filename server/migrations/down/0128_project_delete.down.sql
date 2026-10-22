-- 0128 되돌리기 — 삭제 표시를 지운다(삭제한 프로젝트는 '보관'으로 돌린다 · 옮긴 폴더는 deleted_info 를 보고 손으로 되돌린다)
UPDATE projects SET state = 'archived' WHERE state = 'deleted';
DROP INDEX IF EXISTS projects_deleted;
ALTER TABLE projects DROP COLUMN IF EXISTS deleted_info;
ALTER TABLE projects DROP COLUMN IF EXISTS deleted_by;
ALTER TABLE projects DROP COLUMN IF EXISTS deleted_at;
