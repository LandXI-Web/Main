-- Land-XI 0005_survey_nation — 실태조사 전국화(core-survey · contract-parcel-ai.md)
-- 추가만(기존 표·열 이름 그대로) · 멱등(IF NOT EXISTS · DROP POLICY IF EXISTS). 실행: postgres(소유자) — migrate.py.

-- ── survey_parcels: 시군구 · 원천 · 기준 시점 ──────────────────────────────
ALTER TABLE survey_parcels ADD COLUMN IF NOT EXISTS sgg_cd text;
ALTER TABLE survey_parcels ADD COLUMN IF NOT EXISTS src text;
ALTER TABLE survey_parcels ADD COLUMN IF NOT EXISTS src_as_of text;
ALTER TABLE survey_parcels ADD COLUMN IF NOT EXISTS pnu_src text;
UPDATE survey_parcels SET sgg_cd = substr(pnu, 1, 5) WHERE sgg_cd IS NULL;
UPDATE survey_parcels SET src = 'canon', src_as_of = '2026-09-24' WHERE src IS NULL;
CREATE INDEX IF NOT EXISTS survey_parcels_sgg ON survey_parcels (sgg_cd);
CREATE INDEX IF NOT EXISTS survey_parcels_tsgg ON survey_parcels (tenant_id, sgg_cd);

-- ── survey_parcel_ai: 작업 × 필지 × 클래스(규칙 피연산자) ─────────────────────
CREATE TABLE IF NOT EXISTS survey_parcel_ai(
  job_id text NOT NULL,
  pnu text NOT NULL,
  tenant_id text NOT NULL,
  sgg_cd text NOT NULL,
  emd_cd text,
  cls text NOT NULL,                    -- 피연산자 키(bld|crop|park|gh|…) — rules/_operands.yaml
  cls_ko text, cls_en text,
  hit_m2 double precision NOT NULL DEFAULT 0,   -- 교차면적 합(모든 탐지 · 교차 > 0.01㎡)
  in_m2 double precision NOT NULL DEFAULT 0,    -- 과반 포함(≥0.5) · 신뢰도 ≥0.5 탐지의 교차면적 합
  n int NOT NULL DEFAULT 0,                     -- 위 조건 탐지 수
  conf double precision,                        -- 위 조건 면적 가중 평균 신뢰도
  ids text,                                     -- 근거 탐지 id 상위 5
  n1 int NOT NULL DEFAULT 0,                    -- 교차 ≥ 1㎡ 쌍 수(/results/{set}/parcels)
  hit1_m2 double precision NOT NULL DEFAULT 0,
  conf1_sum double precision NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, pnu, cls));
-- 필지 속성 사본(결과 × 필지 첫 응답 ≤ 3초 — 큰 필지 표와 조인하지 않게)
ALTER TABLE survey_parcel_ai ADD COLUMN IF NOT EXISTS emd text;
ALTER TABLE survey_parcel_ai ADD COLUMN IF NOT EXISTS jimok text;
ALTER TABLE survey_parcel_ai ADD COLUMN IF NOT EXISTS jimok_nm text;
ALTER TABLE survey_parcel_ai ADD COLUMN IF NOT EXISTS parcel_m2 double precision;
UPDATE survey_parcel_ai a SET emd = p.emd, jimok = p.jimok, jimok_nm = p.jimok_nm, parcel_m2 = p.area_m2 FROM survey_parcels p WHERE p.pnu = a.pnu AND a.parcel_m2 IS NULL;
CREATE INDEX IF NOT EXISTS survey_parcel_ai_sgg ON survey_parcel_ai (sgg_cd, job_id);
CREATE INDEX IF NOT EXISTS survey_parcel_ai_pnu ON survey_parcel_ai (pnu);
CREATE INDEX IF NOT EXISTS survey_parcel_ai_tcls ON survey_parcel_ai (tenant_id, sgg_cd, cls);

-- ── survey_sgg: 적재된 시군구 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_sgg(
  sgg_cd text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'lx',
  name text, sido text,
  job_id text,
  state text NOT NULL DEFAULT 'building' CHECK (state IN ('building','done','failed','no_ai')),
  parcels int DEFAULT 0, parcels_src jsonb DEFAULT '{}'::jsonb, parcels_as_of text,
  joined_parcels int DEFAULT 0,
  findings int DEFAULT 0, by_rule jsonb DEFAULT '{}'::jsonb, by_priority jsonb DEFAULT '{}'::jsonb,
  priority_cut jsonb,
  imagery text,
  bbox double precision[],
  build_job_id text, ms jsonb DEFAULT '{}'::jsonb, error text,
  at timestamptz DEFAULT now(), finished_at timestamptz);

-- 분석 범위(AI 작업 범위 ∩ 영상 footprint) — 규칙은 이 안의 필지만 평가(부재 규칙 R2 가 분석 밖 필지에서 켜지지 않게). NULL = 전역
ALTER TABLE survey_sgg ADD COLUMN IF NOT EXISTS coverage geometry(Geometry, 4326);
ALTER TABLE survey_sgg ADD COLUMN IF NOT EXISTS covered_parcels int;

-- ── survey_findings · survey_emd · survey_runs: 시군구 열 ─────────────────────
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS sgg_cd text;
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS ai_job_id text;
UPDATE survey_findings SET sgg_cd = substr(pnu, 1, 5) WHERE sgg_cd IS NULL AND pnu IS NOT NULL;
CREATE INDEX IF NOT EXISTS survey_findings_sgg ON survey_findings (sgg_cd, state, rule, priority);
ALTER TABLE survey_emd ADD COLUMN IF NOT EXISTS sgg_cd text;
UPDATE survey_emd SET sgg_cd = substr(emd_cd, 1, 5) WHERE sgg_cd IS NULL;
ALTER TABLE survey_runs ADD COLUMN IF NOT EXISTS sgg_cd text;

-- 남원 기존 행 = 적재된 시군구 1행(정본 적재 · 규칙은 옛 열) — 이미 있으면 그대로
INSERT INTO survey_sgg(sgg_cd, tenant_id, name, sido, job_id, state, parcels, parcels_src, parcels_as_of, findings, priority_cut, imagery, finished_at)
WITH g AS (SELECT sgg_cd, min(tenant_id) AS tenant_id, count(*) AS n FROM survey_parcels WHERE src = 'canon' GROUP BY sgg_cd)
SELECT g.sgg_cd, g.tenant_id, NULL, NULL, 'results/lx/namwon-landcover-2023', 'done', g.n,
       jsonb_build_object('canon', g.n), '2026-09-24',
       (SELECT count(*) FROM survey_findings f WHERE f.rule LIKE 'R%' AND f.sgg_cd = g.sgg_cd),
       (SELECT value FROM survey_meta WHERE key = 'priority_cut'), NULL, now()
FROM g
ON CONFLICT (sgg_cd) DO NOTHING;

-- ── RLS(다른 survey 표와 같은 식) ────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['survey_parcel_ai','survey_sgg'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx')$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_parcel_ai, survey_sgg TO landxi_app, landxi_worker;
