-- 0108_request_due.sql — 분석 요청 '희망 완료일'(10-18 제안-희망완료일 · 선택) · 멱등
ALTER TABLE analysis_requests ADD COLUMN IF NOT EXISTS due_date date;
