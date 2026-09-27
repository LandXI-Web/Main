-- Land-XI 0002_survey — 실태조사(F2-S · F1-CONTRACT v1.1-22) 정본 표
-- 원천: 02. 데이터/survey/ (V-World 연속지적 332,084 · 2023 AI 129,420 결합 · 규칙 R1–R6 · 의심 20,872 · 이력 6,818)
-- 실행: postgres(소유자)로. 멱등(IF NOT EXISTS · DROP POLICY IF EXISTS). 적재는 server/survey/pipelines/s5_load_pg.py.
-- RLS: 1차는 tenant_id='namwon' 고정 열 + realm 관문 — 다른 기관 세션은 0행.
-- 소유자 성명 열 없음(연속지적에 없음 · OWNER_NM 미사용).

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS survey_parcels(
  pnu text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  addr text, emd text, emd_cd text, ri text, jibun text,
  jimok text, jimok_nm text,
  area_m2 double precision,              -- EPSG:5186 계산 면적(원값 · 반올림 없음)
  jiga double precision, jiga_ym text,   -- 공시지가(원/㎡) · 기준년월(YYYY-MM · 공란 = 비과세 등)
  yongdo text, nongup text,
  geom geometry(MultiPolygon, 4326),
  -- 2023 AI(25cm 항공 · 4클래스) 교차면적 합(모든 객체)
  a23_bld_m2 double precision DEFAULT 0, a23_crop_m2 double precision DEFAULT 0,
  a23_park_m2 double precision DEFAULT 0, a23_gh_m2 double precision DEFAULT 0,
  -- 객체 과반 포함(≥ obj_in_frac) · 신뢰도 ≥ conf_min 인 객체만(규칙 근거)
  a23_bld_in_m2 double precision DEFAULT 0, a23_crop_in_m2 double precision DEFAULT 0,
  a23_park_in_m2 double precision DEFAULT 0, a23_gh_in_m2 double precision DEFAULT 0,
  a23_bld_n int DEFAULT 0, a23_crop_n int DEFAULT 0, a23_park_n int DEFAULT 0, a23_gh_n int DEFAULT 0,
  a23_bld_conf double precision, a23_crop_conf double precision, a23_park_conf double precision, a23_gh_conf double precision,
  a23_bld_ids text, a23_crop_ids text, a23_park_ids text, a23_gh_ids text,
  r23_bld double precision, r23_crop double precision, r23_park double precision, r23_gh double precision, r23_farm double precision,
  -- 2025 AI(A02 드론 · 경작/비경작 · 비닐하우스)
  a25_crop_m2 double precision DEFAULT 0, a25_uncrop_m2 double precision DEFAULT 0, a25_gh_m2 double precision DEFAULT 0,
  a25_gh_in_m2 double precision DEFAULT 0, a25_gh_n int DEFAULT 0, a25_gh_conf double precision, a25_gh_ids text,
  -- 2025 비지도 변화지수(A04)
  chg text, chg_built_new_m2 double precision DEFAULT 0,
  -- 정본 규칙 결과(s3_survey.py)
  flags text, sus_rule text, sus_priority text, sus_score double precision);
CREATE INDEX IF NOT EXISTS survey_parcels_emd ON survey_parcels (emd_cd);
CREATE INDEX IF NOT EXISTS survey_parcels_jimok ON survey_parcels (emd_cd, jimok);
CREATE INDEX IF NOT EXISTS survey_parcels_geom ON survey_parcels USING gist (geom);

CREATE TABLE IF NOT EXISTS survey_findings(
  id text PRIMARY KEY,                   -- f_{rule}_{pnu}
  tenant_id text NOT NULL DEFAULT 'namwon',
  rank int, priority text, score double precision, rule text, rule_nm text,
  pnu text, addr text, emd text, emd_cd text, jimok text, parcel_m2 double precision, yongdo text, nongup text,
  evid_m2 double precision, conf double precision, corroboration text, img_date text, evidence text, ai_ids text,
  lon double precision, lat double precision,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','assigned','inspected','closed','dismissed')),
  assignee text, planned_for date, reason text, updated_at timestamptz, updated_by text,
  demo bool NOT NULL DEFAULT false,      -- lx staff 시연 쓰기(24h 뒤 자동 원복 · basis 'demo')
  geom geometry(Point, 4326));
CREATE INDEX IF NOT EXISTS survey_findings_emd ON survey_findings (emd_cd);
CREATE INDEX IF NOT EXISTS survey_findings_rule ON survey_findings (rule, priority);
CREATE INDEX IF NOT EXISTS survey_findings_priority ON survey_findings (priority);
CREATE INDEX IF NOT EXISTS survey_findings_state ON survey_findings (state);
CREATE INDEX IF NOT EXISTS survey_findings_cov2 ON survey_findings (tenant_id, state, rule, priority, emd_cd);   -- 탭 카운트 index-only
CREATE INDEX IF NOT EXISTS survey_findings_score ON survey_findings (score DESC, rank);
CREATE INDEX IF NOT EXISTS survey_findings_pnu ON survey_findings (pnu);
CREATE INDEX IF NOT EXISTS survey_findings_geom ON survey_findings USING gist (geom);

CREATE TABLE IF NOT EXISTS survey_finding_events(
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  finding_id text NOT NULL REFERENCES survey_findings(id),
  from_state text, to_state text NOT NULL, by text, realm text, reason text, assignee text, planned_for date,
  demo bool NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now(),
  client_id text UNIQUE);
CREATE INDEX IF NOT EXISTS survey_finding_events_f ON survey_finding_events (finding_id, at);

CREATE TABLE IF NOT EXISTS survey_timeline(
  pnu text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  events jsonb, summary text[], flags text, sus_priority text);

CREATE TABLE IF NOT EXISTS survey_emd(
  emd_cd text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  name text, names text[], parcels int, area_ha double precision, farm_parcels int,
  jimok_top jsonb, ai2023_in_parcels_ha jsonb, parcels_with_ai2023 int,
  suspects jsonb, suspects_total int, suspect_parcels int, priority jsonb, top5 jsonb,
  bbox double precision[]);

CREATE TABLE IF NOT EXISTS survey_rules(
  id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  name text, condition text, thresholds jsonb, basis text DEFAULT 'estimate', counts jsonb, base_score int, note text);

CREATE TABLE IF NOT EXISTS survey_runs(
  job_id text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'namwon',
  rules jsonb, thresholds jsonb, counts jsonb DEFAULT '{}'::jsonb, ms_by_emd jsonb DEFAULT '{}'::jsonb,
  at timestamptz DEFAULT now(), finished_at timestamptz);

CREATE TABLE IF NOT EXISTS survey_meta(
  key text PRIMARY KEY, value jsonb, at timestamptz DEFAULT now());

-- ── RLS: tenant namwon 고정 열 + realm lx ─────────────────────────────────────
-- current_setting 을 스칼라 부분질의로 감싸 InitPlan 1회 평가(행마다 부르면 20,872행 정렬에 +12ms · 계획기가 인덱스를 못 씀 — 실측 2026-09-27).
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['survey_parcels','survey_findings','survey_finding_events','survey_timeline','survey_emd','survey_rules','survey_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx')$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON survey_parcels, survey_findings, survey_finding_events, survey_timeline, survey_emd,
  survey_rules, survey_runs, survey_meta TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE survey_finding_events_id_seq TO landxi_app, landxi_worker;
