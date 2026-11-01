-- 0136 산사태 취약지역 분석서비스 — 이름 · 설명(10-31 PM "1. 산사태 취약지역 분석서비스 로 한다. 2. 아니 변화지역 분석만 잘하면 된다.").
-- 이름은 한 곳(cards.name) — 화면 · 카드 · 지도 서비스는 이 값을 읽는다. 법 용어 '취약지역'(산림보호법).
-- 찾는 것: 산림 변화 모델(change/forest · config/landslide.yaml)로 두 시점 사이 산림이 벗겨진 곳 + 경사(공개 30 m 지형). 멱등.

UPDATE cards SET name = '{"ko": "산사태 취약지역 분석서비스", "en": "산사태 취약지역 분석서비스"}'::jsonb,
                 domain = '산사태 취약지역 관리',
                 intro = '{"line": "두 시점 항공 영상에서 산림이 벗겨진 곳(벌채 · 임도 · 절개 · 개간 · 신축)을 찾는다.", "headline": "산사태 취약지역 관리"}'::jsonb
 WHERE id = 'card-landslide';

UPDATE card_info SET line = '두 시점 항공 영상을 산림 변화 AI로 분석해 산림이 벗겨진 곳(벌채 · 임도 · 절개 · 개간 · 신축)을 찾고 경사와 함께 보여 줍니다',
                     finds = '산림이 나지 · 도로 · 건물 · 농지 · 초지로 바뀐 곳(채석장 · 개발지 확장은 따로 표시)',
                     compare = '지구별 수 · 넓이 · 경사 · 필지'
 WHERE card_id = 'card-landslide';
