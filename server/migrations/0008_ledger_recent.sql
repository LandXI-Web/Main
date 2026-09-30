-- r3-fusion(2026-09-30) · 사람별 · 기관별 최근 대장 — 새로 고침 · 재로그인 · 새 창에서 자기 대장을 다시 연다.
-- (tenant, user, sgg, kind) → 최근 반입(import_id). sgg_cd '*' = 시군구와 무관한 그 사람의 가장 최근 대장.
-- 올리기(confirm) · 결합 끝에 적는다. 기관 최근 대장(다른 담당자 것)은 ledger_imports.latest 를 그대로 쓴다.
-- 멱등(IF NOT EXISTS · DROP POLICY IF EXISTS). 실행: postgres(소유자) — migrate.py 가 이름순으로 적용.
CREATE TABLE IF NOT EXISTS ledger_recent(
  tenant_id text NOT NULL,
  user_id   text NOT NULL,
  sgg_cd    text NOT NULL DEFAULT '*',
  kind      text NOT NULL DEFAULT 'farm_ledger',
  import_id text NOT NULL,
  at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, sgg_cd, kind));
CREATE INDEX IF NOT EXISTS ledger_recent_user ON ledger_recent (tenant_id, user_id, at DESC);

ALTER TABLE ledger_recent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_tenant_isolation ON ledger_recent;
CREATE POLICY lx_tenant_isolation ON ledger_recent USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx')
  WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx');
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_recent TO landxi_app, landxi_worker;

-- 지금까지 올린 대장으로 한 번 채운다(각 사람의 가장 최근 결합 반입 · 시군구 무관 '*' 와 결합 시군구별)
INSERT INTO ledger_recent(tenant_id, user_id, sgg_cd, kind, import_id, at)
SELECT DISTINCT ON (tenant_id, created_by, kind) tenant_id, created_by, '*', kind, id, coalesce(confirmed_at, created_at)
  FROM ledger_imports WHERE state='matched' AND created_by IS NOT NULL
  ORDER BY tenant_id, created_by, kind, created_at DESC
ON CONFLICT DO NOTHING;
INSERT INTO ledger_recent(tenant_id, user_id, sgg_cd, kind, import_id, at)
SELECT DISTINCT ON (i.tenant_id, i.created_by, s.sgg, i.kind) i.tenant_id, i.created_by, s.sgg, i.kind, i.id, coalesce(i.confirmed_at, i.created_at)
  FROM ledger_imports i, LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(i.stats->'sgg') = 'array' THEN i.stats->'sgg' ELSE '[]'::jsonb END) s(sgg)
 WHERE i.state='matched' AND i.created_by IS NOT NULL
 ORDER BY i.tenant_id, i.created_by, s.sgg, i.kind, i.created_at DESC
ON CONFLICT DO NOTHING;
