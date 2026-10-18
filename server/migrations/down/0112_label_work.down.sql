-- 0112 되돌리기 — 라벨링 그림 표와 묶음의 두 칸을 지운다(이미 만든 학습데이터 묶음 · 파일은 그대로).
DROP TABLE IF EXISTS label_images;
ALTER TABLE train_samples DROP COLUMN IF EXISTS colors;
ALTER TABLE train_samples DROP COLUMN IF EXISTS source;
