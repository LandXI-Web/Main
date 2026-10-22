-- 0123_p6_imgcover.sql — 바퀴 22 P6 시계열(10-22 now21 시계열-빈조각2024 ⓐ · 시계열-접경영상없음 ⓐ) · 멱등
--   전국 분석 칸(읍면동)마다 그 해 국토지리정보원 항공 영상이 비어 있는 자리를 적는다(national/imgcover.py 가 영상 서버에 타일을 물어 본 결과).
--   kind 'none' = 그 해에도 앞 해에도 영상이 없음(접경 · 공개 제한 지역) → XI맵에 '영상 없음(공개 제한 지역)' 회색 · 숫자에서 뺌
--   kind 'fill' = 그 해만 비고 앞 해(fill_year)에는 있음 → 분석에서 앞 해 영상으로 채우고 '2024년 영상' 표기
--   면은 물어 본 점(약 196m 칸)을 녹인 것 — 낮은 줌 표시용(작음). 넓이는 그 칸 범위(target) 안 몫.
-- 되돌리기: DROP TABLE national_imgcover;
SET LOCAL lock_timeout = '10s';
CREATE TABLE IF NOT EXISTS national_imgcover(
  year       int  NOT NULL,
  cell_cd    text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('none', 'fill')),
  fill_year  int,
  km2        numeric NOT NULL DEFAULT 0,
  ratio      numeric NOT NULL DEFAULT 0,          -- 칸 범위(물어 본 점) 가운데 이 종류 몫(0–1)
  probes     int NOT NULL DEFAULT 0,
  geom       geometry(MultiPolygon, 4326),
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, cell_cd, kind)
);
CREATE INDEX IF NOT EXISTS national_imgcover_geom ON national_imgcover USING gist (geom);
GRANT SELECT ON national_imgcover TO landxi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON national_imgcover TO landxi_worker;
-- 'fill' 자리를 실제로 앞 해 영상으로 분석해 끝낸 칸(작업기가 칸 마무리 때 적음 · 그 전에는 화면에 '2024년 영상'을 쓰지 않는다)
ALTER TABLE national_imgcover ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE national_imgcover ADD COLUMN IF NOT EXISTS applied_tiles int;
-- 자산(농지 · 하천) 범위마다의 넓이(㎢) — 진행 숫자에서 뺄 몫(자산마다 범위가 다르다)
ALTER TABLE national_imgcover ADD COLUMN IF NOT EXISTS by_asset jsonb;
