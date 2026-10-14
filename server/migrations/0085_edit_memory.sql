-- 0085_edit_memory.sql — 지운 자리 기억(원칙 243 · 10-14 "응 그렇게 해줘") · 멱등
--   고친 기록(result_edits)은 결과 묶음 번호(set_id) · 객체 번호(fid)에 붙어 있어, 다시 추론(새 작업)하면 지운 것이 다시 나타났다.
--   이제 고친 자리를 모양(geom_before · geom_after) · 분류(cls_before · cls_after) · 영상 연도(year)로도 기억하고,
--   같은 분석서비스(또는 같은 분류)의 새 결과가 나오면 겹치는 새 객체에 저절로 적용한다(server/landxi_api/edit_memory.py).
--   result_edits.year         고친 결과를 만든 영상의 연도(imagery.year · 없으면 epoch 앞 네 자리). 새 결과의 영상 연도와 다르면 저절로 적용하지 않고 '다시 확인'.
--   result_edits.from_edit    저절로 적용한 줄(source = 'memory')이 따른 원래 고친 줄. 저절로 적용한 줄을 사람이 되돌리면 그 원래 줄은 더 따르지 않는다.
--   result_edits.project_id   전국 결과 고치기의 학습 데이터가 갈 프로젝트(전국 분석 모델을 학습한 프로젝트 — 서비스 카드가 없는 결과).
--   edit_rechecks             영상 연도가 달라 저절로 적용하지 않은 자리 = '다시 확인'(그 자리 고치기 칸의 '이전에 지운 자리').
--   edit_memory_runs          새 결과 한 묶음마다 한 줄 — 기억한 자리 수 · 저절로 적용 · 다시 확인 · 지운 자리 중 다시 잡은 곳(배포 신청 · XI 재학습 줄의 셈).
--   train_tiles.project_id    전국 결과 칸(학습 데이터 1장)이 갈 프로젝트.
-- 되돌리기: migrations/down/0085_edit_memory.down.sql. RLS: result_edits 와 같은 규칙(LX 영역 또는 결과 주인 기관).

ALTER TABLE result_edits ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE result_edits ADD COLUMN IF NOT EXISTS from_edit text;
ALTER TABLE result_edits ADD COLUMN IF NOT EXISTS project_id text;

UPDATE result_edits e SET year = coalesce(i.year, CASE WHEN i.epoch ~ '^[0-9]{4}' THEN left(i.epoch, 4)::int END)
  FROM imagery i WHERE e.year IS NULL AND i.id = e.imagery_id;

-- 업무(서비스) · 지역 · 연도별로 살아 있는 고친 자리를 찾는 색인 + 자리(모양) 색인
CREATE INDEX IF NOT EXISTS result_edits_memory ON result_edits (card_id, sgg_cd, year) WHERE undone_at IS NULL AND action <> 'memo';
CREATE INDEX IF NOT EXISTS result_edits_place ON result_edits USING gist ((coalesce(geom_before, geom_after))) WHERE undone_at IS NULL AND action <> 'memo';
CREATE INDEX IF NOT EXISTS result_edits_from ON result_edits (from_edit) WHERE from_edit IS NOT NULL;

CREATE TABLE IF NOT EXISTS edit_rechecks(
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  set_id text NOT NULL,                       -- 새 결과 묶음(detections.job_id)
  det_id bigint, fid text,                    -- 새 결과의 그 자리 객체
  from_edit text NOT NULL,                    -- 원래 고친 줄(result_edits.id)
  action text NOT NULL,                       -- 원래 고친 것(delete · reclass · reshape)
  year_edit int, year_now int,                -- 고친 영상 연도 · 새 결과 영상 연도
  test boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS edit_rechecks_one ON edit_rechecks (set_id, fid, from_edit);

CREATE TABLE IF NOT EXISTS edit_memory_runs(
  job_id text PRIMARY KEY,                    -- 새 결과 묶음
  model_id text, card_id text, year int,
  places int NOT NULL DEFAULT 0,              -- 이 결과 범위 안 기억한 자리(같은 서비스 또는 같은 분류)
  applied int NOT NULL DEFAULT 0,             -- 저절로 적용한 고치기 줄
  recheck int NOT NULL DEFAULT 0,             -- 영상 연도가 달라 '다시 확인'으로 둔 자리
  del_places int NOT NULL DEFAULT 0,          -- 그중 지운 자리(같은 연도)
  del_again int NOT NULL DEFAULT 0,           -- 지운 자리 가운데 새 결과가 다시 잡은 곳
  test boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS edit_memory_runs_model ON edit_memory_runs (model_id) WHERE NOT test;

ALTER TABLE train_tiles ADD COLUMN IF NOT EXISTS project_id text;

ALTER TABLE edit_rechecks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON edit_rechecks;
CREATE POLICY lx_tenant_isolation ON edit_rechecks
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT, UPDATE, DELETE ON edit_rechecks, edit_memory_runs TO landxi_app, landxi_worker;
GRANT SELECT, INSERT, UPDATE ON result_edits TO landxi_worker;
GRANT SELECT ON class_labels TO landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE edit_rechecks_id_seq TO landxi_app, landxi_worker;
GRANT UPDATE (counts) ON national_cells TO landxi_app;
