-- 0137 되돌리기 — 종류 장부 · 큰 행정 자료 도형 칸을 거두고 예전 CHECK(7개)로. 새 종류로 올린 행정 자료가 있으면 먼저 지워야 CHECK 가 걸린다.
DROP TABLE IF EXISTS shared_layer_feats;
ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_fk;
ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_check
  CHECK (kind = ANY (ARRAY['farm_ledger','dev_permit','public_asset','river_permit','greenhouse','feedcrop','direct_pay']));
DROP TABLE IF EXISTS ledger_kinds;
