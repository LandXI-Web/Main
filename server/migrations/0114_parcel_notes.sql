-- 0114_parcel_notes.sql — 서비스 필지 메모(10-21 원칙 300 · 영농-3 · 영농-4) · 멱등
--   parcel_notes  서비스 필지 목록의 필지마다 메모 칸 하나(10-21 영농-D1 ⓐ — 기관 화면에만 · 담당 · 상태 · 날짜 칸 없음).
--                 지금 메모 = 그 필지의 가장 최근 줄. 고쳐 쓰면 새 줄이 쌓이고 필지 이력에 보인다.
--                 여러 필지에 같은 메모를 한 번에 적으면 같은 batch_id 로 필지마다 한 줄씩.
--   왜 새 표인가: 실태조사 필지 기록(survey_findings)은 규칙(R1–R6)이 걸린 필지에만 있다 — 영농 서비스 결과 필지 대부분(남원 예: 2,077필지 중 232필지만)은
--   기록 줄이 없어 메모를 달 곳이 없다. 실태조사 필지 메모(survey_finding_events)는 그대로 두고, 필지 이력에서 둘을 함께 보인다.
-- RLS: 기관 세션은 자기 기관 줄만 · LX 는 전부(0019 space_isolation 과 같은 식). audit_log 는 건드리지 않는다(쓰기는 deps.audit 로 한 줄 더할 뿐).
-- 되돌리기: migrations/down/0114_parcel_notes.down.sql
CREATE TABLE IF NOT EXISTS parcel_notes(
  id text PRIMARY KEY,                               -- pn_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_id text NOT NULL,                             -- 그 서비스(카드)
  pnu text NOT NULL,                                 -- 19자리 필지 번호
  note text NOT NULL,                                -- 메모(200자)
  batch_id text,                                     -- 여러 필지 한 번에 적은 묶음
  by_user text NOT NULL,                             -- tenant_users.id
  at timestamptz NOT NULL DEFAULT now());
ALTER TABLE parcel_notes DROP COLUMN IF EXISTS planned_for;          -- 처음 판(같은 날)에 있던 날짜 칸 — 메모 칸 하나로 정함(영농-D1 ⓐ)
ALTER TABLE parcel_notes ALTER COLUMN note SET NOT NULL;
CREATE INDEX IF NOT EXISTS parcel_notes_card_pnu ON parcel_notes (tenant_id, card_id, pnu, at DESC);
CREATE INDEX IF NOT EXISTS parcel_notes_pnu ON parcel_notes (tenant_id, pnu, at DESC);

ALTER TABLE parcel_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_isolation ON parcel_notes;
CREATE POLICY space_isolation ON parcel_notes
  USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT ON parcel_notes TO landxi_app;
