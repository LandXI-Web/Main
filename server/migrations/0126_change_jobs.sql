-- 0126_change_jobs.sql — 변화 탐지 작업 알림(10-22 수정 지시서 v2 F3 · '백그라운드로 보내고 알림 받기') · 멱등
--   lx_notices.kind 에 'change.job' 을 더한다(끝 · 멈춤 · 시간초과 알림 — 프로젝트 목록 · LX 직원 대시보드 알림 칸).
-- 되돌리기: migrations/down/0126_change_jobs.down.sql
SET LOCAL lock_timeout = '10s';
ALTER TABLE lx_notices DROP CONSTRAINT IF EXISTS lx_notices_kind_check;
ALTER TABLE lx_notices ADD CONSTRAINT lx_notices_kind_check CHECK (kind IN ('project.lead', 'account.storage', 'change.job'));
