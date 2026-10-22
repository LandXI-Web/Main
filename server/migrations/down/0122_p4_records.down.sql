-- 0122 되돌리기 — 공유 이력 · 결과-작업 연결 규칙 · 결과 크기 칸 · 해외 기관 이름 규칙을 걷는다(쌓인 이력은 표와 함께 지워진다 — 먼저 내보내 둘 것)
DROP TRIGGER IF EXISTS share_history_deploys ON deploys;
DROP TRIGGER IF EXISTS share_history_imagery ON imagery_shares;
DROP FUNCTION IF EXISTS lx_share_history_deploys();
DROP FUNCTION IF EXISTS lx_share_history_imagery();
DROP TABLE IF EXISTS share_history;
DROP TRIGGER IF EXISTS result_link_ins ON detections;
DROP TRIGGER IF EXISTS result_link_upd ON detections;
DROP TRIGGER IF EXISTS result_link_ins ON survey_parcel_ai;
DROP FUNCTION IF EXISTS lx_result_link_check();
DROP TABLE IF EXISTS result_sources;
ALTER TABLE jobs DROP COLUMN IF EXISTS result_bytes;
ALTER TABLE jobs DROP COLUMN IF EXISTS result_bytes_at;
DROP TRIGGER IF EXISTS tenant_id_rule ON tenants;
DROP FUNCTION IF EXISTS lx_tenant_id_rule();
