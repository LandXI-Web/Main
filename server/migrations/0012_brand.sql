-- Land-XI 0012_brand — 기관 분기 플랫폼 브랜드(구현 2차 T3 · 확인 대장 6차 GF-1 · GF-3 · GF-5 ⓐ · 원칙 48 · 64)
-- 기관마다 같은 틀, 다른 내용: 마크 · 플랫폼 이름 · 기관색(진한 1 + 연한 1) · 메인 소개 글(머리 · 설명 · 서비스 소개) · 문의처 · 메인 서비스 목록.
-- 서버가 정본. 고치는 사람 = 그 기관의 관리자(tenant_users.role = manager) + LX 관리자 — landxi_api/brand.py 가 확인하고, 아래 RLS 가 한 번 더 막는다.
-- 마크 그림 파일은 기관 폴더(LX_DATA_ROOT/tenants/{기관}/brand/)에 두고 이 표에는 파일 이름만 적는다.
-- 서비스 목록(services)은 LX 관리자가 정한다(원칙 67 — 기관 만들기와 그 기관의 서비스는 LX 관리자). 비어 있으면 그 기관 배포 기록에서 읽는다.
-- 멱등: 여러 번 돌려도 된다. 씨앗 값은 없는 행에만 넣는다(관리자가 고친 값을 덮지 않는다).

CREATE TABLE IF NOT EXISTS tenant_brand(
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  platform text,                    -- 플랫폼 이름(예: 남원시 GeoVision 플랫폼)
  short text,                       -- 약칭(예: 남원시) — 메인 머리에서 기관색으로 강조
  mark_text text,                   -- 글자 마크(두 줄은 줄바꿈으로) — 그림 마크가 없을 때
  mark_file text,                   -- 그림 마크 파일 이름(mark-<해시>.png) — 기관 폴더 안
  accent text,                      -- 기관색 진한 색(#RRGGBB) — 흰 바탕 대비 4.5 이상
  tint text,                        -- 기관색 연한 바탕(#RRGGBB)
  contact text,                     -- 대표 문의처
  intro jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {headline, lines[], items{card: 한 줄}}
  services text[],                  -- 메인 · 서비스 선택에 보일 서비스(카드) 순서
  updated_at timestamptz DEFAULT now(),
  updated_by text);

ALTER TABLE tenant_brand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_read ON tenant_brand;
CREATE POLICY brand_read ON tenant_brand FOR SELECT USING (true);     -- 로그인 전 메인이 읽는다(공개 정보만 담는다)
DROP POLICY IF EXISTS brand_write ON tenant_brand;
CREATE POLICY brand_write ON tenant_brand FOR ALL
  USING (current_setting('app.realm', true) = 'lx' OR tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.realm', true) = 'lx' OR tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_brand TO landxi_app, landxi_worker;

-- 씨앗 — 옛 포털 자산(landxi/assets/data/brand.js)의 기관 CI 한 벌과 실제 사업(원칙 53 · 5차 체계-2 ⓑ)
INSERT INTO tenant_brand(tenant_id, platform, short, mark_text, accent, tint, contact, intro, services, updated_by)
SELECT 'namwon', '남원시 GeoVision 플랫폼', '남원시', E'남원\nGV', '#1F6F4A', '#E9F3ED', '063-620-6114',
  jsonb_build_object(
    'headline', E'드론·항공 영상을 AI로 분석해\n남원시 행정 업무를 돕습니다',
    'lines', jsonb_build_array('우리 시가 받는 AI 분석 서비스를 한곳에서 확인합니다.', '분석 결과 확인부터 보고서 작성까지 지원합니다.'),
    'items', jsonb_build_object(
      'card-living', '방치쓰레기 · 불법소각장 · 방치폐가',
      'card-farm', '농지이용 경작·비경작 · 비닐하우스 · 사료작물',
      'card-road', '포트홀 · 도로시설 파손',
      'card-crowd', '교통혼잡 · 인파혼잡')),
  ARRAY['card-living', 'card-farm', 'card-road', 'card-crowd'], 'system:0012'
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 'namwon')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_brand(tenant_id, platform, short, mark_text, accent, tint, contact, intro, services, updated_by)
SELECT 'gwangju-jeonnam', '전남광주 AI 플랫폼', '광주전남', E'光全\nAI', '#0B5FA5', '#E6EFF7', '062-613-2114',
  jsonb_build_object(
    'headline', E'항공·드론 영상을 AI로 분석해\n광주전남 해안 행정을 돕습니다',
    'lines', jsonb_build_array('광역 전체 결과로 시작하고, 시·군·구는 직접 고릅니다.', '분석 결과 확인부터 보고서 작성까지 지원합니다.'),
    'items', jsonb_build_object('card-marine', '해안 쓰레기 종류별 · 해안 구간별 양')),
  ARRAY['card-marine'], 'system:0012'
WHERE EXISTS (SELECT 1 FROM tenants WHERE id = 'gwangju-jeonnam')
ON CONFLICT (tenant_id) DO NOTHING;
