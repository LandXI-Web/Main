-- 0110_farm_admin 되돌리기 — 직위 칸 · 기준일 칸 · 기관 설정 · 이용 약속 표를 지우고 대장 종류를 예전 다섯으로.
-- 사료작물 재배 신청 대장(feedcrop)이 남아 있으면 종류 제한을 되돌릴 수 없으므로 그 대장 행부터 지운다(되돌릴 때만).
DELETE FROM registry_snapshots WHERE kind = 'feedcrop';
DELETE FROM ledger_recent WHERE kind = 'feedcrop';
DELETE FROM ledger_imports WHERE kind = 'feedcrop';
ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_check;
ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_check
  CHECK (kind IN ('farm_ledger','dev_permit','public_asset','river_permit','greenhouse'));
ALTER TABLE ledger_imports DROP COLUMN IF EXISTS base_date;
DROP TABLE IF EXISTS download_pledges;
DROP TABLE IF EXISTS tenant_settings;
ALTER TABLE tenant_users DROP COLUMN IF EXISTS position;
