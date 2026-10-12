-- 0055_train_tiles.sql — 결정 3 ⓐ 고치면 저절로(10-12 16:18 확인) · 원칙 205 · 228 · 멱등
--   train_tiles  XI맵 그 자리 고치기로 고친 자리 둘레 한 칸(학습용 영상 조각 — 영상 + 그 안 모든 테두리) = 학습 데이터 1장.
--                칸 = 결과 묶음(set_id) 안의 정해진 격자(UTM 미터 · 한 변 = 조각 화소 × 모델 해상도) 한 칸.
--                state: waiting(마지막으로 고친 뒤 조용한 시간이 아직) · made(1장 · 영상 + 테두리 파일) · conflict(둘이 다르게 고침 → 뺌)
--                       · empty(영상 원천에서 그 자리를 못 읽음) · dropped(칸 안 고친 것을 모두 되돌림) · failed
--                영상은 그 결과를 만든 영상 원천(지리원 API 타일 · 기관 영상 등)에서 다시 잘라 쓴다 — 학습 데이터 조각만 저장(영상 파일 쌓지 않음).
--                같은 칸을 나중에 또 고치면 waiting 으로 돌아가 다시 만든다(같은 줄 · version + 1).
--   retrain_runs.n_tiles  그때 넣은 학습 데이터(장) · data_yaml 은 쓰지 않는다(화면에 경로를 내지 않음 — 작업 options 에만).
-- 되돌리기: migrations/down/0055_train_tiles.down.sql

CREATE TABLE IF NOT EXISTS train_tiles(
  id text PRIMARY KEY,                                  -- 'tt_' + 10 hex
  card_id text,                                         -- 고친 결과의 서비스(없을 수 있음)
  set_id text NOT NULL,                                 -- 결과 묶음(detections.job_id) — 화면에 내지 않는다
  model_id text, imagery_id text,
  crs text NOT NULL,                                    -- 격자 좌표계(EPSG:326xx · 327xx — 어느 나라든)
  gx int NOT NULL, gy int NOT NULL,                     -- 격자 칸 번호(왼쪽 아래 = gx·size, gy·size)
  size_m real NOT NULL, px int NOT NULL,
  bbox geometry(Polygon, 4326),
  state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'made', 'conflict', 'empty', 'dropped', 'failed')),
  why text,
  edit_ids text[] NOT NULL DEFAULT '{}',
  n_edits int NOT NULL DEFAULT 0,
  users text[] NOT NULL DEFAULT '{}',
  names jsonb,                                          -- 테두리 파일의 분류 순서(모델 머리 순서 + 새 클래스)
  n_objects int,
  img_path text, lbl_path text,
  last_edit_at timestamptz,
  made_at timestamptz,
  version int NOT NULL DEFAULT 0,
  test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS train_tiles_cell ON train_tiles (set_id, crs, gx, gy, test);
CREATE INDEX IF NOT EXISTS train_tiles_card ON train_tiles (card_id, state, made_at);

ALTER TABLE retrain_runs ADD COLUMN IF NOT EXISTS n_tiles int;

GRANT SELECT, INSERT, UPDATE, DELETE ON train_tiles TO landxi_app;
