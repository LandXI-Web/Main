-- 0037_ximap_edits 되돌리기 — 고치기 기록 표만 지운다. 새로 그린 객체(detections.edit_state = 'added')는 남는다 — 지우려면 먼저:
--   DELETE FROM detections WHERE edit_state = 'added';
-- 실행: postgres(소유자) 로 직접. 되돌리기 전에 result_edits 를 따로 보관할 것(학습 자료의 원천).
DROP TABLE IF EXISTS result_edits;
DELETE FROM schema_migrations WHERE name = '0037_ximap_edits.sql';
