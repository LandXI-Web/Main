-- 0033_round3.sql — 바퀴 3(10-11) · 멱등
--   1) 문의: 연락처를 '연락처(전화)' · '메일 주소' 두 칸으로(메인-3 · 원칙 189). 둘 중 하나 이상. 옛 contact 칸은 남기고(지난 문의) 새 문의부터 phone · email.
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE inquiries ALTER COLUMN contact DROP NOT NULL;
UPDATE inquiries SET email = contact WHERE email IS NULL AND phone IS NULL AND contact LIKE '%@%';
UPDATE inquiries SET phone = contact WHERE email IS NULL AND phone IS NULL AND contact IS NOT NULL AND contact NOT LIKE '%@%';

--   2) 자동 로그아웃 시간(QA-고침-6 · 원칙 188 · 177) — 범위마다 한 줄(scope = 'lx' 또는 기관 id). 없으면 기본 24시간(auth.SESSION_DEFAULT).
--      LX 관리자는 'lx' 만, 기관 관리자는 자기 기관 줄만 바꾼다(서버 auth._scope_of). 세션 표처럼 공용 연결로 읽는다(로그인 때 RLS 밖).
CREATE TABLE IF NOT EXISTS session_policy(
  scope text PRIMARY KEY,
  minutes int NOT NULL CHECK (minutes IN (30, 60, 120, 240, 480, 1440)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text);
GRANT SELECT, INSERT, UPDATE ON session_policy TO landxi_app, landxi_worker;
