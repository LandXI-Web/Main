-- 0034_api3 되돌리기 — 신청 · 결과 장부 표와 더한 칸만 지운다(옛 api_keys · api_calls 는 그대로). 실행: postgres(소유자) 로 직접.
-- 주의: 3차 키(gen = 3)는 tenant_id 가 비어 있을 수 있어 NOT NULL 을 되살리기 전에 지운다 — 되돌리기 전에 api_keys 를 따로 보관할 것.
DELETE FROM api_keys WHERE gen = 3;
ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_keys DROP COLUMN IF EXISTS applicant_id, DROP COLUMN IF EXISTS scope, DROP COLUMN IF EXISTS rights, DROP COLUMN IF EXISTS sources,
  DROP COLUMN IF EXISTS area_once_km2, DROP COLUMN IF EXISTS area_day_km2, DROP COLUMN IF EXISTS area_month_km2, DROP COLUMN IF EXISTS gen;
ALTER TABLE api_calls DROP COLUMN IF EXISTS applicant_id;
DROP INDEX IF EXISTS cards_api_id;
ALTER TABLE cards DROP COLUMN IF EXISTS api_id, DROP COLUMN IF EXISTS api_sources;
DROP TABLE IF EXISTS service_results;
DROP TABLE IF EXISTS api_applicants;
DELETE FROM schema_migrations WHERE name = '0034_api3.sql';
