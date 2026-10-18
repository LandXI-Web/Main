-- 0113_label_map.sql — 학습데이터 구축 · 지도 위에서 라벨링(10-18 사용자 "왼쪽에 실제 지도에 라벨링 하는 영상이 보여야" · 원칙 55 · 74 · 223) · 멱등
--   지도에서 그린 모양은 영상마다 한 줄(경위도 · 영상 원래 자리). '라벨 완료'는 넓이 단위 — 그 자리를 덮는 512 화소 그림(label_images)을
--   서버가 영상 원래 해상도로 잘라 만들고, 그 안의 모양을 다각형 라벨로 넣는다 → 그림 보기가 저장하는 것과 같은 학습데이터 묶음(한 길).
--   label_maps.shapes   [{c: 클래스 번호, k: 'poly'|'box', g: [[경도, 위도], ..]}]
--   label_areas         라벨 완료한 자리(영상 UTM 격자에 맞춘 사각형 · ring = 경위도 테두리)
--   label_images.area_id 지도에서 라벨 완료한 자리에서 만든 그림(그림 보기에서는 보기만 · 고치기는 지도에서)
-- 되돌리기: migrations/down/0113_label_map.down.sql
CREATE TABLE IF NOT EXISTS label_maps(
  sample_id text NOT NULL REFERENCES train_samples(id) ON DELETE CASCADE,
  imagery_id text NOT NULL,
  shapes jsonb NOT NULL DEFAULT '[]'::jsonb,
  n_objects int NOT NULL DEFAULT 0,
  updated_by text, updated_at timestamptz,
  PRIMARY KEY (sample_id, imagery_id));

CREATE TABLE IF NOT EXISTS label_areas(
  id text PRIMARY KEY,
  sample_id text NOT NULL REFERENCES train_samples(id) ON DELETE CASCADE,
  imagery_id text NOT NULL,
  crs text NOT NULL, x0 double precision, y0 double precision, x1 double precision, y1 double precision,
  ring jsonb,
  n_images int NOT NULL DEFAULT 0,
  removed boolean NOT NULL DEFAULT false,
  done_by text, done_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS label_areas_sample ON label_areas (sample_id, imagery_id);

ALTER TABLE label_images ADD COLUMN IF NOT EXISTS area_id text;

GRANT SELECT, INSERT, UPDATE, DELETE ON label_maps, label_areas TO landxi_app, landxi_worker;
