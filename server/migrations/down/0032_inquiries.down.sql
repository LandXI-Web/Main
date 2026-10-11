-- 0032_inquiries 되돌리기 — 문의 표만 지운다(다른 표는 그대로). 실행: postgres(소유자) 로 직접.
-- 주의: 받은 문의도 함께 지워진다 — 되돌리기 전에 inquiries 를 따로 보관할 것.
DROP TABLE IF EXISTS inquiries;
DELETE FROM schema_migrations WHERE name = '0032_inquiries.sql';
