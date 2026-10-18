-- 0111_farm_report_rules.sql — 영농관리 바퀴 19(10-18 15:52 now 답 · 원칙 293) · 멱등
--   report_issues          보고서 발급 목록(영농-보고서 '시안 A 고르면 바로 만들어지는 보고서') — 넣은 결과(서비스 여럿) · 범위 · 대장 ·
--                          요청자 · 처음 받은 때 · 마지막 받은 때 · 내려받은 횟수. 같은 사람이 같은 고르기로 다시 받으면 횟수만 늘린다.
--   service_region_rules   서비스 × 시군구 보이기 규칙(제안-곤포서비스남원공유 — "곤포사일리지는 남원만.. 남원 자산이기 때문이다 보령은 제외").
--                          rule='exclude' 인 줄의 (서비스, 시군구) 결과는 XI맵 · 시군구 결과 층 · 서비스 지역 · 실적 숫자 · 외부 API 에서 빠진다.
--                          결과 자체(작업 · 결과 묶음 · 배포 기록 · service_results)는 지우지 않는다 — 줄을 지우면 그대로 돌아온다.
-- RLS: report_issues 는 기관 세션은 자기 기관 줄만 · LX 는 전부(0110 과 같은 식). service_region_rules 는 LX 설정(기관 세션은 읽기만).
-- audit_log 는 건드리지 않는다. 되돌리기: migrations/down/0111_farm_report_rules.down.sql
CREATE TABLE IF NOT EXISTS report_issues(
  id text PRIMARY KEY,                               -- ri_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,                                      -- tenant_users.id(처음 받은 사람 = 요청자)
  pick_key text NOT NULL,                            -- 고르기 열쇠(서비스 정렬 · 범위 · 대장) — 같은 사람 같은 고르기는 한 줄
  cards text[] NOT NULL,
  emd text,
  import_id text,
  title text,                                        -- 넣은 결과 이름(서비스 · 시점) 한 줄
  fmt text NOT NULL DEFAULT 'hwpx',                  -- 마지막으로 받은 형식(hwpx | xlsx)
  downloads integer NOT NULL DEFAULT 1,
  at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, pick_key));
CREATE INDEX IF NOT EXISTS report_issues_recent ON report_issues (tenant_id, last_at DESC);

CREATE TABLE IF NOT EXISTS service_region_rules(
  card_id text NOT NULL,
  sgg_cd text NOT NULL,
  rule text NOT NULL DEFAULT 'exclude' CHECK (rule IN ('exclude')),
  reason text,
  by_whom text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, sgg_cd));

-- 곤포사일리지 분석서비스는 남원 자산 — 보령시(44180) 결과는 보이지 않게(10-18 사용자). 서비스 id 를 이름으로 찾는다(코드에 서비스 id 를 두지 않음).
INSERT INTO service_region_rules(card_id, sgg_cd, rule, reason, by_whom)
SELECT c.id, '44180', 'exclude', '곤포사일리지는 남원 자산 — 남원만, 보령은 제외(10-18 사용자 · 원칙 293)', '사용자 결정'
  FROM cards c WHERE c.name->>'ko' LIKE '곤포사일리지%'
ON CONFLICT (card_id, sgg_cd) DO NOTHING;

ALTER TABLE report_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_isolation ON report_issues;
CREATE POLICY space_isolation ON report_issues USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT, UPDATE, DELETE ON report_issues TO landxi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_region_rules TO landxi_app;
