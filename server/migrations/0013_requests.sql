-- 0013_requests.sql — 기관 영상 분석 의뢰 · LX 영상 공유 · 올린 영상(확인 대장 6차 GF-2 · 5차 역할-4 ⓑ · 1차 FR-1 · 원칙 39·49·60·66) · 멱등
--   analysis_requests  기관이 낸 분석 의뢰 한 건 — 결재(approvals kind 'request') → 분석 작업(jobs) → 그 서비스의 새 시점
--   request_uploads    기관이 올린 영상 파일(조각 올리기 · 이어 올리기) — 빠른 지문 · 전체 지문으로 같은 파일 두 번 올리기를 막는다
--   imagery_shares     LX 영상을 어느 기관에 열어 줄지(관리자가 기관마다 켜고 끔) — 기관은 공유된 영상만 지도에서 보고 의뢰에 불러온다
CREATE TABLE IF NOT EXISTS analysis_requests(
  id text PRIMARY KEY,                        -- rq_…
  tenant_id text NOT NULL,
  requested_by text,                          -- 기관 사용자
  deploy_id text NOT NULL,                    -- 어느 서비스로(그 기관에 켜진 서비스 = 배포본)
  source text NOT NULL,                       -- shared(LX 가 공유한 영상) | upload(기관이 올린 영상)
  imagery_id text,                            -- shared = LX 영상 · upload = 승인 뒤 분석 동안만 등록하는 의뢰 영상
  draft_id text,                              -- upload = 올린 파일 묶음
  meta jsonb,                                 -- 파일에서 읽은 값(해상도 · 촬영일 · 범위 이름 · 좌표계 · 면적) · 예상 시간 · 결과 요약
  aoi geometry(Geometry, 4326),               -- 분석 범위(영상 범위 ∩ 관할)
  memo text,
  state text NOT NULL DEFAULT 'pending',      -- pending | approved | analyzing | done | rejected | failed
  approval_id text,
  reason text,                                -- 반려 사유 · 분석하지 못한 이유(사용자 말)
  job_id text,
  result_set text,
  lead_user text,                             -- 담당 프로젝트장(그 서비스 공개를 요청한 LX 직원 · 없으면 NULL) — 알림 칸이 쓴다
  decided_by text, decided_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS analysis_requests_tenant ON analysis_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analysis_requests_deploy ON analysis_requests (deploy_id, state);

CREATE TABLE IF NOT EXISTS request_uploads(
  id text PRIMARY KEY,                        -- ru_…
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  draft_id text NOT NULL,
  filename text NOT NULL,
  size bigint NOT NULL,
  quick_fp text,                              -- 빠른 지문(크기 + 앞 · 뒤 1MB) — 올리기 전에 같은 파일을 알아본다
  sha256 text,                                -- 다 받은 뒤 전체 지문
  state text NOT NULL DEFAULT 'uploading',    -- uploading | done | cancelled | removed
  rel_path text,                              -- 02. 데이터 아래 상대 경로(화면 · 응답에 내지 않는다)
  request_id text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), done_at timestamptz);
CREATE INDEX IF NOT EXISTS request_uploads_draft ON request_uploads (draft_id);
CREATE INDEX IF NOT EXISTS request_uploads_fp ON request_uploads (tenant_id, size, quick_fp);
CREATE INDEX IF NOT EXISTS request_uploads_sha ON request_uploads (tenant_id, sha256);

CREATE TABLE IF NOT EXISTS imagery_shares(
  tenant_id text NOT NULL,
  imagery_id text NOT NULL,
  shared_by text,
  shared_at timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, imagery_id));

-- 계정 범위 밖 0(원칙 39) — 기관 세션은 자기 기관 행만 읽는다(게이트웨이는 realm lx 로 쓰고 기관 조건을 직접 건다 · 이 정책은 한 겹 더)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['analysis_requests', 'request_uploads', 'imagery_shares'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = t::regclass AND polname = 'lx_tenant_isolation') THEN
      EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON analysis_requests, request_uploads, imagery_shares TO landxi_app, landxi_worker;
