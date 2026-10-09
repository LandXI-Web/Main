-- 0025 필지 대조를 카드(서비스)마다 따로(확인 대장 '모델-표기' ⓐ 둘 다 고침 · 2026-10-09) · 멱등
-- 같은 시군구에 필지 대조 카드가 여럿이면 survey_sgg 한 줄 · survey_findings 한 묶음을 같이 써서, 나중에 돈 카드가 앞 카드의 숫자를 덮었다.
-- 이제 카드가 돌린 필지 대조는 survey_card(시군구 × 카드 한 줄) + survey_findings.card_id 로 따로 둔다.
--   card_id NULL = 시군구 실태조사(기관 실태조사 · 카드 없이 돌린 전 규칙) — 지금까지와 같다.
--   시군구 숫자(카드를 고르지 않은 화면 · XI ChatGEO 지역 질문) = 그 시군구의 모든 필지 대조 행(시군구 실태조사 + 카드들).
--   카드 숫자(서비스 카드 · 카드 상세 · 기관 서비스 이력) = 그 카드 행만. 카드 행이 없고 카드가 규칙을 고르지 않았으면(전 규칙) 시군구 실태조사.

CREATE TABLE IF NOT EXISTS survey_card(
  sgg_cd text NOT NULL,
  card_id text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'lx',
  card_version_id text, deploy_id text,
  job_id text,                                   -- 이 카드 필지 대조에 쓴 AI 분석 작업
  rules jsonb,                                   -- 평가한 규칙(없으면 전 규칙)
  state text NOT NULL DEFAULT 'building' CHECK (state IN ('building','done','failed','no_ai')),
  joined_parcels int DEFAULT 0,
  findings int DEFAULT 0, by_rule jsonb DEFAULT '{}'::jsonb, by_priority jsonb DEFAULT '{}'::jsonb,
  priority_cut jsonb,
  imagery text,
  coverage geometry(Geometry, 4326), covered_parcels int,
  build_job_id text, ms jsonb DEFAULT '{}'::jsonb, error text, moved_from text,
  at timestamptz DEFAULT now(), finished_at timestamptz,
  PRIMARY KEY (sgg_cd, card_id));
CREATE INDEX IF NOT EXISTS survey_card_card ON survey_card (card_id);

ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS card_id text;
CREATE INDEX IF NOT EXISTS survey_findings_scope ON survey_findings (sgg_cd, card_id, rule, priority, state);

ALTER TABLE survey_card ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON survey_card;
CREATE POLICY lx_tenant_isolation ON survey_card USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx');
GRANT SELECT, INSERT, UPDATE, DELETE ON survey_card TO landxi_app, landxi_worker;
