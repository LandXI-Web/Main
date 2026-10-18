-- 0112_label_work.sql — 학습데이터 구축 · 플랫폼 안 수동 라벨링(10-18 · 원칙 55 · 74 · 확인 L-1 · 라벨-1 · 질문 12 ⓐ) · 멱등
--   라벨링 묶음은 학습데이터 묶음(train_samples) 한 줄 그대로 — 올린 묶음과 같은 폴더 모양(images/labels · _dataset.yaml)이라
--   학습(POST /jobs samples)이 그대로 쓴다. 이 표는 묶음 안 그림 한 장마다 상태 · 모양 · 누가 · 언제.
--   train_samples.source  'manual' = 이 화면에서 직접 그린 묶음(비어 있음 = 올린 묶음)
--   train_samples.colors  클래스 색 [#RRGGBB ..](names 와 같은 순서 · 라벨링 화면만 씀)
--   label_images.state    todo(라벨 안 함) | done(라벨 완료 — 학습 목록에 들어감) | check(확인 필요)
--   label_images.shapes   [{c: 클래스 번호, k: 'poly'|'box', p: [[u, v], ..]}] — 그림 안 0–1 자리(위가 0)
-- 되돌리기: migrations/down/0112_label_work.down.sql
ALTER TABLE train_samples ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE train_samples ADD COLUMN IF NOT EXISTS colors jsonb;

CREATE TABLE IF NOT EXISTS label_images(
  id text PRIMARY KEY,
  sample_id text NOT NULL REFERENCES train_samples(id) ON DELETE CASCADE,
  seq int NOT NULL,
  name text NOT NULL,
  imagery_id text,
  crs text, x0 double precision, y1 double precision, size_m double precision, px int,
  state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'done', 'check')),
  shapes jsonb NOT NULL DEFAULT '[]'::jsonb,
  n_objects int NOT NULL DEFAULT 0,
  split text NOT NULL DEFAULT 'train',
  removed boolean NOT NULL DEFAULT false,
  created_by text, created_at timestamptz DEFAULT now(),
  updated_by text, updated_at timestamptz,
  done_by text, done_at timestamptz);
CREATE INDEX IF NOT EXISTS label_images_sample ON label_images (sample_id, seq);

GRANT SELECT, INSERT, UPDATE, DELETE ON label_images TO landxi_app, landxi_worker;
