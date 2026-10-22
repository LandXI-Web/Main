-- 0116_service_groups.sql — 행정서비스 묶음(10-22 원칙 310 · FARM-ADMIN-DESIGN §2-1 · IMPL 1-1) · 멱등
--   "영농관리 행정서비스 큰 틀 아래에 서비스 들이 여러개 있고. 이게 통합 대시보드와 통계 등 농업정책에 필요한 기능이 고려되어야 한다."
--   service_groups  기관마다 행정서비스 묶음(영농관리 · 하천관리 · 산림관리 …) — 이름 · 업무 분야(domain: farm · river · forest …) · 정책 칸 정의(policy_tiles) · 순서.
--                   정책 칸(통합 대시보드)의 숫자는 서버 집계에서만(값이 없으면 null + 이유 — 지어내지 않음). 칸 정의는 묶음 데이터(화면 고정값 0).
--   group_cards     묶음 ↔ 분석서비스(카드) · 순서. 기관에 공유되지 않은 카드는 서버가 내보내지 않는다(묶음에 적혀 있어도 그 기관 화면에는 없음).
--   LX 관리자가 '기관에 공유'할 때 묶음을 고른다(deploys.group_id — 없으면 새 묶음). 지금은 시드 두 벌(남원 영농관리 · 전남광주 해양·하천 환경관리)로 시작.
-- RLS: 기관 세션은 자기 기관 줄만 · LX 는 전부(0019 space_isolation 과 같은 식).
-- 되돌리기: migrations/down/0116_service_groups.down.sql
CREATE TABLE IF NOT EXISTS service_groups(
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id text NOT NULL,                                  -- 묶음 이름표(화면 주소 ?group= · 글자에는 나오지 않음)
  name text NOT NULL,                                -- 화면 이름(예: 영농관리)
  domain text NOT NULL DEFAULT 'farm',               -- 업무 분야 — 정책 칸 기본 정의를 고른다(farm · river · forest …)
  descr text,                                        -- 한 줄 설명(없으면 묶음 카드에 설명 줄 없음)
  policy_tiles jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 통합 대시보드 칸 정의(비면 domain 기본)
  "order" int NOT NULL DEFAULT 0,
  by_user text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id));
CREATE TABLE IF NOT EXISTS group_cards(
  tenant_id text NOT NULL,
  group_id text NOT NULL,
  card_id text NOT NULL,                             -- cards.id
  "order" int NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, group_id, card_id),
  FOREIGN KEY (tenant_id, group_id) REFERENCES service_groups(tenant_id, id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS group_cards_card ON group_cards (tenant_id, card_id);
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS group_id text;   -- 기관에 공유할 때 고른 묶음(없으면 묶음 없는 서비스)

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['service_groups', 'group_cards'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS space_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY space_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
END $$;
GRANT SELECT ON service_groups, group_cards TO landxi_app, landxi_worker;
GRANT INSERT, UPDATE, DELETE ON service_groups, group_cards TO landxi_app;

-- 시드(서버 데이터 — 화면 고정값 0). 이미 있으면 건드리지 않는다(관리자가 바꾼 것을 다시 덮지 않게).
INSERT INTO service_groups(tenant_id, id, name, domain, descr, "order")
SELECT 'namwon', 'farm', '영농관리', 'farm', '영농 분석서비스 · 통계 · 행정정보를 한곳에서', 0
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 'namwon') ON CONFLICT DO NOTHING;
INSERT INTO group_cards(tenant_id, group_id, card_id, "order")
SELECT 'namwon', 'farm', c.id, c.o FROM (VALUES ('card-farm', 0), ('card-5e85a9', 1), ('card-d8fc01', 2)) AS c(id, o)
WHERE EXISTS (SELECT 1 FROM service_groups WHERE tenant_id = 'namwon' AND id = 'farm') ON CONFLICT DO NOTHING;
INSERT INTO service_groups(tenant_id, id, name, domain, descr, "order")
SELECT 'gwangju-jeonnam', 'river', '해양·하천 환경관리', 'river', '환경 분석서비스 · 통계 · 행정정보를 한곳에서', 0
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 'gwangju-jeonnam') ON CONFLICT DO NOTHING;
INSERT INTO group_cards(tenant_id, group_id, card_id, "order")
SELECT 'gwangju-jeonnam', 'river', 'card-marine', 0
WHERE EXISTS (SELECT 1 FROM service_groups WHERE tenant_id = 'gwangju-jeonnam' AND id = 'river') ON CONFLICT DO NOTHING;
