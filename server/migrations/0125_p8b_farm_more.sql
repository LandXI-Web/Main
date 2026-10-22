-- 0125_p8b_farm_more.sql — 바퀴 22 P8b · now21 넣음 제안(10-22) · 멱등
--   ledger_imports.kind   대장 종류에 '공익직불 신청 대장'(direct_pay) 더함(제안-공익직불대장 — 농정과 직불 이행 점검)
--   parcel_notes          같은 메모 한꺼번에 쓴 것을 한 단추로 되돌리기(제안-메모되돌리기) — 줄을 지우지 않고 되돌린 표시(undone_at · undone_by)만.
--                         되돌린 줄은 지금 메모 · 필지 이력 · 엑셀에서 빠진다. 앱 계정은 이 두 칸만 고칠 수 있다(열 권한).
--   report_templates      보고서 '내 보고서 틀'(제안-보고서틀이름) — 넣은 결과 · 대장 · 범위를 이름 붙여 두고 한 번에 고른다(사람마다 · 기관 안).
--   tenant_notices        기관 관리자가 직접 쓰는 공지(제안-기관공지쓰기) — 그 기관 사용자에게만 보인다(LX 공지와 따로).
-- RLS: 기관 세션은 자기 기관 줄만 · LX 는 전부(0019 space_isolation 과 같은 식). audit_log 는 건드리지 않는다(쓰기는 deps.audit 로 한 줄 더할 뿐).
-- 되돌리기: migrations/down/0125_p8b_farm_more.down.sql
SET LOCAL lock_timeout = '10s';

ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_check;
ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_check
  CHECK (kind IN ('farm_ledger','dev_permit','public_asset','river_permit','greenhouse','feedcrop','direct_pay'));

ALTER TABLE parcel_notes ADD COLUMN IF NOT EXISTS undone_at timestamptz;
ALTER TABLE parcel_notes ADD COLUMN IF NOT EXISTS undone_by text;            -- tenant_users.id
GRANT UPDATE (undone_at, undone_by) ON parcel_notes TO landxi_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_tenant') THEN
    GRANT UPDATE (undone_at, undone_by) ON parcel_notes TO landxi_tenant;   -- 기관 권한 계정(0121) — 표 권한 맞추기는 표 단위만 옮기므로 열 권한은 여기서
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS report_templates(
  id text PRIMARY KEY,                               -- rt_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,                             -- tenant_users.id(만든 사람 — 사람마다 '내 보고서 틀')
  name text NOT NULL,                                -- 틀 이름(40자) — 예: 매달 축산과 보고
  cards text[] NOT NULL,                             -- 넣은 결과(서비스)
  emd text,                                          -- 범위(읍면동 · 없으면 관할 전체)
  import_id text,                                    -- 대장(넣지 않으면 없음)
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_name ON report_templates (tenant_id, user_id, name);
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_isolation ON report_templates;
CREATE POLICY space_isolation ON report_templates
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT, UPDATE, DELETE ON report_templates TO landxi_app;

CREATE TABLE IF NOT EXISTS tenant_notices(
  id text PRIMARY KEY,                               -- tn_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,                               -- 80자
  body text,                                         -- 2000자
  pinned boolean NOT NULL DEFAULT false,
  by_user text NOT NULL,                             -- tenant_users.id(쓴 기관 관리자)
  at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,                            -- 내림(지우지 않음)
  removed_by text);
CREATE INDEX IF NOT EXISTS tenant_notices_recent ON tenant_notices (tenant_id, at DESC) WHERE removed_at IS NULL;
ALTER TABLE tenant_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_isolation ON tenant_notices;
CREATE POLICY space_isolation ON tenant_notices
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT, UPDATE ON tenant_notices TO landxi_app;
