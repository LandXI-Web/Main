-- 0113 되돌리기 — 지도 라벨링 표와 그림의 자리 칸을 지운다(이미 만든 그림 · 학습데이터 파일은 그대로).
DROP TABLE IF EXISTS label_areas;
DROP TABLE IF EXISTS label_maps;
ALTER TABLE label_images DROP COLUMN IF EXISTS area_id;
