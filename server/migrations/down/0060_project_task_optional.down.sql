-- 0060_project_task_optional 되돌리기 — 비운 업무는 프로젝트 이름으로 채운 뒤 다시 필수로
UPDATE projects SET task = left(name, 40) WHERE task IS NULL;
ALTER TABLE projects ALTER COLUMN task SET NOT NULL;
