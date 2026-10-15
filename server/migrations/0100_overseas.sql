-- 0100_overseas.sql — 해외 결과 자산(원칙 256 · 260 · 10-15 해외-학습데이터 '이대로 시작') · 멱등
--   국내 전국 결과 장부(national_cells · national_jobs · national_faces)와 같은 모양 — 나라(country) 칸만 더했다.
--   XI맵이 나중에 국내와 똑같이(칸 진행 · 칸 숫자 · 낮은 줌 면 · 작업마다 지도 조각) 보여 줄 수 있게(원칙 260).
--   overseas_cells  나라 × 연도 × 칸(군 · ADM2) 진행 장부 — counts = {경작지|시가지|물: {n, km2}}(객체 중심이 칸 안 · 국내와 같은 규칙)
--   overseas_jobs   칸 → 작업(큰 군은 여러 조각) · 지도 조각(result_set · bbox)
--   overseas_faces  낮은 줌용 결과 면(lvl 0 ≈ 200 m 칸 · lvl 1 ≈ 80 m 칸)
--   설정(lx_settings 'overseas.run'): 켜기 · 나라 · 연도 · 모델. 학습 장비 규칙은 전국 작업기와 같다(한 장 · 상한 70 % · 140 W · 대기열로만).
-- 국내 장부 · 숫자에는 섞이지 않는다(따로 둔 표).
-- 되돌리기: migrations/down/0100_overseas.down.sql
CREATE TABLE IF NOT EXISTS overseas_cells(
  country text NOT NULL,
  year int NOT NULL,
  cell_cd text NOT NULL,                       -- 군(ADM2) 코드(geoBoundaries shapeID)
  adm1 text, adm1_name text, name text,
  ord int NOT NULL DEFAULT 0,
  area_km2 numeric,
  geom geometry(MultiPolygon, 4326),
  geom_s geometry(MultiPolygon, 4326),
  state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'running', 'done', 'failed', 'skip')),
  tries int NOT NULL DEFAULT 0,
  next_try_at timestamptz,
  started_at timestamptz, done_at timestamptz,
  counts jsonb,
  imagery jsonb,                               -- 그 칸 달별 합성에 쓴 장면 · 맑은 화소 비율(달마다)
  err text,
  model_id text,
  test boolean NOT NULL DEFAULT false,
  PRIMARY KEY (country, year, cell_cd));
CREATE INDEX IF NOT EXISTS overseas_cells_state ON overseas_cells (country, year, state, ord);
CREATE INDEX IF NOT EXISTS overseas_cells_geom ON overseas_cells USING gist (geom_s);

CREATE TABLE IF NOT EXISTS overseas_jobs(
  job_id text PRIMARY KEY,
  country text NOT NULL, year int NOT NULL, cell_cd text NOT NULL, part int NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'queued',
  at timestamptz NOT NULL DEFAULT now(), done_at timestamptz,
  bbox float8[], result_set text, model_id text,
  test boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS overseas_jobs_cell ON overseas_jobs (country, year, cell_cd);

CREATE TABLE IF NOT EXISTS overseas_faces(
  country text NOT NULL, year int NOT NULL, cell_cd text NOT NULL, lvl int NOT NULL, cls text NOT NULL,
  geom geometry(MultiPolygon, 4326),
  PRIMARY KEY (country, year, cell_cd, lvl, cls));
CREATE INDEX IF NOT EXISTS overseas_faces_geom ON overseas_faces USING gist (geom);

INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES
  ('overseas.run', '{"enabled": true, "country": "kgz", "year": 2025, "model": null}', 'migration', now())
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON overseas_cells, overseas_jobs, overseas_faces TO landxi_app;
