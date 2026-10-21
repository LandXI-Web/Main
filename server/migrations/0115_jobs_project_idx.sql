-- 0115_jobs_project_idx.sql — 프로젝트 목록(/projects)이 작업 표를 통째로 훑지 않게(10-21 첫인상 남은 일 · 원칙 251) · 멱등
--   분석 작업 3.5만 줄 중 프로젝트 것만 바로 찾는 부분 색인(시스템 읽기 경로 pool_sys 로 읽는다 — 행 보안 아래서는 이 식이 색인을 못 탄다).
--   학습 작업은 40줄뿐이라 종류별 색인. 표 모양은 바꾸지 않는다(잠금 없음).
-- 되돌리기: migrations/down/0115_jobs_project_idx.down.sql
CREATE INDEX IF NOT EXISTS jobs_infer_project ON jobs ((options->>'project_id'), created_at DESC) WHERE kind = 'infer';
CREATE INDEX IF NOT EXISTS jobs_train_at ON jobs (created_at DESC) WHERE kind = 'train';
