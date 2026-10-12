-- 0045_national.sql — 전국 결과 자산(원칙 136 · 211 · 218 · 10-12 12:45 확인) · 멱등
--   national_cells  결과 자산 × 연도 × 칸(읍면동) 진행 장부 — 진행 막대 · '분석 예정' · 요약 숫자의 한 출처.
--                   asset: farm(농지 전수 — 농지 둘레) · river(하천 · 계곡 — 국가 · 지방 · 소하천 띠).
--                   target = 이 칸에서 실제로 분석하는 범위(읍면동 ∩ 농지 둘레 / 하천 띠) · geom_s = 화면용 읍면동 경계(단순화).
--                   state: todo · running · done · failed(다시 3번 넘김 — 관리자가 다시) · wait(하천 칸이 같은 읍면동 농지 칸을 기다림) · skip(분석할 범위 없음).
--   national_jobs   칸 → 작업(큰 읍면동은 여러 조각) — 결과 객체(detections)를 칸에 잇는다.
--   national_faces  낮은 줌용 단순화 결과 면(lvl 0 = 약 200m 칸 · lvl 1 = 약 80m 칸 — 그 분류가 칸의 4분의 1 넘는 칸) — 칸이 끝날 때 만든다(작음).
--   설정(lx_settings 'national.run'): 켜기 · 연도 · 순서 · 띠 폭 · 동시 호출. 쉬는 시간대는 재학습과 같은 'core.retrain' 을 쓴다(같은 대기열 규칙).
-- 되돌리기: migrations/down/0045_national.down.sql

CREATE TABLE IF NOT EXISTS national_cells(
  asset text NOT NULL CHECK (asset IN ('farm', 'river')),
  year int NOT NULL,
  cell_cd text NOT NULL,                       -- 법정 읍면동 코드(8자리)
  sgg_cd text NOT NULL,
  sido text, sgg_name text, name text,
  ord int NOT NULL DEFAULT 0,                  -- 도는 순서(설정 순서로 다시 매김)
  emd_km2 numeric, target_km2 numeric,
  target geometry(MultiPolygon, 4326),
  geom_s geometry(MultiPolygon, 4326),
  state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'running', 'done', 'failed', 'wait', 'skip')),
  tries int NOT NULL DEFAULT 0,
  next_try_at timestamptz,
  started_at timestamptz, done_at timestamptz,
  counts jsonb,                                -- {경작지: {n, km2}, 비닐하우스: {n, km2}, 건물: {n, km2}} — 칸 안(객체 중심이 칸 안)만
  err text,
  test boolean NOT NULL DEFAULT false,
  PRIMARY KEY (asset, year, cell_cd));
CREATE INDEX IF NOT EXISTS national_cells_state ON national_cells (asset, year, state, ord);
CREATE INDEX IF NOT EXISTS national_cells_geom ON national_cells USING gist (geom_s);
CREATE INDEX IF NOT EXISTS national_cells_target ON national_cells USING gist (target);

CREATE TABLE IF NOT EXISTS national_jobs(
  job_id text PRIMARY KEY,
  asset text NOT NULL, year int NOT NULL, cell_cd text NOT NULL, part int NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'queued',
  at timestamptz NOT NULL DEFAULT now(), done_at timestamptz,
  test boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS national_jobs_cell ON national_jobs (asset, year, cell_cd);
-- 결과 객체는 데이터베이스(학습 장비 PC 의 C: 디스크 안)에 쌓지 않는다 — 칸이 끝나면 숫자 · 낮은 줌 면만 남기고 객체 줄은 지운다.
-- 객체는 작업마다 E: 의 결과 묶음 파일(지도 조각 · 결과 GeoJSON)에 남고, XI맵은 그 지도 조각을 판 번호 주소로 읽는다(bbox = 그 조각 범위).
ALTER TABLE national_jobs ADD COLUMN IF NOT EXISTS bbox float8[];
ALTER TABLE national_jobs ADD COLUMN IF NOT EXISTS result_set text;

CREATE TABLE IF NOT EXISTS national_faces(
  asset text NOT NULL, year int NOT NULL, cell_cd text NOT NULL, lvl int NOT NULL, cls text NOT NULL,
  geom geometry(MultiPolygon, 4326),
  PRIMARY KEY (asset, year, cell_cd, lvl, cls));
CREATE INDEX IF NOT EXISTS national_faces_geom ON national_faces USING gist (geom);

INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES
  ('national.run', '{"enabled": true, "year": 2025, "assets": ["farm", "river"], "order": ["52", "12", "47", "44", "48", "43", "41", "51", "50", "36", "27", "31", "26", "28", "30", "11"], "river_buffer_m": 100, "fetch_max": 4}', 'migration', now())
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON national_cells, national_jobs, national_faces TO landxi_app;
GRANT UPDATE (state, tries, next_try_at, err) ON national_cells TO landxi_app;
