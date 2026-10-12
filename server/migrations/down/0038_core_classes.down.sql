-- 0038_core_classes 되돌리기 — 클래스 목록 · 맞춤표 · 재학습 기록 표를 지운다. 결과(detections)는 글자를 그대로 두었으므로 바뀌지 않는다.
-- 실행: postgres(소유자) 로 직접. 되돌리기 전에 classes · retrain_runs 를 따로 보관할 것.
DROP TABLE IF EXISTS retrain_runs, retrain_services, sample_classes, card_classes, model_classes, class_labels;
ALTER TABLE result_edits DROP COLUMN IF EXISTS cls_before_id, DROP COLUMN IF EXISTS cls_after_id;
DROP TABLE IF EXISTS classes;
DELETE FROM lx_settings WHERE key IN ('core.retrain', 'train.templates');
DELETE FROM schema_migrations WHERE name = '0038_core_classes.sql';
