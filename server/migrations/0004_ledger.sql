-- Land-XI 0004_ledger — F3 최종 명세 §3 서버 변경(S-2 대장 반입·융합 · S-5 영상 등록 · S-6 카드 확장 · S-7 배포 확장 · S-9 결재함).
-- 멱등(IF NOT EXISTS · DROP POLICY IF EXISTS). 실행: postgres(소유자). migrate.py 가 0004_f2b 다음(이름순)으로 적용한다.
-- 원칙: 대장은 LX 가 소유하지 않는다 — 반입 행은 기관 tenant_id 로 RLS 격리 · 성명 열 저장 0(allowlist 열만 payload 에).

-- ── S-2 대장 반입 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_imports(
  id text PRIMARY KEY,                       -- imp_{ulid}
  tenant_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('farm_ledger','dev_permit','public_asset','river_permit','greenhouse')),
  filename text, fmt text, bytes bigint,
  rows int DEFAULT 0,                        -- 반입 행(구조 필드)
  columns jsonb,                             -- 원본 열 이름(allowlist 통과분 + 버린 열 이름 목록)
  columns_guess jsonb,                       -- {원본열: role} 자동 인식
  dropped jsonb,                             -- 버린 열(성명·연락처 등) 이름만
  mapping jsonb,                             -- 확인된 {role: 원본열}
  state text NOT NULL DEFAULT 'uploaded' CHECK (state IN ('uploaded','matching','matched','failed')),
  stats jsonb,                               -- {matched, by_step{pnu,jibun,vworld}, unmatched}
  latest bool NOT NULL DEFAULT false,
  created_by text, created_at timestamptz DEFAULT now(), confirmed_at timestamptz, error text);
CREATE INDEX IF NOT EXISTS ledger_imports_t ON ledger_imports (tenant_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS registry_snapshots(
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  import_id text,                            -- F3 §3 '열 1개 추가'(반입 묶음)
  kind text NOT NULL,
  pnu text,
  match_step text,                           -- pnu | jibun | geom | vworld | none
  row_no int,
  payload jsonb,                             -- allowlist 열만(role 키 · 원본 값)
  reason text,                               -- 미매칭 사유 한 줄
  at timestamptz DEFAULT now());
ALTER TABLE registry_snapshots ADD COLUMN IF NOT EXISTS import_id text;
ALTER TABLE registry_snapshots DROP CONSTRAINT IF EXISTS registry_snapshots_match_step_check;
ALTER TABLE registry_snapshots ADD CONSTRAINT registry_snapshots_match_step_check CHECK (match_step IN ('pnu','jibun','geom','vworld','none'));
CREATE INDEX IF NOT EXISTS registry_snapshots_imp ON registry_snapshots (import_id, pnu);
CREATE INDEX IF NOT EXISTS registry_snapshots_pnu ON registry_snapshots (tenant_id, pnu);

-- 판정·조치(상태 확장) — survey_findings 에 판정 칸 · 이벤트에 같은 칸
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS verdict text;          -- match | violation | match_fp | unclear
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS verdict_code text;     -- 기관 코드(자유)
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE survey_findings ADD COLUMN IF NOT EXISTS import_id text;        -- L-* 규칙이 만든 행의 대장 묶음
ALTER TABLE survey_finding_events ADD COLUMN IF NOT EXISTS verdict text;
ALTER TABLE survey_finding_events ADD COLUMN IF NOT EXISTS verdict_code text;
ALTER TABLE survey_finding_events ADD COLUMN IF NOT EXISTS note text;

CREATE TABLE IF NOT EXISTS survey_actions(
  id text PRIMARY KEY, tenant_id text NOT NULL, finding_id text, pnu text,
  kind text NOT NULL,                        -- notice | correction | revisit | referral | other
  note text, due date, state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','done','cancelled')),
  by text, at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS survey_actions_f ON survey_actions (tenant_id, finding_id);

-- 규칙 활성화(결재) · 규칙 버전
ALTER TABLE survey_rules ADD COLUMN IF NOT EXISTS state text DEFAULT 'active';
ALTER TABLE survey_rules ADD COLUMN IF NOT EXISTS version int DEFAULT 1;
ALTER TABLE survey_rules ADD COLUMN IF NOT EXISTS pending jsonb;          -- 활성화 대기 중인 임계(결재 전)

-- ── S-9 결재함 — 기존 approvals 에 상태 칸(요청 = pending · 결정 = approve/reject) ──────────
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS state text;                -- pending | decided
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS decided_at timestamptz;
UPDATE approvals SET state='decided' WHERE state IS NULL AND decision IS NOT NULL;

-- ── S-5 영상 등록 ─────────────────────────────────────────────────────────
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS sgg_cd text;
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS registered_by text;
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS registered_at timestamptz;
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS tile_job_id text;

-- ── S-6 카드 확장 ─────────────────────────────────────────────────────────
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ledger_schema jsonb;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS intro jsonb;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS crop_url text;

-- ── S-7 배포 확장 ─────────────────────────────────────────────────────────
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS sgg_cd text;
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS ci jsonb;
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS test bool DEFAULT false;     -- pytest 가 만든 배포본(공개·관제 목록 제외)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS test bool DEFAULT false;        -- pytest 작업(관제 제외)

-- ── RLS ──────────────────────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_imports','registry_snapshots','survey_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx')$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_imports, registry_snapshots, survey_actions TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE registry_snapshots_id_seq TO landxi_app, landxi_worker;

-- ── 3차 화면 보고서 요청(lx-review · gov-report) ──────────────────────────────
ALTER TABLE survey_actions ADD COLUMN IF NOT EXISTS law text;             -- 근거 조문(예: 농지법 제42조)
ALTER TABLE survey_rules ADD COLUMN IF NOT EXISTS reviewed bool DEFAULT false;   -- '검수 전' 꼬리표 뗌(결재 승인)
ALTER TABLE survey_rules ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
-- LX 표본 검수 판정 — 기관 필지 상태를 바꾸지 않는 영구 기록(필지당 마지막 판정이 정밀도 표본)
CREATE TABLE IF NOT EXISTS finding_verdicts(
  id bigserial PRIMARY KEY, realm text NOT NULL, tenant_id text, finding_id text NOT NULL, rule text,
  verdict text NOT NULL CHECK (verdict IN ('match','match_fp','unclear')), verdict_code text, note text, by text,
  at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS finding_verdicts_r ON finding_verdicts (rule, realm, finding_id, at DESC);
ALTER TABLE finding_verdicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON finding_verdicts;
CREATE POLICY lx_tenant_isolation ON finding_verdicts USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK ((SELECT current_setting('app.realm', true)) = 'lx');
GRANT SELECT, INSERT ON finding_verdicts TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE finding_verdicts_id_seq TO landxi_app, landxi_worker;
