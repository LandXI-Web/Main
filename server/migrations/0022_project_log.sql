-- 0022_project_log.sql — 프로젝트 기록 · 메모 · 파일 · 프로젝트장 넘기기 알림 · 내 정보(구현 5차 · 확인 17차 P-4 ⓐ · P-5 ⓐ · 원칙 105 · 121) · 멱등
--   project_notes  프로젝트의 메모 한 줄 · 올린 파일(작은 문서 · 그림) — 구성원 · 프로젝트장 · LX 관리자만 본다(기관은 안 봄 · 서버 projects.py)
--                  파일 자체는 02. 데이터/projects/{프로젝트}/files/ 에 두고(프로젝트 저장 폴더) 크기는 bytes 로 적어 프로젝트 저장 공간에 더한다.
--                  지우지 않는다(removed_* 는 나중에 '지움' 표시를 붙일 자리).
--   lx_notices     LX 계정 한 사람에게 가는 알림 한 줄(지금은 프로젝트장 넘겨받음) — 본 때(seen_at)가 찍히면 더는 보이지 않는다
--   lx_users.contact           내 정보의 연락처(선택 · 본인이 고친다 — 기관 사용자 연락처 0021 tenant_users.contact 와 같은 이름)
--   lx_users.storage_quota_gb  나에게 할당된 저장 용량(GB) — 할당 · 요청 · 승인 화면은 확인 전이라 비어 있다(NULL = 할당 없음 · 지어내지 않는다)
-- RLS: 두 표 모두 LX 영역만(기관 세션은 한 줄도 못 읽는다). 실행: postgres(소유자) — migrate.py.

CREATE TABLE IF NOT EXISTS project_notes(
  id text PRIMARY KEY,                               -- pn_…
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('memo', 'file')),
  body text,                                         -- 메모 한 줄(파일이면 같이 남긴 한 줄 · 없을 수 있음)
  file_name text,                                    -- 올린 사람이 붙인 파일 이름(화면에 보인다)
  file_ext text,                                     -- 형식(소문자 확장자)
  file_rel text,                                     -- 02. 데이터 아래 상대 위치(화면 · 응답에 내지 않는다)
  bytes bigint,                                      -- 파일 크기 — 프로젝트 저장 공간 · 내 저장 용량에 더한다
  by text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz, removed_by text);
CREATE INDEX IF NOT EXISTS project_notes_pid ON project_notes (project_id, at DESC);

CREATE TABLE IF NOT EXISTS lx_notices(
  id text PRIMARY KEY,                               -- nt_…
  user_id text NOT NULL,                             -- 받는 사람(lx_users.id)
  kind text NOT NULL CHECK (kind IN ('project.lead')),
  project_id text REFERENCES projects(id) ON DELETE CASCADE,
  text text NOT NULL,                                -- 보이는 한 줄
  note text,                                         -- 넘긴 사람이 남긴 메모(선택)
  by text,
  at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz);
CREATE INDEX IF NOT EXISTS lx_notices_user ON lx_notices (user_id, seen_at);

ALTER TABLE lx_users ADD COLUMN IF NOT EXISTS contact text;
ALTER TABLE lx_users ADD COLUMN IF NOT EXISTS storage_quota_gb numeric;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['project_notes', 'lx_notices'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_only ON %I USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON project_notes, lx_notices TO landxi_app, landxi_worker;
