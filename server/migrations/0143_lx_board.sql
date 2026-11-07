-- 0143_lx_board.sql — LX 게시판(11-07 PM "게시판 아이콘을 하나 클릭하면 화면을 전환해서 공지사항, QnA, 활용 사례, 자료집을 추가한다") · 멱등
--   lx_board_posts  게시판 글 한 건. 공지사항은 이미 있는 lx_announcements(0026)를 그대로 쓴다 — 이 표는 나머지 셋.
--     kind = 'qna'  : LX 직원 · LX 관리자 누구나 질문을 쓰고, LX 관리자가 답(answer)을 단다.
--            'case' : 활용 사례 — LX 관리자가 쓴다.
--            'doc'  : 자료집 — LX 관리자가 쓴다 · 파일 하나(02. 데이터/board/{id}.{확장자} · 프로젝트 파일 올리기와 같은 형식 · 크기 한도).
--   지어낸 글을 넣지 않는다(처음은 비어 있다 — 화면은 '아직 글이 없습니다'). 내리기는 지우지 않고 removed_at(지금 화면에는 내리기 단추 없음).
-- RLS: LX 영역만(기관 세션은 한 줄도 못 읽는다). 실행: postgres(소유자) — migrate.py. audit_log 는 건드리지 않는다.

CREATE TABLE IF NOT EXISTS lx_board_posts(
  id text PRIMARY KEY,                               -- bp_…
  kind text NOT NULL CHECK (kind IN ('qna','case','doc')),
  title text NOT NULL,
  body text,
  by text NOT NULL,                                  -- 쓴 사람(lx_users.id)
  by_name text,                                      -- 쓴 때의 이름(화면에 보인다)
  at timestamptz NOT NULL DEFAULT now(),
  answer text,                                       -- QnA 답(LX 관리자)
  answer_by text, answer_by_name text, answered_at timestamptz,
  file_name text, file_ext text, file_rel text, bytes bigint,   -- 자료집 파일 하나
  removed_at timestamptz, removed_by text);
CREATE INDEX IF NOT EXISTS lx_board_posts_kind_at ON lx_board_posts (kind, at DESC) WHERE removed_at IS NULL;

ALTER TABLE lx_board_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON lx_board_posts;
CREATE POLICY lx_only ON lx_board_posts USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT, UPDATE ON lx_board_posts TO landxi_app, landxi_worker;
