-- 0024 촬영 요청(확인 대장 17차 촬영-1 ⓑ(18차) · 촬영-2 ⓑ 비례 · 촬영-3 ⓐ 대략만 · 원칙 106 · 119 · 120) · 멱등
--   기관이 지도에 찍을 범위를 그리면 서버가 넓이 × 고시 금액으로 '대략 비용'을 셈하고(config/fees.yaml 한 곳 — 셈 당시 사본을 quote 에 남김),
--   LX 담당자(지금은 LX 관리자 — 담당 지정 화면은 다음 설계)가 촬영 시기 · 확정 금액 · 한 줄로 답하거나 반려(사유)한다.
--   기관은 답을 보고 '이 조건으로 진행' 또는 '취소'. 공문 · 계약은 바깥 절차. 찍은 영상은 지금 길(데이터 → 영상 등록 → 그 기관에 공유) 그대로.
CREATE TABLE IF NOT EXISTS shoot_requests(
  id text PRIMARY KEY,                         -- sh_…
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by text NOT NULL,                  -- 기관 사용자
  aoi geometry(Geometry, 4326) NOT NULL,       -- 찍을 범위(관할 안 · 서버가 확인)
  place text,                                  -- '덕과면 일대'(범위 중심의 읍면동)
  sgg_cd text,                                 -- 범위 중심이 든 시군구
  area_km2 double precision NOT NULL,
  region_type text,                            -- gun | si | gu
  quote jsonb NOT NULL,                        -- 셈 당시 사본 {notice, unit_km2, per_unit, units, amount, rounding}
  timing text,                                 -- 원하는 시기(사용자 말)
  card_id text,                                -- 찍은 뒤 바로 분석할 서비스(선택)
  memo text,
  state text NOT NULL DEFAULT 'sent' CHECK (state IN ('sent', 'answered', 'accepted', 'cancelled', 'rejected')),
  answer jsonb,                                -- {timing, amount, line, by, by_name, at} — LX 답
  reason text,                                 -- 반려 사유 · 취소 사유
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS shoot_requests_tenant ON shoot_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shoot_requests_state ON shoot_requests (state, created_at DESC);
-- 기관 분리(RLS) — 기관 세션은 자기 기관 것만 · LX 세션(realm lx)은 모두(받는 쪽 = LX 관리자). 게이트웨이는 지금 LX 연결로 읽고 쓰며 기관을 직접 거른다.
ALTER TABLE shoot_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shoot_isolation ON shoot_requests;
CREATE POLICY shoot_isolation ON shoot_requests USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx');
GRANT SELECT, INSERT, UPDATE, DELETE ON shoot_requests TO landxi_app, landxi_worker;
