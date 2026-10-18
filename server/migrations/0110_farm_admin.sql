-- 0110_farm_admin.sql — 영농관리 행정서비스 결정(10-18 원칙 291) · 멱등
--   tenant_users.position     사용자 관리 '직위' 칸(영농-직위칸 넣음) — 선택 · 40자
--   ledger_imports.kind       대장 종류에 '사료작물 재배 신청'(feedcrop) 더함(영농-q1-feedcrop ⓐ 필지마다 견주기)
--   ledger_imports.base_date  행정정보 '기준일'(영농-행정정보목록 넣음 — 주제별 목록의 기준일 · 건수 · 등록자) — 선택 · 없으면 올린 날
--   tenant_settings           기관 설정 한 줄씩(열쇠 · 값) — 곤포사일리지 1개당 무게(kg)(영농-q2-bale-yield ⓑ)
--   download_pledges          개인정보가 든 파일의 이용 약속(영농-q3 — 사용 목적 · 활용 기간 · 누가 · 언제). 한 사람이 여러 번 적을 수 있다(기간이 끝나면 다시).
-- RLS: 기관 세션은 자기 기관 줄만 · LX 는 전부(0019 space_isolation 과 같은 식). audit_log 는 건드리지 않는다.
-- 되돌리기: migrations/down/0110_farm_admin.down.sql
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS position text;

ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_check;
ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_check
  CHECK (kind IN ('farm_ledger','dev_permit','public_asset','river_permit','greenhouse','feedcrop'));
ALTER TABLE ledger_imports ADD COLUMN IF NOT EXISTS base_date date;

CREATE TABLE IF NOT EXISTS tenant_settings(
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,                                 -- 예: bale_kg
  value jsonb NOT NULL,
  updated_by text,                                   -- tenant_users.id
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key));

CREATE TABLE IF NOT EXISTS download_pledges(
  id text PRIMARY KEY,                               -- pl_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  purpose text NOT NULL,                             -- 사용 목적(200자)
  until_date date NOT NULL,                          -- 활용 기간 끝
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS download_pledges_who ON download_pledges (tenant_id, user_id, at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_settings', 'download_pledges'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS space_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY space_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings, download_pledges TO landxi_app;
