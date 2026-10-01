-- 0016_card_info.sql — 서비스 카드 한 벌의 카드 정보(구현 3차 · 확인 대장 14차 카드-1 ⓐ · 원칙 90 · 93) · 멱등
--   카드 한 장 = 정보 여덟 칸(결과 장면 · 상태 · 어디·기준일 · 이름 · 무엇을 찾나 · 결과 예시 · 조건 두 칸 · 1차 버튼).
--   상태 · 어디 · 결과 숫자 · 쓰이는 곳 · 걸리는 시간은 서버가 기록에서 계산한다(대표 수치 요약 /summary · 작업 기록) — 이 표에는 적지 않는다.
--   이 표는 LX 가 카드마다 고쳐 쓰는 글과 그림만: 무엇을 찾나 · 분류 · 결과 예시(지역 · 말) · 영상 조건 · 시점 · 찾는 것 · 대조 · 대표 이미지 · 결과 장면.
--   대표 이미지 = 실제 결과 장면만(지어낸 그림 0 · 반출할 수 없는 영상의 장면 0). 장면마다 어느 시군구 결과인지(sgg)와 그 지역 기관(tenant)을 적어
--   기관 화면에는 그 기관 관할의 장면만 보인다(원칙 39). 장면이 없는 카드 = 회백 판(원칙 42).
--   씨앗 값은 없는 행에만 넣는다(LX 가 고친 값을 덮지 않는다).
CREATE TABLE IF NOT EXISTS card_info(
  card_id text PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  line text,                 -- 무엇을 찾나(한 줄 · 사용자 말)
  grp text,                  -- 분류(농지·시설 · 환경 · 건축·변화 · 안전 · 해외) — 분석하기 거르기 칩
  result_sgg text,           -- 결과 예시 지역(시군구 코드) — 비면 서버가 고른다(운영 먼저 · 현장 확인 필요가 있는 곳 먼저)
  result_word text,          -- 결과 예시 말(AI 탐지 수일 때 — 예: 비닐하우스 동). 현장 확인 필요는 그 말 그대로
  imagery text,              -- 입력 영상 조건(예: 드론·항공 50cm 이하) — 비면 모델 해상도에서
  timepoints text,           -- 시점 조건
  finds text,                -- 찾는 것 — 비면 모델이 찾는 대상
  compare text,              -- 대조 — 비면 서비스 규칙(필지 대조)에서
  scene jsonb,               -- 대표 이미지 {src, caption, sgg, tenant, ex}
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 고를 수 있는 결과 장면들 [{src, caption, sgg, tenant, up}] (up = LX 가 올린 그림)
  swipe jsonb,               -- 영상 ↔ 결과 비교 {before, after, caption, sgg, tenant}
  updated_at timestamptz DEFAULT now(),
  updated_by text);
GRANT SELECT, INSERT, UPDATE, DELETE ON card_info TO landxi_app, landxi_worker;

-- 씨앗 — 무엇을 찾나 = 서비스 소개 글(landxi/v3/service-detail/data/intro.json)과 설계 7차 카드 시안의 문장 · 장면 = 이미 공개된 결과 크롭만
INSERT INTO card_info(card_id, line, grp, result_word, imagery, timepoints, finds, compare, scene, scenes, swipe, updated_by)
SELECT 'card-farm', '경작·휴경·시설·전용을 판정해 확인할 필지만 남깁니다', '농지·시설', NULL, '드론·항공 50cm 이하', '영농기·수확기 2시점 이상(1시점도 가능)',
  '경작지 · 비경작지 · 비닐하우스', '지목(기본) · 농지 대장 양식',
  '{"src":"/landxi/v3/service-detail/data/img/farm-hero.jpg","caption":"남원시 · 2025 드론 정사영상 4시점 · 휴경·전용 판정 필지","sgg":"52190","tenant":"namwon"}'::jsonb,
  '[{"src":"/landxi/v3/service-detail/data/img/farm-hero.jpg","caption":"남원시 · 2025 드론 정사영상 4시점","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-cycle4/1@2x.jpg","caption":"남원시 · 2025.04","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-cycle4/2@2x.jpg","caption":"남원시 · 2025.06","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-cycle4/3@2x.jpg","caption":"남원시 · 2025.08","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-cycle4/4@2x.jpg","caption":"남원시 · 2025.10","sgg":"52190","tenant":"namwon"}]'::jsonb,
  '{"before":"/landxi/assets/proto/crops/namwon-farmland-2025/3-clean.jpg","after":"/landxi/assets/proto/crops/namwon-farmland-2025/3@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"}'::jsonb,
  'system:0016'
WHERE EXISTS (SELECT 1 FROM cards WHERE id = 'card-farm') ON CONFLICT (card_id) DO NOTHING;

INSERT INTO card_info(card_id, line, grp, result_sgg, result_word, imagery, timepoints, finds, scene, scenes, swipe, updated_by)
SELECT 'card-5e85a9', '단동·다동 비닐하우스를 찾아 셉니다', '농지·시설', '43745', '비닐하우스 동', '드론·항공 50cm 이하', '1시점', '비닐하우스(단동 · 다동)',
  '{"src":"/landxi/assets/proto/crops/namwon-greenhouse-2025/2@2x.jpg","caption":"남원시 · 2025 정사영상 · 비닐하우스","sgg":"52190","tenant":"namwon"}'::jsonb,
  '[{"src":"/landxi/assets/proto/crops/namwon-greenhouse-2025/2@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/assets/proto/crops/namwon-greenhouse-2025/1@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/assets/proto/crops/namwon-greenhouse-2025/3@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/assets/proto/crops/namwon-greenhouse-2025/7@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"}]'::jsonb,
  '{"before":"/landxi/assets/proto/crops/namwon-greenhouse-2025/7-clean.jpg","after":"/landxi/assets/proto/crops/namwon-greenhouse-2025/7@2x.jpg","caption":"남원시 · 2025 정사영상","sgg":"52190","tenant":"namwon"}'::jsonb,
  'system:0016'
WHERE EXISTS (SELECT 1 FROM cards WHERE id = 'card-5e85a9') ON CONFLICT (card_id) DO NOTHING;

INSERT INTO card_info(card_id, line, grp, result_word, imagery, timepoints, finds, scene, scenes, swipe, updated_by)
SELECT 'card-marine', '해안 영상에서 쓰레기 군집을 찾아 수거할 곳부터 알려 줍니다', '환경', '쓰레기 군집 곳', '항공·드론 · 간조 때', '1시점', '해안 쓰레기 군집',
  '{"src":"/landxi/v3/service-detail/data/img/marine-hero.jpg","caption":"여수시 · 항공영상 · 쓰레기 군집","sgg":"12130","tenant":"gwangju-jeonnam"}'::jsonb,
  '[{"src":"/landxi/v3/service-detail/data/img/marine-hero.jpg","caption":"여수시 · 항공영상","sgg":"12130","tenant":"gwangju-jeonnam"},
    {"src":"/landxi/v3/service-detail/data/img/marine-aerial/1@2x.jpg","caption":"여수시 · 2025 항공영상","sgg":"12130","tenant":"gwangju-jeonnam"},
    {"src":"/landxi/v3/service-detail/data/img/marine-aerial/3@2x.jpg","caption":"여수시 · 2025 항공영상","sgg":"12130","tenant":"gwangju-jeonnam"},
    {"src":"/landxi/v3/service-detail/data/img/marine-drone/1@2x.jpg","caption":"여수시 · 2026 드론 영상","sgg":"12130","tenant":"gwangju-jeonnam"},
    {"src":"/landxi/v3/service-detail/data/img/marine-drone/2@2x.jpg","caption":"여수시 · 2026 드론 영상","sgg":"12130","tenant":"gwangju-jeonnam"}]'::jsonb,
  '{"before":"/landxi/assets/proto/crops/yeosu-marine-2025-aerial/3-clean.jpg","after":"/landxi/assets/proto/crops/yeosu-marine-2025-aerial/3@2x.jpg","caption":"여수시 · 2025 항공영상","sgg":"12130","tenant":"gwangju-jeonnam"}'::jsonb,
  'system:0016'
WHERE EXISTS (SELECT 1 FROM cards WHERE id = 'card-marine') ON CONFLICT (card_id) DO NOTHING;

INSERT INTO card_info(card_id, line, grp, result_word, imagery, timepoints, finds, scene, scenes, updated_by)
SELECT 'card-change', '두 시점 영상을 비교해 신축·소실·식생 변화를 골라냅니다', '건축·변화', '달라진 곳', '드론 정사영상', '같은 지역 2시점', '신축 · 소실 · 식생 변화',
  '{"src":"/landxi/v3/service-detail/data/img/change-hero.jpg","caption":"남원시 · 2025.04 ↔ 2025.10","sgg":"52190","tenant":"namwon"}'::jsonb,
  '[{"src":"/landxi/v3/service-detail/data/img/change-hero.jpg","caption":"남원시 · 2025.04 ↔ 2025.10","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-change/1@2x.jpg","caption":"남원시 · 4월 대비 10월","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-change/2@2x.jpg","caption":"남원시 · 4월 대비 10월","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-change/3@2x.jpg","caption":"남원시 · 4월 대비 10월","sgg":"52190","tenant":"namwon"},
    {"src":"/landxi/v3/service-detail/data/img/namwon-change/4@2x.jpg","caption":"남원시 · 4월 대비 10월","sgg":"52190","tenant":"namwon"}]'::jsonb,
  'system:0016'
WHERE EXISTS (SELECT 1 FROM cards WHERE id = 'card-change') ON CONFLICT (card_id) DO NOTHING;

-- 장면이 아직 없는 카드 — 글만(결과가 생기면 LX 가 서비스 카드 화면에서 결과 장면을 올린다)
INSERT INTO card_info(card_id, line, grp, imagery, timepoints, finds, updated_by)
SELECT v.id, v.line, v.grp, v.img, v.tp, v.finds, 'system:0016'
FROM (VALUES
  ('card-45424f', '건물을 찾아 대장과 다른 필지를 골라냅니다', '건축·변화', NULL, '1시점', '건물'),
  ('card-d8fc01', '들에 쌓인 곤포사일리지를 찾아 셉니다', '농지·시설', NULL, '1시점', '곤포사일리지'),
  ('card-389c45', '주차장을 찾아 지목과 다른 필지를 골라냅니다', '건축·변화', NULL, '1시점', '주차장'),
  ('card-living', '폐기물 더미와 불법 소각 흔적을 찾아 점검할 곳을 좁힙니다', '환경', '항공·드론 정사영상', '1시점', '방치 폐기물 · 불법 소각 흔적'),
  ('card-road', '포장 파손을 찾아 보수가 급한 구간부터 보여 줍니다', '안전', '차량 카메라 · 정사영상', '1시점', '포트홀 · 균열 · 보수 흔적'),
  ('card-crowd', '드론 영상에서 사람과 차량을 세어 혼잡을 보여 줍니다', '안전', '드론 영상(동영상)', '행사 시간대', '사람 · 차량'),
  ('card-forest', '산림 훼손지와 식생 밀도를 찾아 흡수량 산정의 기초를 만듭니다', '환경', '위성 · 항공 영상', '1시점', '산림 훼손지 · 식생 밀도'),
  ('card-global-farm', '위성 영상으로 경작·휴경을 판정해 확인할 농지만 남깁니다', '해외', '위성 영상', '생육기 여러 시점', '경작 · 휴경'),
  ('card-global-disaster', '재해 전후 위성 영상을 비교해 피해 건물과 지형 변화를 추립니다', '해외', '위성 영상', '재해 전 · 후 2시점', '피해 건물 · 지형 변화')
) AS v(id, line, grp, img, tp, finds)
WHERE EXISTS (SELECT 1 FROM cards WHERE cards.id = v.id)
ON CONFLICT (card_id) DO NOTHING;
