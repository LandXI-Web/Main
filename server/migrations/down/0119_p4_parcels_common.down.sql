-- 0119 되돌리기 — (주인 칸은 0120 되돌리기가 · 보관 파일 02. 데이터/_backup/p4-20261022/parcels-owner.json.gz 를
--   server/ops/p4_restore_parcel_owner.py 가 다시 넣는다 — 이 SQL 은 정책 · 기본값 · 표만 되돌린다)
DROP POLICY IF EXISTS parcels_read ON survey_parcels;
DROP POLICY IF EXISTS parcels_write ON survey_parcels;
DROP POLICY IF EXISTS lx_tenant_isolation ON survey_parcels;
CREATE POLICY lx_tenant_isolation ON survey_parcels USING ((tenant_id = (SELECT current_setting('app.tenant_id', true))) OR ((SELECT current_setting('app.realm', true)) = 'lx'))
  WITH CHECK ((tenant_id = (SELECT current_setting('app.tenant_id', true))) OR ((SELECT current_setting('app.realm', true)) = 'lx'));
ALTER TABLE survey_parcels ALTER COLUMN tenant_id SET DEFAULT 'namwon';
CREATE INDEX IF NOT EXISTS survey_parcels_tsgg ON survey_parcels (tenant_id, sgg_cd);
DROP INDEX IF EXISTS survey_parcels_sido;
DROP TABLE IF EXISTS parcel_ai_year;
DROP FUNCTION IF EXISTS app_scope_prefixes(int);
DROP TABLE IF EXISTS tenant_regions;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_parent_not_self;
ALTER TABLE tenants DROP COLUMN IF EXISTS parent_id;
