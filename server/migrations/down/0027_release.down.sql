-- 0027_release 되돌리기 — 기관 공유 기록 표만 지운다(승인 요청 · 분석 작업 기록은 그대로).
-- 지운 뒤에는 기관 '서비스 선택'이 다시 배포 기록으로만 판정된다. 실행: postgres(소유자) 로 직접.
DROP TABLE IF EXISTS card_shares;
DELETE FROM schema_migrations WHERE name = '0027_release.sql';
