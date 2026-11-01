-- 0137 행정 자료 종류 장부 · 큰 행정 자료 도형 칸(10-31 PM "가 기능을 추가하자." · "기타도 추가. 종류도 바로 추가하는 기능도 만들자").
--   ledger_kinds         행정 자료 종류(LX 관리자 '데이터 > 행정 자료 올리기'의 종류 고르기 한 출처). 기본 7개 + 산사태 취약지역 + 기타 = builtin(지울 수 없음).
--                        관리자가 올리는 자리에서 '+ 새 종류'로 더한 것 = builtin false · 비교 규칙 없음(저장 · 지도 · 속성 보기만) · 추가한 사람 · 시각.
--                        compare = AI 결과 비교 규칙(기관 대장 대조 L-*)이 있는 종류 — 기본 7개만.
--   ledger_imports.kind  예전 CHECK(7개 고정) → ledger_kinds 참조(FK).
--   shared_layer_feats   큰 행정 자료(나눠 올리기 · 수백 MB)의 도형 — 파일 하나(GeoJSON)로 두면 지도 · 서버 메모리가 버티지 못해 PostGIS 에 두고
--                        지도는 조각(MVT)으로 · 속성 표는 앞 줄만 읽는다. 작은 자료(20MB 이하 · 한 번에 올림)는 예전처럼 GeoJSON 파일.
-- 멱등(IF NOT EXISTS · ON CONFLICT). 되돌리기: migrations/down/0137_ledger_kinds.down.sql.

CREATE TABLE IF NOT EXISTS ledger_kinds(
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  compare boolean NOT NULL DEFAULT false,
  builtin boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 100,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS ledger_kinds_label_u ON ledger_kinds (lower(regexp_replace(label, '\s', '', 'g')));

INSERT INTO ledger_kinds(id, label, compare, builtin, sort) VALUES
  ('farm_ledger', '농지대장', true, true, 10),
  ('dev_permit', '개발행위 허가', true, true, 20),
  ('public_asset', '공유재산', true, true, 30),
  ('river_permit', '하천 점용 허가', true, true, 40),
  ('greenhouse', '시설원예 등록', true, true, 50),
  ('feedcrop', '사료작물 재배 신청', true, true, 60),
  ('direct_pay', '공익직불 신청', true, true, 70),
  ('landslide_area', '산사태 취약지역', false, true, 80),
  ('other', '기타', false, true, 999)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE ledger_imports DROP CONSTRAINT IF EXISTS ledger_imports_kind_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_imports_kind_fk') THEN
    ALTER TABLE ledger_imports ADD CONSTRAINT ledger_imports_kind_fk FOREIGN KEY (kind) REFERENCES ledger_kinds(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shared_layer_feats(
  iid text NOT NULL,                 -- ledger_imports.id
  lyr text NOT NULL DEFAULT '',      -- 파일 안 층 이름(GPKG 층 여러 개)
  fid int NOT NULL,                  -- 0부터 · 층마다 이어서
  props jsonb NOT NULL DEFAULT '{}', -- 속성(성명 · 연락처 열은 빼고)
  geom geometry(Geometry, 4326) NOT NULL,
  PRIMARY KEY (iid, fid));
CREATE INDEX IF NOT EXISTS shared_layer_feats_geom ON shared_layer_feats USING gist (geom);

GRANT SELECT, INSERT, DELETE ON ledger_kinds TO landxi_app;
GRANT SELECT, INSERT, DELETE ON shared_layer_feats TO landxi_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_worker') THEN
    GRANT SELECT ON ledger_kinds TO landxi_worker;
    GRANT SELECT, INSERT, DELETE ON shared_layer_feats TO landxi_worker;
  END IF;
END $$;
