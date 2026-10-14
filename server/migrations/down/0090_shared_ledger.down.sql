-- 0090 되돌리기
ALTER TABLE ledger_imports DROP COLUMN IF EXISTS staff_shared;
ALTER TABLE ledger_imports DROP COLUMN IF EXISTS name;
