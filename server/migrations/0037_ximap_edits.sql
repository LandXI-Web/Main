-- 0037_ximap_edits.sql — XI맵 그 자리 고치기 기록(원칙 182 · 191 · 196 · 설계 17차 data-tables 1-1 · 바퀴 5) · 멱등
--   result_edits  XI맵에서 AI 결과 객체를 고친 한 번 = 한 줄. 지우지 않고 쌓는다(학습 자료의 원천 · 원래 모양 보존).
--                 action: delete(지우기) · reclass(분류 바꾸기) · reshape(모양 고치기) · add(새로 그리기) · memo(메모).
--                 geom_before / cls_before / state_before = 고치기 전(되돌리기 · 학습 비교에 씀) · geom_after / cls_after = 고친 뒤.
--                 누가(by) · 언제(at) · 어느 결과(set_id = detections.job_id · det_id · fid) · 영상(imagery_id) · 모델 판(model_id · card_id · card_version).
--                 되돌리면 undone_by · undone_at 만 채운다(줄은 남는다). 시험 고치기는 test = true(학습 자료에서 뺀다).
--   detections.edit_state 에 'added'(새로 그린 객체)가 더해진다 — 표 정의는 그대로(제약 없음).
-- 되돌리기: migrations/down/0037_ximap_edits.down.sql. RLS: 결과 주인 기관 또는 LX 영역(detections 와 같은 규칙).

CREATE TABLE IF NOT EXISTS result_edits(
  id text PRIMARY KEY,                               -- 'ed_' + 12 hex
  tenant_id text NOT NULL,                           -- 결과의 주인(detections.tenant_id)
  set_id text NOT NULL,                              -- detections.job_id(작업 번호 또는 결과 묶음 이름) — 화면에 내지 않는다
  det_id bigint,                                     -- detections.id(새로 그리기면 새 줄)
  fid text,
  action text NOT NULL CHECK (action IN ('delete', 'reclass', 'reshape', 'add', 'memo')),
  cls_before text, cls_after text,
  state_before text,
  geom_before geometry(MultiPolygon, 4326),
  geom_after geometry(MultiPolygon, 4326),
  conf_before real,
  memo text,
  model_id text, card_id text, card_version text,
  imagery_id text,
  sgg_cd text,
  source text NOT NULL DEFAULT 'ximap',              -- ximap · result_check · gov_report(뒤에 이어 붙음)
  by_user text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  undone_by text, undone_at timestamptz,
  test boolean NOT NULL DEFAULT false);
CREATE INDEX IF NOT EXISTS result_edits_set ON result_edits (set_id, fid);
CREATE INDEX IF NOT EXISTS result_edits_card ON result_edits (card_id, at DESC) WHERE undone_at IS NULL;

ALTER TABLE result_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON result_edits;
CREATE POLICY lx_tenant_isolation ON result_edits
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT, UPDATE ON result_edits TO landxi_app;
