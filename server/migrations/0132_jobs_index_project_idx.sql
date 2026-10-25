-- 0132_jobs_index_project_idx.sql — 프로젝트 목록(/projects)의 '국토 변화 색인 작업' 찾기가 작업 표 6.7만 줄을 프로젝트마다 훑지 않게(10-26 메인 대시보드 지연 · 원칙 251) · 멱등
--   0115 의 분석 작업 색인은 kind='infer' 만 탔다. 국토 변화(kind='index' · options ? 'change') 줄이 식에 들어온 뒤 프로젝트 하나당 0.19초(11개 = 2.1초)씩 쓸었다.
--   색인 작업 291줄 중 국토 변화 것만 담는 부분 색인. 표 모양 · 값은 바꾸지 않는다(색인 추가만).
-- 되돌리기: migrations/down/0132_jobs_index_project_idx.down.sql
CREATE INDEX IF NOT EXISTS jobs_index_project ON jobs ((options->>'project_id'), created_at DESC) WHERE kind = 'index' AND options ? 'change';
