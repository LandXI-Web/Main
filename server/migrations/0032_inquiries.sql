-- 0032_inquiries.sql — 메인 '문의하기' 창으로 들어온 문의(10-11 메인 지시 3 · 원칙 170) · 멱등
--   inquiries  로그인 없이 보낸 문의 한 건 — 이름 · 소속 · 연락처(메일 또는 전화) · 종류(서비스 도입 · 사용 방법 · 기타) · 내용 · 개인정보 수집 동의.
--              LX 관리자만 본다(계정 → '문의' 탭). 읽음 · 답함 표시는 누가 언제 했는지 함께 남긴다. 시험으로 보낸 문의는 test = true(지우지 않는다).
--              남용 막기는 게이트웨이(같은 접속 주소 시간당 n회 · redis)가 한다 — 여기에는 접속 주소를 기록으로만 남긴다.
-- 되돌리기: migrations/down/0032_inquiries.down.sql. RLS: LX 영역만(서버가 lx 영역 연결로 넣고 읽는다).

CREATE TABLE IF NOT EXISTS inquiries(
  id text PRIMARY KEY,                               -- 'iq_' + 10 hex
  name text NOT NULL,                                -- 이름
  org text,                                          -- 소속(선택)
  contact text NOT NULL,                             -- 메일 또는 전화(답할 곳)
  kind text NOT NULL CHECK (kind IN ('intro', 'howto', 'etc')),   -- 서비스 도입 · 사용 방법 · 기타
  body text NOT NULL,                                -- 내용
  consent_at timestamptz NOT NULL,                   -- 개인정보 수집 동의 시각
  site text,                                         -- 보낸 입구(app · admin · gov · 이 PC)
  ip text,                                           -- 접속 주소(남용 확인용 기록)
  at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz, read_by text,                 -- 읽음
  answered_at timestamptz, answered_by text,         -- 답함
  test boolean NOT NULL DEFAULT false);              -- 시험 문의(목록에 '시험'으로 보인다 · 새 문의 수에서 뺀다)
CREATE INDEX IF NOT EXISTS inquiries_at ON inquiries (at DESC);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON inquiries;
CREATE POLICY lx_only ON inquiries USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT, UPDATE ON inquiries TO landxi_app, landxi_worker;
