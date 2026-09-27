-- Land-XI 0003_agent — 에이전트 AG-0 (F1-CONTRACT v1.1-27 · AGENT-SPEC §3.4) · 소유 F2-E
-- 실행: postgres(소유자)로 · 멱등(IF NOT EXISTS · ON CONFLICT DO NOTHING). 0001 이후.
-- RLS: detections 와 같은 정책(tenant_id = app.tenant_id OR app.realm = 'lx'). 확인 승인·거부·권한 밖 요청은 audit_log 에도 남는다.

CREATE TABLE IF NOT EXISTS agent_runs(
  id text PRIMARY KEY,
  tenant_id text NOT NULL,                -- 기관 세션 = 그 기관 · LX = 'lx' · 영업 = 'lx-demo'
  user_id text, realm text, role text,
  mode text,                              -- map | report | ops
  intent text,                            -- 라우터 4클래스
  state text,                             -- planning | tool | waiting_confirm | writing | done | failed | rejected
  model jsonb,                            -- 실제 쓴 백엔드 {id, backend, base, fallback_from[]}
  prompt_hash text, prompt_text text,     -- PII 마스킹 뒤 원문(보존 기간 정책 3차)
  answer_md text, envelopes jsonb, unverified jsonb, citations jsonb, artifact jsonb, perf jsonb,
  tokens_in int, tokens_out int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_at ON agent_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_tool_calls(
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  i int NOT NULL, tool text NOT NULL, args jsonb, result_ref text,
  ms numeric,                             -- 서버 실측(도구 핸들러 벽시계) · 클라이언트 도구는 브라우저가 보고한 값(source 표기)
  ms_source text DEFAULT 'server',
  ok bool, error text,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agent_tool_calls_run ON agent_tool_calls (run_id, i);

CREATE TABLE IF NOT EXISTS agent_confirms(
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  tool text NOT NULL, args jsonb, quote jsonb,
  decision text,                          -- approve | reject | expired
  decided_by text, expires_at timestamptz,
  at timestamptz NOT NULL DEFAULT now());

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['agent_runs','agent_tool_calls','agent_confirms'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_runs, agent_tool_calls, agent_confirms TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE agent_tool_calls_id_seq TO landxi_app, landxi_worker;

-- 계량: usage_events(dim='llm_tokens', amount=prompt+completion, basis='measured', job_id=run_id) — 표는 0001 그대로.
-- 쿼터 시드 [추정 기반 초기값] (AGENT-SPEC §3.4 · 수치는 발주자 몫) — lx 무제한
INSERT INTO quotas(tenant_id, dim, soft, hard, policy, note) VALUES
  ('namwon', 'llm_tokens_month', 2000000, 3000000, 'queue_low', '[추정 기반 초기값] AGENT-SPEC §3.4'),
  ('namwon', 'llm_runs_day', 400, 500, 'queue_low', '[추정 기반 초기값] AGENT-SPEC §3.4'),
  ('gwangju-jeonnam', 'llm_tokens_month', 1200000, 1800000, 'queue_low', '[추정 기반 초기값] AGENT-SPEC §3.4'),
  ('lx', 'llm_tokens_month', NULL, NULL, 'notify', 'LX 무제한'),
  ('lx-demo', 'llm_tokens_month', 300000, 400000, 'reject', '[추정 기반 초기값] 영업 시연')
ON CONFLICT (tenant_id, dim) DO NOTHING;
