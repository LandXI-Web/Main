-- 0008_training.sql — r3-train(C5 LX 생산 원스톱) · 멱등
--   train_samples      화면에서 올린 학습 표본 묶음(zip → 풀어서 검사) — 표본 id(smp_…)가 학습 작업 samples 로 쓰인다
--   models.*           학습으로 생긴 모델의 이름·표본·학습 작업·회차 기록(성능 = 학습 끝 검증값 · 한 출처)
CREATE TABLE IF NOT EXISTS train_samples(
  id text PRIMARY KEY,
  task_name text NOT NULL,                 -- 업무 이름(예: 비닐하우스)
  sgg_cd text, region_name text,           -- 표본 지역(시군구) — 모델 이름에 쓴다
  org text,                                -- 표본을 만든 기관·부서(자유 글)
  dir text NOT NULL,                       -- 서버 내부 폴더(화면·응답에 내지 않는다)
  names jsonb NOT NULL,                    -- 클래스 이름 [..]
  n_images int NOT NULL DEFAULT 0, n_train int NOT NULL DEFAULT 0, n_val int NOT NULL DEFAULT 0,
  class_counts jsonb,                      -- {클래스 이름: 객체 수} — 올린 라벨 파일에서 센 값
  class_images jsonb,                      -- {클래스 이름: 그 클래스가 든 그림 수}
  excluded jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 뺀 그림(표본 안 번호)
  label_kind text,                         -- polygon | box
  status text NOT NULL DEFAULT 'ready',    -- ready | removed
  created_by text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS train_samples_created ON train_samples (created_at DESC);

ALTER TABLE models ADD COLUMN IF NOT EXISTS name jsonb;
ALTER TABLE models ADD COLUMN IF NOT EXISTS sample_id text;
ALTER TABLE models ADD COLUMN IF NOT EXISTS train_job text;
ALTER TABLE models ADD COLUMN IF NOT EXISTS train_log jsonb;       -- [{epoch, epochs, map50, precision, recall}]
ALTER TABLE models ADD COLUMN IF NOT EXISTS created_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON train_samples TO landxi_app, landxi_worker;
