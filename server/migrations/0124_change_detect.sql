-- 0124_change_detect.sql — 국토 변화 분석서비스(변화 탐지 · 10-22 사용자 지시 CHANGE-DEMO-ORDER P0) · 멱등
--   독립 표 넷 — 기존 분석 서비스 · 프로젝트 표는 바꾸지 않는다.
--   change_ranges : 대상지(구역선 + 버퍼 · PNU 목록 · 행정구역) — EPSG:5179 면(분석 마스크) + 구역선 원래 모양(안/밖 판정)
--   change_runs   : 변화 탐지 한 번(작업 jobs.id) — 범위 · 연도 A·B · 같은 격자 줌 · 결과 요약(건수 · 유형 · 안/밖)
--   change_marks  : 변화 폴리곤 판정(미확인 · 불법 · 적법 · 현장확인 · 철거완료) + 판정자 · 일시 · 메모 · 사진 — 줄마다 이력(change_mark_log)
--   change_shares : 변화 탐지 결과를 기관에 공유(배포 승인 뒤) — 기관은 공유된 범위의 결과 · 판정만 본다
-- 되돌리기: migrations/down/0124_change_detect.down.sql
SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS change_ranges (
  id          text PRIMARY KEY,                  -- rng_…
  tenant_id   text NOT NULL DEFAULT 'lx',
  project_id  text,
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('line', 'pnu', 'region')),
  buffer_m    numeric NOT NULL DEFAULT 0,
  line        geometry(Geometry, 5179),          -- 구역선 원래 모양(올린 파일 · PNU 필지 합 · 행정구역)
  geom        geometry(MultiPolygon, 5179) NOT NULL,   -- 분석 범위(구역선 + 버퍼)
  sgg         text[] NOT NULL DEFAULT '{}',      -- 걸치는 시군구(지금 코드)
  years       int[] NOT NULL DEFAULT '{}',       -- 프로젝트에서 고른 영상 연도
  source_name text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS change_ranges_geom ON change_ranges USING gist (geom);
CREATE INDEX IF NOT EXISTS change_ranges_project ON change_ranges (project_id);

CREATE TABLE IF NOT EXISTS change_runs (
  job_id      text PRIMARY KEY,
  range_id    text NOT NULL REFERENCES change_ranges(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL DEFAULT 'lx',
  year_a      int NOT NULL,
  year_b      int NOT NULL,
  zoom        int NOT NULL,
  version     text NOT NULL,
  state       text NOT NULL DEFAULT 'queued',
  stats       jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);
CREATE INDEX IF NOT EXISTS change_runs_key ON change_runs (range_id, year_a, year_b, version, state);

CREATE TABLE IF NOT EXISTS change_marks (
  job_id      text NOT NULL REFERENCES change_runs(job_id) ON DELETE CASCADE,
  fid         text NOT NULL,
  tenant_id   text NOT NULL DEFAULT 'lx',
  status      text NOT NULL DEFAULT '미확인' CHECK (status IN ('미확인', '불법', '적법', '현장확인', '철거완료')),
  memo        text,
  photos      jsonb NOT NULL DEFAULT '[]',
  by_user     text,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, fid)
);
CREATE TABLE IF NOT EXISTS change_mark_log (
  id          bigserial PRIMARY KEY,
  job_id      text NOT NULL,
  fid         text NOT NULL,
  tenant_id   text NOT NULL DEFAULT 'lx',
  status      text,
  memo        text,
  photos      jsonb,
  by_user     text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS change_mark_log_k ON change_mark_log (job_id, fid, at DESC);

CREATE TABLE IF NOT EXISTS change_shares (
  range_id    text NOT NULL REFERENCES change_ranges(id) ON DELETE CASCADE,
  tenant_id   text NOT NULL,
  shared_by   text,
  at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (range_id, tenant_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON change_ranges, change_runs, change_marks, change_mark_log, change_shares TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE change_mark_log_id_seq TO landxi_app, landxi_worker;

-- 기관은 자기 범위 + 공유받은 범위만(LX 는 전부)
ALTER TABLE change_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_shares_rls ON change_shares;
CREATE POLICY change_shares_rls ON change_shares
  USING ((tenant_id = (SELECT current_setting('app.tenant_id', true))) OR ((SELECT current_setting('app.realm', true)) = 'lx'))
  WITH CHECK (((SELECT current_setting('app.realm', true)) = 'lx'));

ALTER TABLE change_ranges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_ranges_rls ON change_ranges;
CREATE POLICY change_ranges_rls ON change_ranges
  USING (((SELECT current_setting('app.realm', true)) = 'lx') OR tenant_id = (SELECT current_setting('app.tenant_id', true))
         OR id IN (SELECT s.range_id FROM change_shares s WHERE s.tenant_id = (SELECT current_setting('app.tenant_id', true))))
  WITH CHECK (((SELECT current_setting('app.realm', true)) = 'lx') OR tenant_id = (SELECT current_setting('app.tenant_id', true)));

ALTER TABLE change_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_runs_rls ON change_runs;
CREATE POLICY change_runs_rls ON change_runs
  USING (((SELECT current_setting('app.realm', true)) = 'lx') OR tenant_id = (SELECT current_setting('app.tenant_id', true))
         OR range_id IN (SELECT s.range_id FROM change_shares s WHERE s.tenant_id = (SELECT current_setting('app.tenant_id', true))))
  WITH CHECK (((SELECT current_setting('app.realm', true)) = 'lx') OR tenant_id = (SELECT current_setting('app.tenant_id', true)));

ALTER TABLE change_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_marks_rls ON change_marks;
CREATE POLICY change_marks_rls ON change_marks
  USING (((SELECT current_setting('app.realm', true)) = 'lx') OR job_id IN (SELECT r.job_id FROM change_runs r))
  WITH CHECK (((SELECT current_setting('app.realm', true)) = 'lx') OR job_id IN (SELECT r.job_id FROM change_runs r));

ALTER TABLE change_mark_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS change_mark_log_rls ON change_mark_log;
CREATE POLICY change_mark_log_rls ON change_mark_log
  USING (((SELECT current_setting('app.realm', true)) = 'lx') OR job_id IN (SELECT r.job_id FROM change_runs r))
  WITH CHECK (((SELECT current_setting('app.realm', true)) = 'lx') OR job_id IN (SELECT r.job_id FROM change_runs r));
