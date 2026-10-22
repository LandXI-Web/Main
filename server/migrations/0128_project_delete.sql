-- 0128_project_delete.sql — 프로젝트 삭제(10-23 사용자 "프로젝트 삭제하는 기능도 필요하다") · 멱등
--   projects.state 에 'deleted' 를 더해 쓴다(제약 없음 — active | archived | deleted). 삭제하면 모든 목록에서 바로 빠지고
--   30일 동안 파일 · 줄을 남긴 뒤 보관 기한 정리(retention.py · 하루 한 번)가 지운다.
--   deleted_at · deleted_by = 누가 언제 · deleted_info = 되돌리기에 필요한 것(앞 상태 · 옮긴 폴더 · 학습 자료 · 모델의 앞 상태 · 멈춘 작업).
-- 되돌리기: migrations/down/0128_project_delete.down.sql
SET LOCAL lock_timeout = '10s';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_info jsonb;
CREATE INDEX IF NOT EXISTS projects_deleted ON projects (deleted_at) WHERE state = 'deleted';
