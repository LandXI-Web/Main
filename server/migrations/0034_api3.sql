-- 0034_api3.sql — 외부 연동 API 3차 · 1차 고침 + 안내 · 신청(원칙 184 · 확인 대장 10-11 16:41 API3: 개념 맞음 · 키단위 ⓐ · 분석승인 ⓐ · 여는순서 ⓐ · 결과장부 ⓐ · 1차키 ⓐ) · 멱등
--   api_applicants   키를 신청한 시스템 한 줄(신청 창 · 또는 LX 관리자가 바로 만든 시스템). 구분 internal(LX 내부 시스템) · lx_service(LX 다른 서비스 — 랜디에어 등)
--                    · external(외부 기관 시스템 — 보안성 검토 전이라 신청은 받되 승인은 막는다 · API3-여는순서 ⓐ). 상태 pending · approved · rejected(사유).
--                    지우지 않는다(기록은 자산 · 원칙 173). 시험 신청은 test = true.
--   api_keys         키 = 신청 시스템 × 분석 서비스 하나(API3-키단위 ⓐ) — 기관 공유와 떨어진다(공유를 거둬도 키는 그대로). 옛 표는 지우지 않고 칸을 더한다
--                    (1차 키는 모두 폐기 · 켜진 키 0 — 옮길 것 없음 · API3-1차키 ⓐ). tenant_id 는 기관이 신청자일 때만(기관 관리자 '받은 API 키' 보기).
--                    scope = 범위(전국 {"all":true} · 행정구역 {"codes":["52","52190"]} · 사각 범위 {"bbox":[서,남,동,북]}) · rights = read | read_analyze ·
--                    sources = 쓸 수 있는 영상 원천(ngii-aerial · vworld · lx — lx 는 LX 내부 키만) · area_* = 분석 넓이 한도(㎢ · 키 승인 때 정함 · 2차 분석 호출에서 씀 · API3-분석승인 ⓐ).
--   service_results  서비스 결과 장부(API3-결과장부 ⓐ) — (서비스, 시군구, 영상 원천, 연도, 서비스 판) → 결과 묶음(detections.job_id). 결과 줄은 detections 그대로 읽는다.
--                    같은 서비스 · 시군구 · 원천 · 연도에서 새 결과가 나오면 앞 줄은 replaced_at(대체됨) — 지우지 않는다. 채우기는 게이트웨이(ext_api.ledger_sync)가 한다.
--   cards.api_id     서비스 영문 이름(주소 /v1/services/{api_id}) · cards.api_sources 분석할 수 있는 원천(2차 적합도에서 채움 — 지금 비어 있음).
-- 되돌리기: migrations/down/0034_api3.down.sql. RLS: LX 영역만(외부 창구 · 신청 창은 서버가 lx 영역 연결로 읽고 쓴다).

CREATE TABLE IF NOT EXISTS api_applicants(
  id text PRIMARY KEY,                               -- 'apa_' + 10 hex
  kind text NOT NULL CHECK (kind IN ('internal', 'lx_service', 'external')),
  org text,                                          -- 기관 · 부서
  system text NOT NULL,                              -- 쓰는 시스템 이름(예: 랜디에어)
  person text,                                       -- 담당자
  phone text,
  email text,
  services text[] NOT NULL DEFAULT '{}',             -- 쓰려는 분석 서비스(cards.id)
  area text,                                         -- 신청한 범위(사람 말 — 예: 전국 · 전북특별자치도 · 남원시)
  rights text NOT NULL DEFAULT 'read' CHECK (rights IN ('read', 'read_analyze')),
  purpose text,                                      -- 쓰는 목적
  server_ip text,                                    -- 호출하는 서버 주소(선택)
  tenant_id text,                                    -- 기관이 신청자일 때(LX 관리자가 이음 · 선택)
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  decided_by text, decided_at timestamptz, reason text,
  via text NOT NULL DEFAULT 'form',                  -- form(신청 창) · admin(LX 관리자가 바로)
  consent_at timestamptz,
  site text, ip text,
  test boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS api_applicants_at ON api_applicants (state, at DESC);

ALTER TABLE api_keys ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS applicant_id text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scope jsonb NOT NULL DEFAULT '{"all": true}'::jsonb;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rights text NOT NULL DEFAULT 'read';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT ARRAY['ngii-aerial', 'vworld'];
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS area_once_km2 numeric;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS area_day_km2 numeric;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS area_month_km2 numeric;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS gen int NOT NULL DEFAULT 1;     -- 1 = 1차(기관 × 공유) · 3 = 3차(신청 시스템 × 서비스)
CREATE INDEX IF NOT EXISTS api_keys_applicant ON api_keys (applicant_id);
ALTER TABLE api_calls ADD COLUMN IF NOT EXISTS applicant_id text;

ALTER TABLE cards ADD COLUMN IF NOT EXISTS api_id text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS api_sources text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS cards_api_id ON cards (api_id) WHERE api_id IS NOT NULL;
UPDATE cards SET api_id = v.api FROM (VALUES
  ('card-45424f', 'building'), ('card-farm', 'farm'), ('card-389c45', 'parking'), ('card-5e85a9', 'greenhouse'),
  ('card-d8fc01', 'silage'), ('card-change', 'change'), ('card-marine', 'marine'), ('card-living', 'living'),
  ('card-road', 'road'), ('card-forest', 'forest'), ('card-crowd', 'crowd'),
  ('card-global-farm', 'global-farm'), ('card-global-disaster', 'global-disaster')) AS v(id, api)
WHERE cards.id = v.id AND cards.api_id IS NULL;

CREATE TABLE IF NOT EXISTS service_results(
  id bigserial PRIMARY KEY,
  card_id text NOT NULL,
  set_id text NOT NULL,                              -- detections.job_id(작업 번호 또는 결과 묶음 이름) — 바깥에 내지 않는다
  sgg_cd text,                                       -- 시군구(지금 코드)
  source text NOT NULL,                              -- ngii-aerial · vworld · lx
  year int,                                          -- 영상 연도(모르면 비움)
  service_version text,                              -- 서비스 판
  imagery_id text,
  analyzed_at timestamptz,                           -- 분석한 때
  origin text NOT NULL DEFAULT 'job',                -- deploy(배포본 지금 결과) · deploy_prev(배포본 지난 결과) · job(끝난 작업) · api(2차 분석 호출)
  replaced_at timestamptz, replaced_by bigint,       -- 같은 서비스 · 시군구 · 원천 · 연도의 새 결과로 대체됨
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, set_id));
CREATE INDEX IF NOT EXISTS service_results_cell ON service_results (card_id, sgg_cd, source, year);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['api_applicants', 'service_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format('CREATE POLICY lx_only ON %I USING (current_setting(''app.realm'', true) = ''lx'') WITH CHECK (current_setting(''app.realm'', true) = ''lx'')', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON api_applicants TO landxi_app;
GRANT SELECT, INSERT, UPDATE ON service_results TO landxi_app;
GRANT USAGE, SELECT ON SEQUENCE service_results_id_seq TO landxi_app;
