-- 0126 되돌리기 — 'change.job' 알림 줄을 지우고 종류 제약을 되돌린다
DELETE FROM lx_notices WHERE kind='change.job';
ALTER TABLE lx_notices DROP CONSTRAINT IF EXISTS lx_notices_kind_check;
ALTER TABLE lx_notices ADD CONSTRAINT lx_notices_kind_check CHECK (kind IN ('project.lead', 'account.storage'));
