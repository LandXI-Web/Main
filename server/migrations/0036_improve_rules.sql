-- 0036_improve_rules.sql — 개선 후보 '채택' 쉬운 것은 바로 반영(원칙 197 · 10-11 자동진화-관리 · 바퀴 4) · 멱등
--   채택에 두 갈래: ① 바로 반영 — 다른 이름 더하기(alias) · 질문 뜻 연결(intent) · 답 문구(phrase) — 코드 없이 표 한 줄 → 서버가 다음 질문부터 적용
--                   ② 개발 할 일 — 새 기능 · 새 분류(예 단동 · 연동) → 지금처럼 확인 대장 '확인 대기'(만들어지면 '이제 됩니다')
--   improve_rules  바로 반영 한 줄(어느 개선 후보에서 · 누가 · 언제 · 켜짐 · 되돌림) — LX 만 읽고 쓴다
CREATE TABLE IF NOT EXISTS improve_rules(
  id text PRIMARY KEY,                          -- ir_…
  item_id text REFERENCES improve_items(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('alias', 'intent', 'phrase')),
  src text NOT NULL,                            -- alias: 사용자가 쓴 말 · intent: 이런 질문 · phrase: 이런 질문(요지)
  dst text,                                     -- alias: 플랫폼이 쓰는 말 · intent: 이 질문으로 알아듣기
  text text,                                    -- phrase: 답에 붙일 문구 한 줄
  try text,                                     -- phrase: 누르면 보낼 질문(고르지 않아도 됨)
  active boolean NOT NULL DEFAULT true,
  test boolean NOT NULL DEFAULT false,          -- 시험으로 만든 줄(시험이 끝나면 지운다)
  by text, at timestamptz NOT NULL DEFAULT now(),
  off_by text, off_at timestamptz);
CREATE INDEX IF NOT EXISTS improve_rules_on ON improve_rules (active, mode);
ALTER TABLE improve_items ADD COLUMN IF NOT EXISTS adopt_mode text;   -- 채택 갈래: dev(개발 할 일) | alias | intent | phrase(바로 반영)

DO $$ BEGIN
  ALTER TABLE improve_rules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS improve_rules_lx_only ON improve_rules;
  CREATE POLICY improve_rules_lx_only ON improve_rules USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON improve_rules TO landxi_app, landxi_worker;

-- 원칙 195 뒤집힘 · 199(10-11 18:52) — 화면 말은 이전대로 '층'. 앞서 '레이어'로 바꾼 첫 목록 줄을 되돌린다(멱등)
UPDATE improve_items SET gist = replace(gist, '지적선 레이어 켜기', '지적선 층 켜기') WHERE gist LIKE '%지적선 레이어 켜기%';
UPDATE improve_items SET note = '이 화면에는 그 층이 없음' WHERE note = '이 화면에는 그 레이어가 없음';
UPDATE improve_items SET note = '말과 화면 다름 — 결과 층 끄기 · 이미 켜진 영상 층' WHERE note = '말과 화면 다름 — 결과 레이어 끄기 · 이미 켜진 영상 레이어';
