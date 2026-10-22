-- 0119_p4_parcels_common.sql — (1/2 · 정책 · 표 · 색인) 필지는 전국 공통 한 벌, 기관은 '볼 수 있는 시군구'만(10-22 now21 저장보안-DB-필지 ⓐ · 바퀴 22 P4) · 멱등
--   예전: 필지 하나가 한 기관에만(필지번호가 열쇠 · tenant_id 기본값 'namwon' — 지역 하드코딩). 도 · 시군 · LX 가 같은 필지를 함께 볼 수 없었다.
--   이제: 필지 행의 주인은 모두 'lx'(전국 공통 한 벌) · 기관이 보는 범위 = tenant_regions(시군구 코드 접두 — config/regions.yaml tenants 와 같은 값,
--         server/migrate.py 가 기동 때마다 맞춘다). 광역 · 기초 위아래(tenants.parent_id · 채택 제안 저장보안-제안-기관위아래): 위 기관은 아래 기관의 범위도 본다.
--   지금 보이는 필지는 그대로다(남원 52190 · 광주전남 12·29·46 접두 — 바꾸기 전과 같은 행). 쓰기(적재 · 고침)는 LX(작업기 · 관리)만.
--   순서: 이 파일(정책을 '볼 수 있는 시군구'로 먼저 바꿈 — 주인 칸과 상관없이 같은 행이 보인다) → 0120(주인 칸을 lx 로 · 무거운 쓰기는 따로).
--   바꾸기 전 보관: 02. 데이터/_backup/p4-20261022/parcels-owner.json.gz(필지번호 → 옛 주인 · lx 가 아닌 1,080,125줄).
-- 되돌리기: migrations/down/0119_p4_parcels_common.down.sql
SET LOCAL lock_timeout = '10s';     -- 쓰는 중인 표를 오래 기다리지 않는다(실패하면 다음 기동 때 다시)
-- 시도 접두 색인을 먼저(쓰기만 잠시 막음 · 읽기는 그대로) — 아래 정책이 쓴다
CREATE INDEX IF NOT EXISTS survey_parcels_sido ON survey_parcels (left(sgg_cd, 2));

CREATE TABLE IF NOT EXISTS tenant_regions (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prefix    text NOT NULL CHECK (prefix ~ '^[0-9]{0,10}$'),   -- 시군구 코드 접두: '' = 전국 · 2자리 = 시도 · 5자리 = 시군구
  src       text NOT NULL DEFAULT 'config/regions.yaml',
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, prefix)
);
GRANT SELECT ON tenant_regions TO landxi_app, landxi_worker;
GRANT INSERT, UPDATE, DELETE ON tenant_regions TO landxi_worker;
-- 지금 값(regions.yaml 10-22) — 기동 때 migrate.py 가 다시 맞춘다(설정 파일이 정본)
INSERT INTO tenant_regions(tenant_id, prefix)
SELECT t, p FROM (VALUES ('namwon', '52190'), ('gwangju-jeonnam', '12'), ('gwangju-jeonnam', '29'), ('gwangju-jeonnam', '46'),
                         ('lx', ''), ('lx-demo', '')) v(t, p)
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = v.t)
ON CONFLICT DO NOTHING;

-- 광역 · 기초 기관의 위아래(채택 제안) — 위 기관 id. 지금 아래 기관이 있는 광역은 없다(값 없음 = 혼자).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS parent_id text REFERENCES tenants(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_parent_not_self') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- 지금 세션 기관(+ 그 아래 기관들)이 볼 수 있는 접두 — 길이별(0 = 전국 · 2 = 시도 · 5 = 시군구). 정책이 한 번만 부른다(초기 계획 · 색인 사용).
CREATE OR REPLACE FUNCTION app_scope_prefixes(len int) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
  WITH RECURSIVE t(id) AS (
    SELECT nullif(current_setting('app.tenant_id', true), '')
    UNION
    SELECT c.id FROM public.tenants c JOIN t ON c.parent_id = t.id)
  SELECT coalesce(array_agg(DISTINCT r.prefix), '{}'::text[]) FROM public.tenant_regions r JOIN t ON r.tenant_id = t.id
  WHERE length(r.prefix) = len
$f$;
REVOKE ALL ON FUNCTION app_scope_prefixes(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_scope_prefixes(int) TO landxi_app, landxi_worker;

-- 필지 행 주인 = 전국 공통(lx) · 기본값의 지역 이름 없앰
ALTER TABLE survey_parcels ALTER COLUMN tenant_id SET DEFAULT 'lx';


ALTER TABLE survey_parcels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON survey_parcels;
DROP POLICY IF EXISTS parcels_read ON survey_parcels;
DROP POLICY IF EXISTS parcels_write ON survey_parcels;
CREATE POLICY parcels_read ON survey_parcels FOR SELECT USING (
  (SELECT current_setting('app.realm', true)) = 'lx'
  OR ''::text = ANY ((SELECT app_scope_prefixes(0))::text[])
  OR left(sgg_cd, 2) = ANY ((SELECT app_scope_prefixes(2))::text[])
  OR sgg_cd = ANY ((SELECT app_scope_prefixes(5))::text[]));
CREATE POLICY parcels_write ON survey_parcels FOR ALL
  USING ((SELECT current_setting('app.realm', true)) = 'lx')
  WITH CHECK ((SELECT current_setting('app.realm', true)) = 'lx');

-- 연도 · 분류를 칸이 아니라 줄로(채택 제안 저장보안-제안-연도분류줄) — 필지 표의 연도 박힌 칸(a23_* · a25_*)을 줄로 옮겨 둔 판.
--   새 해 · 새 분류는 표를 고치지 않고 줄로 늘어난다. 전국 경로는 이미 줄(survey_parcel_ai · 작업 × 필지 × 분류)이다.
--   옛 칸은 지금 화면 · 규칙이 읽으므로 그대로 두고(1단계), 이 표에 같은 값을 둔다 — 다음 단계에서 읽는 쪽을 이 표로 옮긴다.
CREATE TABLE IF NOT EXISTS parcel_ai_year (
  pnu     text NOT NULL,
  sgg_cd  text NOT NULL,
  year    int  NOT NULL,
  cls     text NOT NULL,          -- building · crop · parking · greenhouse · uncrop(경작 안 함)
  area_m2 double precision,       -- 필지에 걸친 넓이
  in_m2   double precision,       -- 필지 안 넓이
  n       int,
  conf    real,
  ids     text,
  src     text NOT NULL DEFAULT 'survey_parcels',
  PRIMARY KEY (pnu, year, cls)
);
CREATE INDEX IF NOT EXISTS parcel_ai_year_sgg ON parcel_ai_year (sgg_cd, year, cls);
GRANT SELECT ON parcel_ai_year TO landxi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON parcel_ai_year TO landxi_worker;
ALTER TABLE parcel_ai_year ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parcel_year_read ON parcel_ai_year;
DROP POLICY IF EXISTS parcel_year_write ON parcel_ai_year;
CREATE POLICY parcel_year_read ON parcel_ai_year FOR SELECT USING (
  (SELECT current_setting('app.realm', true)) = 'lx'
  OR ''::text = ANY ((SELECT app_scope_prefixes(0))::text[])
  OR left(sgg_cd, 2) = ANY ((SELECT app_scope_prefixes(2))::text[])
  OR sgg_cd = ANY ((SELECT app_scope_prefixes(5))::text[]));
CREATE POLICY parcel_year_write ON parcel_ai_year FOR ALL
  USING ((SELECT current_setting('app.realm', true)) = 'lx')
  WITH CHECK ((SELECT current_setting('app.realm', true)) = 'lx');
