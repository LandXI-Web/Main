-- 0038_core_classes.sql — 핵심 코어 고리(원칙 205 · 213 · 217 · 10-12 12:45 확인) · 멱등
--   classes        클래스 한 곳(목록). 모델 · 서비스 판 · 결과 · 학습 데이터 묶음 · 고친 기록이 같은 id 를 가리킨다.
--                  kind: object(새 물체) · detail(세부 — parent_id 가 위 클래스). status: proposed(승인 대기) · approved · merged · rejected.
--                  LX 직원이 XI맵 그 자리 고치기에서 더하면 proposed → LX 관리자가 데이터하우스에서 승인 · 합치기 · 거절(결정 1 ⓐ).
--   class_labels   글자 → 클래스 id 맞춤표 하나. 결과(detections.cls) · 모델 머리 이름(models.classes) · 학습 데이터 묶음(train_samples.names)은
--                  글자를 그대로 두고(결과 130만 줄을 다시 쓰지 않는다 — 숫자 그대로) 이 표로 같은 id 에 닿는다.
--   model_classes  모델 머리 순서 → 클래스 id · card_classes  서비스 판이 찾는 클래스(finds) · 배우는 중(learning) · 나누기(split)
--   sample_classes 학습 데이터 묶음 → 클래스 id
--   result_edits   + cls_before_id · cls_after_id (고친 기록 → 클래스 id)
--   retrain_services 서비스별 재학습 방식(auto 쉬는 시간 자동 · manual 수동 — 결정 4 ⓐ · 원칙 213)
--   retrain_runs   재학습 스케줄러가 대기열에 넣은(또는 넣으려다 미룬) 기록 — 세부는 split(나누기), 그대로는 same
-- 설정(lx_settings): core.retrain(방식 기본 · 쉬는 시간대 · 주말 · 기준) · train.templates(학습 서식 — 업무별 기본 흐름)
-- 되돌리기: migrations/down/0038_core_classes.down.sql

CREATE TABLE IF NOT EXISTS classes(
  id text PRIMARY KEY,                                  -- 'cl_' + 영문 · 새로 더한 것은 'cl_' + 10 hex
  name text NOT NULL,                                   -- 화면 이름(하나뿐)
  aliases text[] NOT NULL DEFAULT '{}',                 -- 다른 이름(모델 머리 이름 · 영문)
  parent_id text REFERENCES classes(id),
  kind text NOT NULL DEFAULT 'object' CHECK (kind IN ('object', 'detail')),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('proposed', 'approved', 'merged', 'rejected')),
  merged_into text REFERENCES classes(id),
  card_id text,                                         -- 더한 자리의 서비스(있으면)
  created_by text, created_at timestamptz NOT NULL DEFAULT now(), created_from text,
  decided_by text, decided_at timestamptz, decide_note text,
  test boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX IF NOT EXISTS classes_live_name ON classes (lower(name)) WHERE status IN ('proposed', 'approved');

CREATE TABLE IF NOT EXISTS class_labels(
  label text PRIMARY KEY,
  class_id text NOT NULL REFERENCES classes(id));

CREATE TABLE IF NOT EXISTS model_classes(
  model_id text NOT NULL, idx int NOT NULL, label text NOT NULL, class_id text REFERENCES classes(id),
  PRIMARY KEY (model_id, idx));

CREATE TABLE IF NOT EXISTS card_classes(
  card_id text NOT NULL, version text NOT NULL, class_id text NOT NULL REFERENCES classes(id),
  state text NOT NULL DEFAULT 'finds' CHECK (state IN ('finds', 'learning')),
  how text NOT NULL DEFAULT 'head' CHECK (how IN ('head', 'split')),
  PRIMARY KEY (card_id, version, class_id));

CREATE TABLE IF NOT EXISTS sample_classes(
  sample_id text NOT NULL, class_id text NOT NULL REFERENCES classes(id),
  PRIMARY KEY (sample_id, class_id));

ALTER TABLE result_edits ADD COLUMN IF NOT EXISTS cls_before_id text;
ALTER TABLE result_edits ADD COLUMN IF NOT EXISTS cls_after_id text;
CREATE INDEX IF NOT EXISTS result_edits_cls ON result_edits (cls_after_id) WHERE undone_at IS NULL;

CREATE TABLE IF NOT EXISTS retrain_services(
  card_id text PRIMARY KEY,
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'manual')),
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS retrain_runs(
  id text PRIMARY KEY,                                  -- 'rt_' + 10 hex
  card_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('same', 'split')),
  class_id text,                                        -- split 이면 나누는 위 클래스
  n_units int NOT NULL,                                 -- 그때 센 새 학습 데이터(지금 규칙 = 고친 것 건수)
  units_until timestamptz NOT NULL,                     -- 이 시각까지의 고친 것
  job_id text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'held', 'dry')),
  why text,
  by_user text NOT NULL DEFAULT 'auto',
  at timestamptz NOT NULL DEFAULT now(),
  test boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS retrain_runs_card ON retrain_runs (card_id, at DESC);

-- ── 씨앗: 지금 다섯 곳에 글자로 흩어진 클래스(10-12 서버에서 센 것) ──
INSERT INTO classes(id, name, aliases, kind) VALUES
  ('cl_building', '건물', '{building}', 'object'),
  ('cl_parking', '주차장', '{parking}', 'object'),
  ('cl_farmland', '경작지', '{farmland}', 'object'),
  ('cl_greenhouse', '비닐하우스', '{greenhouse}', 'object'),
  ('cl_vehicle', '차량', '{vehicle}', 'object'),
  ('cl_nonfarm', '비경작지', '{}', 'object'),
  ('cl_silage', '곤포사일리지', '{}', 'object'),
  ('cl_irg', 'IRG', '{}', 'object'),
  ('cl_sudangrass', '수단그라스', '{}', 'object'),
  ('cl_corn', '옥수수', '{}', 'object'),
  ('cl_rye', '호밀', '{}', 'object'),
  ('cl_styrofoam', '스티로폼', '{Styrofoam}', 'object'),
  ('cl_veg_gain', '식생 증가', '{veg_gain}', 'object'),
  ('cl_veg_loss', '식생 감소', '{veg_loss}', 'object'),
  ('cl_built_gain', '건물 증가', '{built_gain}', 'object'),
  ('cl_built_loss', '건물 감소', '{built_loss}', 'object'),
  ('cl_built_new', '새 건물', '{built_new}', 'object'),
  ('cl_other', '기타', '{other}', 'object')
ON CONFLICT (id) DO NOTHING;
INSERT INTO classes(id, name, aliases, parent_id, kind) VALUES
  ('cl_greenhouse_single', '단동 비닐하우스', '{비닐하우스_단동,greenhouse_single}', 'cl_greenhouse', 'detail'),
  ('cl_greenhouse_multi', '다동 비닐하우스', '{비닐하우스_다동,greenhouse_multi}', 'cl_greenhouse', 'detail')
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_labels(label, class_id)
  SELECT name, id FROM classes WHERE status = 'approved'
  UNION SELECT unnest(aliases), id FROM classes WHERE status = 'approved'
ON CONFLICT (label) DO NOTHING;

INSERT INTO model_classes(model_id, idx, label, class_id)
  SELECT m.id, t.i - 1, t.label, l.class_id FROM models m CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(m.classes) = 'array' THEN m.classes ELSE '[]'::jsonb END) WITH ORDINALITY AS t(label, i)
  LEFT JOIN class_labels l ON l.label = t.label
ON CONFLICT (model_id, idx) DO NOTHING;

-- 서비스 판: 찾는 것(modules.classes)이 있으면 그것, 없으면 그 판 모델의 클래스
INSERT INTO card_classes(card_id, version, class_id, state, how)
  SELECT DISTINCT v.card_id, v.version, l.class_id, 'finds', 'head' FROM card_versions v
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(v.modules -> 'classes') = 'array' THEN v.modules -> 'classes' ELSE '[]'::jsonb END) AS c(label)
  JOIN class_labels l ON l.label = c.label
ON CONFLICT DO NOTHING;
INSERT INTO card_classes(card_id, version, class_id, state, how)
  SELECT DISTINCT v.card_id, v.version, mc.class_id, 'finds', 'head' FROM card_versions v
  CROSS JOIN LATERAL unnest(v.model_ids) AS mid(model_id)
  JOIN model_classes mc ON mc.model_id = mid.model_id AND mc.class_id IS NOT NULL
  WHERE coalesce(jsonb_typeof(v.modules -> 'classes'), '') <> 'array' OR jsonb_array_length(v.modules -> 'classes') = 0
ON CONFLICT DO NOTHING;

INSERT INTO sample_classes(sample_id, class_id)
  SELECT DISTINCT s.id, l.class_id FROM train_samples s CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.names) = 'array' THEN s.names ELSE '[]'::jsonb END) AS n(label) JOIN class_labels l ON l.label = n.label
ON CONFLICT DO NOTHING;

UPDATE result_edits e SET cls_before_id = l.class_id FROM class_labels l WHERE e.cls_before_id IS NULL AND e.cls_before = l.label;
UPDATE result_edits e SET cls_after_id = l.class_id FROM class_labels l WHERE e.cls_after_id IS NULL AND e.cls_after = l.label;

INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES
  ('core.retrain', '{"mode": "auto", "quiet_start": "22:00", "quiet_end": "06:00", "weekend": true, "min_new": 200}', 'migration', now())
ON CONFLICT (key) DO NOTHING;
INSERT INTO lx_settings(key, value, updated_by, updated_at) VALUES
  ('train.templates', '{"기본": {"blocks": ["data", "base", "cfg", "train", "eval", "deploy"], "cfg": {"epochs": 3, "imgsz": 640, "batch": 4}}}', 'migration', now())
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON classes, class_labels, model_classes, card_classes, sample_classes, retrain_services, retrain_runs TO landxi_app;
GRANT DELETE ON class_labels, card_classes, retrain_runs, classes TO landxi_app;
