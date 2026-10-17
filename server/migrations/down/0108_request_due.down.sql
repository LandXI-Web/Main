-- 0108_request_due 되돌리기 — 희망 완료일 칸만 지운다
ALTER TABLE analysis_requests DROP COLUMN IF EXISTS due_date;
