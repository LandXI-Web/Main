-- 0055_train_tiles 되돌리기 — 학습용 영상 조각 기록을 지운다(조각 파일은 02. 데이터/training/xi-tiles 에 남는다 · 따로 지울 것).
DROP TABLE IF EXISTS train_tiles;
ALTER TABLE retrain_runs DROP COLUMN IF EXISTS n_tiles;
DELETE FROM schema_migrations WHERE name = '0055_train_tiles.sql';
