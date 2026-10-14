-- 0095_improve_release.sql — XI ChatGEO 정기 개선 바퀴 '내보낸다'(원칙 249 · impl-32 chatgeo-loop) · 멱등
--   한 바퀴에서 고친 것(규칙 · 예시 질문 · 새 도구)을 '판'으로 묶는다. 판 = 번호 · 전/후 점수 · 고친 질문 · 상태.
--   상태: draft(만드는 중 — 시험 질문에만 적용) → pending(승인 요청 · 통과 기준을 넘은 판만) → approved(승인 — 모든 질문에 적용 · 물었던 사람에게 '이제 됩니다')
--         | rejected(거절) | reverted(되돌림 — 판의 규칙을 끄고 새 도구를 다시 막음)
--   승인 전 판의 규칙 · 도구는 시험 질문(context.test)에만 적용된다 — '후' 점수를 재되 실제 사용자는 승인 뒤에 바뀐다.
-- 되돌리기: migrations/down/0095_improve_release.down.sql
CREATE TABLE IF NOT EXISTS improve_releases(
  id text PRIMARY KEY,                          -- rel_…
  no serial UNIQUE,                             -- 판 번호(화면 '새 판 n')
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'pending', 'approved', 'rejected', 'reverted')),
  tools text[] NOT NULL DEFAULT '{}',           -- 이 판에서 더한 도구(승인 전에는 시험 질문에만 길을 연다)
  before jsonb, after jsonb,                    -- 전/후 점수 {total, 답함, 안내함, 못 함}
  better int, worse int,                        -- 나아진 질문 수 · 나빠진 질문 수(나빠지면 승인 요청을 만들지 않는다)
  better_items text[] NOT NULL DEFAULT '{}',    -- 나아진 개선 후보(승인되면 물었던 사람에게 '이제 됩니다')
  note text,
  by text NOT NULL DEFAULT 'system',
  at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_by text, decided_at timestamptz);
ALTER TABLE improve_rules ADD COLUMN IF NOT EXISTS release_id text REFERENCES improve_releases(id) ON DELETE SET NULL;
ALTER TABLE improve_items ADD COLUMN IF NOT EXISTS release_id text REFERENCES improve_releases(id) ON DELETE SET NULL;
-- 예시 질문 붙이기(길잡이에 비슷한 예 · 모드 example): src = 예시 질문 · dst = 그 질문을 푸는 도구 호출(JSON 한 줄)
ALTER TABLE improve_rules DROP CONSTRAINT IF EXISTS improve_rules_mode_check;
ALTER TABLE improve_rules ADD CONSTRAINT improve_rules_mode_check CHECK (mode IN ('alias', 'intent', 'phrase', 'example'));

DO $$ BEGIN
  ALTER TABLE improve_releases ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS improve_releases_lx_only ON improve_releases;
  CREATE POLICY improve_releases_lx_only ON improve_releases USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON improve_releases TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE improve_releases_no_seq TO landxi_app, landxi_worker;
