-- 0125_p8b_farm_more 되돌리기 — 보고서 틀 · 기관 공지 표를 지우고, 메모 되돌린 표시 칸을 빼고, 대장 종류를 예전 여섯으로.
-- 주의: 공익직불 신청 대장(direct_pay)으로 올린 대장이 있으면 종류 제약을 되돌리지 못한다(먼저 그 대장을 지우거나 종류를 바꿀 것).
SET LOCAL lock_timeout = '10s';
DROP TABLE IF EXISTS tenant_notices;
DROP TABLE IF EXISTS report_templates;
ALTER TABLE parcel_notes DROP COLUMN IF EXISTS undone_by;
ALTER TABLE parcel_notes DROP COLUMN IF EXISTS undone_at;
ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_check;
ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_check
  CHECK (kind IN ('farm_ledger','dev_permit','public_asset','river_permit','greenhouse','feedcrop'));
