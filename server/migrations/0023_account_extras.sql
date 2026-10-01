-- 0023_account_extras.sql — 계정 · 프로젝트 셋(제안 S-19 · S-20 · S-21 확인 · 원칙 66 · 91 · 105 · 109 · 121) · 멱등
--   lx_settings        LX 관리자가 화면에서 바꾸는 설정 한 줄씩(지금은 storage.default_quota_gb — 따로 정하지 않은 계정의 저장 용량 할당 · 없으면 할당 없음)
--   storage_requests   저장 용량 늘리기 요청(S-19) — 원하는 할당(GB) · 이유 한 줄 → LX 관리자 승인(할당 늘어남) / 반려(사유) → 요청한 사람에게 알림.
--                      한 사람에 대기 중인 요청은 하나(부분 유일 색인).
--   lx_depts           LX 부서 목록(S-21) — 처음 목록은 server/config/lx-departments.csv(LX 누리집 조직도 · 게이트웨이가 처음 읽을 때 채움 · accounts.py
--                      dept_source 한 곳 — 나중에 사내 시스템 불러오기로 바꿔 끼운다). LX 관리자가 엑셀 · CSV 로 올리거나 하나씩 고친다.
--                      목록에 없는 부서(지역본부 아래 지사 등)는 직접 적는다. 지어낸 부서로 채우지 않는다.
--   lx_notices.kind    'account.storage'(늘리기 요청 승인 · 반려 알림)를 더한다.
--   project_notes      메모 · 파일 지우기(S-20)는 0022 의 removed_at · removed_by 를 쓴다(내용 칸은 비우고 기록 한 줄만 남긴다 — projects.py).
-- RLS: 셋 모두 LX 영역만(기관 세션은 한 줄도 못 읽는다). 부서 목록을 로그인 전 가입 신청 창이 읽는 길은 게이트웨이가 LX 영역으로 연다(accounts.py).

CREATE TABLE IF NOT EXISTS lx_settings(
  key text PRIMARY KEY,
  value jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS storage_requests(
  id text PRIMARY KEY,                               -- sq_…
  user_id text NOT NULL,                             -- 요청한 사람(lx_users.id)
  login text NOT NULL,
  from_gb numeric,                                   -- 요청할 때의 할당(그때 값 · 기록용)
  want_gb numeric NOT NULL,                          -- 원하는 할당(GB) — 승인하면 이 값이 그 사람의 할당
  why text NOT NULL,                                 -- 이유 한 줄(요청한 사람)
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected')),
  reason text,                                       -- 반려 사유(관리자)
  decided_by text, decided_name text, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS storage_requests_state ON storage_requests (state, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS storage_requests_one ON storage_requests (user_id) WHERE state = 'pending';

-- 첫 모양(이름 한 칸 · 10-01 18:52 잠깐)이면 비어 있으니 지우고 아래 모양으로(멱등)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lx_depts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lx_depts' AND column_name = 'label') THEN
    DROP TABLE lx_depts;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS lx_depts(
  label text PRIMARY KEY,                            -- 고르는 칸에 보이고 계정에 적히는 이름 — '상위 › 부서'(상위가 최상위면 부서만)
  name text NOT NULL,                                -- 부서(공백 정리 · 60자까지)
  parent text,                                       -- 상위(조직도의 바로 위 · 한 열로 올린 목록은 없음)
  unit text,                                         -- 단위(최상위 · 본부 · 실 · 처 · 센터 · 지역본부 · 기관)
  pick boolean NOT NULL DEFAULT true,                -- 고르는 칸에 내나(최상위 — 사장 · 부사장 · 감사는 조직도 뼈대일 뿐)
  pos int NOT NULL DEFAULT 0,                        -- 조직도 · 올린 순서
  by text,
  at timestamptz NOT NULL DEFAULT now());

ALTER TABLE lx_notices DROP CONSTRAINT IF EXISTS lx_notices_kind_check;
ALTER TABLE lx_notices ADD CONSTRAINT lx_notices_kind_check CHECK (kind IN ('project.lead', 'account.storage'));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lx_settings', 'storage_requests', 'lx_depts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_only ON %I USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON lx_settings, storage_requests, lx_depts TO landxi_app, landxi_worker;
