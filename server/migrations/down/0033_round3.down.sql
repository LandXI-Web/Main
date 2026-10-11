-- 0033_round3 되돌리기 — 자동 로그아웃 설정 표를 지우고 문의 두 칸을 뺀다. 실행: postgres(소유자) 로 직접.
-- 주의: 문의 전화 · 메일 칸 값은 contact 로 되돌려 둔다(지우기 전).
DROP TABLE IF EXISTS session_policy;
UPDATE inquiries SET contact = coalesce(contact, email, phone);
ALTER TABLE inquiries DROP COLUMN IF EXISTS phone;
ALTER TABLE inquiries DROP COLUMN IF EXISTS email;
DELETE FROM schema_migrations WHERE name = '0033_round3.sql';
