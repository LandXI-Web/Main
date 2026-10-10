-- 0028_admin_manage 되돌리기 — 새 표 셋과 새 칸만 지운다(분석 요청 · 공유 기록 줄은 그대로). 실행: postgres(소유자) 로 직접.
UPDATE analysis_requests SET state='pending' WHERE state='held';
ALTER TABLE analysis_requests DROP COLUMN IF EXISTS queue_order, DROP COLUMN IF EXISTS urgent, DROP COLUMN IF EXISTS held_reason;
DROP TABLE IF EXISTS tenant_service_staff, tenant_shoot_staff, tenant_dept_scope;
ALTER TABLE card_shares DROP COLUMN IF EXISTS sgg;
DELETE FROM space_log WHERE kind='version';
ALTER TABLE space_log DROP CONSTRAINT IF EXISTS space_log_kind_check;
ALTER TABLE space_log ADD CONSTRAINT space_log_kind_check CHECK (kind IN ('space', 'guide', 'download', 'consent', 'assign'));
DELETE FROM schema_migrations WHERE name = '0028_admin_manage.sql';
