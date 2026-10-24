-- 0130_range_ledger 되돌리기
DROP TABLE IF EXISTS range_counts;
DROP INDEX IF EXISTS change_ranges_codes;
ALTER TABLE change_ranges DROP COLUMN IF EXISTS codes;
