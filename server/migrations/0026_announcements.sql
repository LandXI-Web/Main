-- 0026_announcements.sql — LX 전체 공지(확인 대장 직원-4 ⓐ '공지는 서버에 더한 뒤 실제 글로' · 원칙 128) · 멱등
--   lx_announcements  LX 관리자가 쓰고 LX 계정(직원 · 관리자 · 영업)이 읽는 공지 한 건. LX 직원 대시보드 '공지' 칸이 읽는다.
--                     지어낸 공지를 넣지 않는다(처음은 비어 있다 — 화면은 '새 공지가 없습니다').
--                     내리기는 지우지 않고 removed_at 을 찍는다(누가 언제 내렸는지 남는다).
--   (사람 한 명에게 가는 알림 lx_notices 와는 다른 표 — 그것은 프로젝트장 넘겨받음 · 저장 용량 승인 같은 개인 알림)
-- RLS: LX 영역만(기관 세션은 한 줄도 못 읽는다). 실행: postgres(소유자) — migrate.py.

CREATE TABLE IF NOT EXISTS lx_announcements(
  id text PRIMARY KEY,                               -- an_…
  title text NOT NULL,                               -- 제목 한 줄(대시보드 칸에 보인다)
  body text,                                         -- 본문(선택 · 누르면 창으로 본다)
  by text NOT NULL,                                  -- 쓴 사람(lx_users.id)
  by_name text,                                      -- 쓴 때의 이름(화면에 보인다)
  at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz, removed_by text);
CREATE INDEX IF NOT EXISTS lx_announcements_at ON lx_announcements (at DESC) WHERE removed_at IS NULL;

ALTER TABLE lx_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON lx_announcements;
CREATE POLICY lx_only ON lx_announcements USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT, UPDATE ON lx_announcements TO landxi_app, landxi_worker;
