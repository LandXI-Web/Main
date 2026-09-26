-- Land-XI 0001_init — F1-CONTRACT §6 정본 스키마 (PostgreSQL 16 + PostGIS 3.4)
-- 실행: postgres(소유자)로. 앱 역할 landxi_app 은 RLS 를 우회하지 않는다(NOBYPASSRLS · 테이블 소유자 아님).
-- 멱등: 여러 번 돌려도 된다(IF NOT EXISTS · DO 블록).

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_app') THEN
    CREATE ROLE landxi_app LOGIN PASSWORD 'landxi-dev-app' NOSUPERUSER NOBYPASSRLS;
  END IF;
  -- 워커(시스템 작업 · 신뢰 프로세스): COPY detections 는 RLS 표에 허용되지 않으므로 BYPASSRLS 역할로 쓴다.
  -- 게이트웨이(사용자 요청 경로)는 landxi_app 만 쓴다 — 기관 격리는 여기서 SQL 수준으로 보장된다.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'landxi_worker') THEN
    CREATE ROLE landxi_worker LOGIN PASSWORD 'landxi-dev-worker' NOSUPERUSER BYPASSRLS;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants(
  id text PRIMARY KEY, name jsonb NOT NULL,
  kind text CHECK (kind IN ('maker','user')), scope text CHECK (scope IN ('local','global')),
  crs text, locale text, profile_id text, status text DEFAULT 'active');

CREATE TABLE IF NOT EXISTS lx_users(
  id text PRIMARY KEY, login text UNIQUE NOT NULL, pw_hash text NOT NULL,
  role text CHECK (role IN ('admin','staff','sales')), status text DEFAULT 'active', name text);

CREATE TABLE IF NOT EXISTS tenant_users(
  id text PRIMARY KEY, tenant_id text REFERENCES tenants(id), login text NOT NULL, pw_hash text NOT NULL,
  role text CHECK (role IN ('manager','viewer')), status text DEFAULT 'active', name text,
  UNIQUE (tenant_id, login));

CREATE TABLE IF NOT EXISTS sessions(
  token_hash text PRIMARY KEY, realm text NOT NULL, user_id text NOT NULL, tenant_id text, role text NOT NULL,
  expires_at timestamptz NOT NULL);

CREATE TABLE IF NOT EXISTS quotas(
  tenant_id text REFERENCES tenants(id), dim text, soft numeric, hard numeric,
  policy text CHECK (policy IN ('queue_low','reject','notify')), note text,
  PRIMARY KEY (tenant_id, dim));

CREATE TABLE IF NOT EXISTS usage_events(
  id bigserial, tenant_id text NOT NULL, dim text NOT NULL, amount numeric NOT NULL, job_id text, basis text,
  at timestamptz NOT NULL DEFAULT now()) PARTITION BY RANGE (at);
DO $$ DECLARE m date := date '2026-09-01'; BEGIN
  WHILE m < date '2028-01-01' LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS usage_events_%s PARTITION OF usage_events FOR VALUES FROM (%L) TO (%L)',
                   to_char(m, 'YYYYMM'), m, (m + interval '1 month')::date);
    m := (m + interval '1 month')::date;
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS usage_events_default PARTITION OF usage_events DEFAULT;
CREATE INDEX IF NOT EXISTS usage_events_tenant_at ON usage_events (tenant_id, dim, at);

CREATE TABLE IF NOT EXISTS imagery(
  id text PRIMARY KEY, name jsonb, tier text, gsd_m numeric, epoch text, crs text,
  footprint geometry(MultiPolygon,4326), path_internal text, pmtiles_set text, xyz_folder text,
  license text, attribution text, export_policy text CHECK (export_policy IN ('never','tenant','public')),
  security_review text DEFAULT 'pending', rights_holder text, asset_ref text, ladder jsonb,
  kind text DEFAULT 'ortho', layer jsonb);

CREATE TABLE IF NOT EXISTS models(
  id text PRIMARY KEY, family text, version text, weights_uri text, sha256 text,
  task text CHECK (task IN ('seg','obb','det','index')), classes jsonb, input jsonb, gsd_trained_m numeric,
  metrics jsonb, perf jsonb, status text, image text, tile_size int, infer_shape int[], card_url text, adapter text);

CREATE TABLE IF NOT EXISTS cards(
  id text PRIMARY KEY, name jsonb, scope text, domain text, kind text, status_history text, portable bool);

CREATE TABLE IF NOT EXISTS card_versions(
  id text PRIMARY KEY, card_id text REFERENCES cards(id), version text, model_ids text[], modules jsonb,
  changelog text, approved_by text, approved_at timestamptz);

CREATE TABLE IF NOT EXISTS deploys(
  id text PRIMARY KEY, name text, tenant_id text REFERENCES tenants(id), card_id text REFERENCES cards(id),
  card_version_id text REFERENCES card_versions(id), prev_card_version_id text, region_profile text, region_name jsonb,
  aoi geometry(MultiPolygon,4326),
  stage text CHECK (stage IN ('draft','shadow','canary','ga','rolled_back')), pinned bool DEFAULT false, gpu_pool text,
  from_deploy_id text, modules jsonb, model_override text, snapshot_current text, snapshot_prev text,
  year int, status_history text, scale jsonb, basis text DEFAULT 'history',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS approvals(
  id text PRIMARY KEY, subject_type text, subject_id text, requested_by text, decided_by text, decision text,
  reason text, at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS jobs(
  id text PRIMARY KEY, tenant_id text REFERENCES tenants(id), submitted_by text, kind text, state text, priority int,
  demo bool DEFAULT false, pool text, model_id text REFERENCES models(id), imagery_id text REFERENCES imagery(id),
  deploy_id text, card_id text, aoi geometry(Polygon,4326), options jsonb,
  shards_total int DEFAULT 0, shards_done int DEFAULT 0, shards_failed int DEFAULT 0, counts jsonb DEFAULT '{}'::jsonb,
  gpu_s numeric DEFAULT 0, workers text[] DEFAULT '{}', result_set text, snapshot_ready bool DEFAULT false,
  created_at timestamptz DEFAULT now(), started_at timestamptz, finished_at timestamptz, error text, label text);
CREATE INDEX IF NOT EXISTS jobs_state ON jobs (state, created_at);

CREATE TABLE IF NOT EXISTS detections(
  id bigserial, tenant_id text NOT NULL, job_id text NOT NULL, shard_id text, cls text, cls_en text, cid int, conf real,
  area_m2 numeric, geom geometry(MultiPolygon,4326), pnu text, emd text, emd_cd text,
  edited_by text, edit_state text DEFAULT 'raw', chip_edge bool) PARTITION BY LIST (tenant_id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['lx','namwon','gwangju-jeonnam','kgz-agri','kgz-land','lx-demo'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF detections FOR VALUES IN (%L)', 'detections_' || replace(t, '-', '_'), t);
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS detections_default PARTITION OF detections DEFAULT;
-- 계약 §6 에 더한 열(결과 문서 '계약 변경 요청' B-2): 원 산출물 ID(NW23-000000 · r003c007-4)를 Feature.id 로 보존
ALTER TABLE detections ADD COLUMN IF NOT EXISTS fid text;
CREATE INDEX IF NOT EXISTS detections_fid ON detections (job_id, fid);
CREATE INDEX IF NOT EXISTS detections_job ON detections (job_id, shard_id);
CREATE INDEX IF NOT EXISTS detections_geom ON detections USING gist (geom);

CREATE TABLE IF NOT EXISTS index_results(
  id bigserial PRIMARY KEY, tenant_id text, job_id text, shard_id text, key text, metrics jsonb, geom geometry,
  at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS feedback(
  id text PRIMARY KEY, tenant_id text, job_id text, set_id text, fid text, pnu text, lnglat geometry(Point,4326),
  kind text, note text, state text DEFAULT 'open', at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS nodes(
  id text PRIMARY KEY, hostname text, role text, gpus jsonb, pool text, joined_at timestamptz, last_seen timestamptz,
  state text, note text);

CREATE TABLE IF NOT EXISTS ops_alerts(
  id text PRIMARY KEY, rule text, level text, node text, gpu int, value jsonb, opened_at timestamptz, closed_at timestamptz);

CREATE TABLE IF NOT EXISTS audit_log(
  id bigserial PRIMARY KEY, actor text, realm text, action text, subject text, before jsonb, after jsonb,
  at timestamptz DEFAULT now());

-- ── RLS (F1-CONTRACT §6 · 설계서 §5.6 ②) ─────────────────────────────────────────────
-- USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['detections','jobs','feedback','usage_events','deploys'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    IF t = 'deploys' THEN
      -- 읽기만 격리(쓰기는 lx admin 라우트만 · realm=lx)
      EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
      EXECUTE format('DROP POLICY IF EXISTS lx_write ON %I', t);
      EXECUTE format($p$CREATE POLICY lx_write ON %I FOR ALL USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx')$p$, t);
    ELSE
      EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO landxi_app, landxi_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO landxi_app, landxi_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO landxi_app, landxi_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO landxi_app, landxi_worker;
