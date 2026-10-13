-- 0065_lx_memos.sql — LX 직원 대시보드 '메모'(나만 보는 짧은 글 · 고정 · 날짜) · 원칙 201 · 226(10-11 · 10-12) · 멱등
--   lx_memos  LX 계정 한 사람이 쓰고 그 사람만 읽는 메모 한 줄. 대시보드 아래 한 줄(공지 · 메모 · 전국 AI 현황)의 '메모' 칸이 읽는다.
-- 되돌리기: migrations/down/0065_lx_memos.down.sql
CREATE TABLE IF NOT EXISTS lx_memos(
  id text PRIMARY KEY,                               -- mm_…
  user_id text NOT NULL,                             -- 쓴 사람(lx_users.id) — 그 사람만 본다
  body text NOT NULL,                                -- 글 한 줄(200자)
  pinned boolean NOT NULL DEFAULT false,             -- 고정 = 위
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS lx_memos_user ON lx_memos (user_id, pinned DESC, at DESC);

ALTER TABLE lx_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON lx_memos;
CREATE POLICY lx_only ON lx_memos USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT, UPDATE, DELETE ON lx_memos TO landxi_app;
