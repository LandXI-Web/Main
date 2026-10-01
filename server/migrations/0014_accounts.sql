-- 0014 계정 — 가입 신청 · 비밀번호 재설정 요청 · 임시 비밀번호(들어오면 반드시 바꾸기) · 잠금 (구현 2차 T5)
-- 근거: 확인 대장 FR-4(계정을 관리자 화면에서 — 확인) · D4-ⓑ(기관 사용자 가입 신청 + 승인 — 확인) · 원칙 72(LX 관리자는 다 보고 돕는다) · 원칙 77(아이디 = 메일 주소)
-- 멱등(IF NOT EXISTS) — migrate.py 가 바뀐 파일만 다시 적용한다. 옛 계정 행은 지우거나 바꾸지 않는다(새 칸은 기본값만).

-- 계정 표 두 개(LX · 기관)에 칸 넷: 부서(글자 — 부서 만들기 체계는 확인 대기) · 반드시 바꾸기 · 임시 비밀번호를 준 때 · 만든 때
ALTER TABLE lx_users     ADD COLUMN IF NOT EXISTS dept text;
ALTER TABLE lx_users     ADD COLUMN IF NOT EXISTS must_change boolean NOT NULL DEFAULT false;
ALTER TABLE lx_users     ADD COLUMN IF NOT EXISTS temp_pw_at timestamptz;
ALTER TABLE lx_users     ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS dept text;
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS must_change boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS temp_pw_at timestamptz;
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
-- 비밀번호를 5번 틀리면 10분 잠금(개인정보의 안전성 확보조치 기준 제5조 — 일정 횟수 틀리면 접근 제한) · 관리자가 계정 화면에서 풀 수 있다
ALTER TABLE lx_users     ADD COLUMN IF NOT EXISTS lock_until timestamptz;
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS lock_until timestamptz;

-- 가입 신청 — 승인되면 계정 표로 옮기고(비밀번호 해시도 그때 옮긴 뒤 여기서는 지움), 반려는 사유와 함께 남긴다(30일 뒤 지움)
CREATE TABLE IF NOT EXISTS signup_requests(
  id text PRIMARY KEY,
  realm text NOT NULL CHECK (realm IN ('lx','tenant')),
  tenant_id text REFERENCES tenants(id),
  login text NOT NULL,                       -- 메일 주소(소문자)
  name text NOT NULL,
  dept text,
  pw_hash text,                              -- argon2 — 승인·반려 뒤에는 NULL
  consent_at timestamptz NOT NULL,           -- 개인정보 수집·이용 동의 시각
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected')),
  reason text,                               -- 반려 사유(필수)
  user_id text,                              -- 승인으로 만든 계정
  decided_by text, decided_realm text, decided_name text, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((realm = 'lx') = (tenant_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS signup_requests_pending_one ON signup_requests (realm, coalesce(tenant_id, ''), lower(login)) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS signup_requests_state_at ON signup_requests (state, created_at DESC);

-- 비밀번호 재설정 요청 — 관리자가 확인한 뒤 임시 비밀번호를 만든다(issued) · 반려는 사유 필수. 임시 비밀번호 자체는 어디에도 남기지 않는다
CREATE TABLE IF NOT EXISTS reset_requests(
  id text PRIMARY KEY,
  realm text NOT NULL CHECK (realm IN ('lx','tenant')),
  tenant_id text REFERENCES tenants(id),
  user_id text NOT NULL,
  login text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','issued','rejected')),
  reason text,
  decided_by text, decided_realm text, decided_name text, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((realm = 'lx') = (tenant_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS reset_requests_pending_one ON reset_requests (realm, user_id) WHERE state = 'pending';
CREATE INDEX IF NOT EXISTS reset_requests_state_at ON reset_requests (state, created_at DESC);

-- 실패한 로그인 — 아이디(적은 그대로) · 시각 · 입구 · 접속 주소 · 까닭. 비밀번호 값은 어떤 형태로도 남기지 않는다
CREATE TABLE IF NOT EXISTS login_failures(
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  realm text, tenant_id text, login text, user_id text,
  site text, ip text,
  reason text);                              -- password(틀림) · unknown(없는 아이디) · temp_locked(잠시 잠김) · locked(잠긴 계정) · temp_expired(임시 비밀번호 기간 지남)
CREATE INDEX IF NOT EXISTS login_failures_at ON login_failures (at DESC);
CREATE INDEX IF NOT EXISTS login_failures_tenant_at ON login_failures (tenant_id, at DESC);

-- 최근 로그인 · 계정 기록(누가 승인·반려·재설정했는지)을 빨리 읽게
CREATE INDEX IF NOT EXISTS audit_log_action_actor ON audit_log (action, actor, at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON signup_requests, reset_requests, login_failures TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE login_failures_id_seq TO landxi_app, landxi_worker;
