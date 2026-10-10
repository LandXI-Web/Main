-- 0028_admin_manage.sql — LX 관리자 관리 기능(now 페이지 답 10-10 · 질문 16 ⓐ · 질문 17 ⓑ · 나중 13 ⓐ · 16 · 19) · 멱등
--   analysis_requests  + queue_order(관리자가 정한 순번 · 작을수록 먼저) · urgent(급함 — 맨 앞 · 분석 작업 우선순위 0) · held_reason(보류 사유)
--                      상태에 'held'(보류) 추가 — 승인 요청 줄(approvals)은 그대로 대기라 보류를 풀면(다시 확인 대기) 바로 승인 · 거절할 수 있다.
--                      담당 = 지금 있는 lead_user 칸(비면 'LX 관리자가 봄') — 관리자가 바꾼다.
--   tenant_service_staff  기관 × 서비스의 LX 헬프데스크 담당(검토 요청 · 분석 요청 받는 사람) — 비면 지금처럼(서비스 담당 → LX 관리자)
--   tenant_shoot_staff    기관이 보내는 촬영 요청 담당(관리자 직접 | 직원 지정)
--   card_shares        + sgg text[](광역 기관에 공유할 때 고른 소속 시군구 — NULL = 관할 전체)
--   tenant_dept_scope  광역 기관 부서별 관할(기관 관리자가 정함) — 부서 사용자 계정의 관할 = 그 부서의 시군구(없으면 기관 관할 전체)
--   space_log.kind     + 'version'(공유받은 서비스의 새 판 알림 — 배포 신청 메모의 '달라진 점 한 줄')
-- 되돌리기: migrations/down/0028_admin_manage.down.sql. RLS: 새 표는 LX 영역만(기관 세션 값은 서버가 lx 영역 연결로 읽고 걸러 준다).

ALTER TABLE analysis_requests ADD COLUMN IF NOT EXISTS queue_order int;
ALTER TABLE analysis_requests ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;
ALTER TABLE analysis_requests ADD COLUMN IF NOT EXISTS held_reason text;

CREATE TABLE IF NOT EXISTS tenant_service_staff(
  tenant_id text NOT NULL,
  card_id text NOT NULL,
  user_id text,                                      -- lx_users.id · NULL = 미지정(관리자가 받음)
  by text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, card_id));

CREATE TABLE IF NOT EXISTS tenant_shoot_staff(
  tenant_id text PRIMARY KEY,
  user_id text,                                      -- NULL = 관리자 직접
  by text,
  at timestamptz NOT NULL DEFAULT now());

ALTER TABLE card_shares ADD COLUMN IF NOT EXISTS sgg text[];

CREATE TABLE IF NOT EXISTS tenant_dept_scope(
  tenant_id text NOT NULL,
  dept text NOT NULL,                                -- tenant_users.dept 와 같은 글
  sgg text[],                                        -- NULL = 기관 관할 전체(도 부서)
  by text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, dept));

DO $$ BEGIN
  ALTER TABLE space_log DROP CONSTRAINT IF EXISTS space_log_kind_check;
  ALTER TABLE space_log ADD CONSTRAINT space_log_kind_check CHECK (kind IN ('space', 'guide', 'download', 'consent', 'assign', 'version'));
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_service_staff', 'tenant_shoot_staff'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_only ON %I', t);
    EXECUTE format('CREATE POLICY lx_only ON %I USING (current_setting(''app.realm'', true) = ''lx'') WITH CHECK (current_setting(''app.realm'', true) = ''lx'')', t);
  END LOOP;
END $$;
-- tenant_dept_scope 는 RLS 없이 — 세션을 풀 때(auth.resolve · 영역 설정 전) 부서 관할을 읽는다. 시군구 코드만 들어 있고 쓰기는 서버(기관 관리자 확인 뒤)만.
ALTER TABLE tenant_dept_scope DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON tenant_dept_scope;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_service_staff, tenant_shoot_staff, tenant_dept_scope TO landxi_app, landxi_worker;
