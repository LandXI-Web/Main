-- 0031_ext_api 되돌리기 — 외부 연동 API 키 · 호출 기록 표만 지운다(다른 표는 그대로). 실행: postgres(소유자) 로 직접.
-- 주의: 호출 기록(감사)도 함께 지워진다 — 되돌리기 전에 api_calls 를 따로 보관할 것.
DROP TABLE IF EXISTS api_calls;
DROP TABLE IF EXISTS api_keys;
DELETE FROM schema_migrations WHERE name = '0031_ext_api.sql';
