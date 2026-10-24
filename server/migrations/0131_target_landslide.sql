-- 0131_target_landslide.sql — 10-25 사용자 "1번은 A로 간다. 2번은 산사태는 국토 변화 분석서비스랑 비슷하네 … 국토변화 분석서비스 대상지가 왜 정해져 있지?" · 멱등
--   ① service_results.target : 찾는 것(모델이 찾는 분류) — 모델을 둘 이상 쓰는 카드(관광지 안전관리: 사람 · 차량)는
--      '지금 결과'를 (카드 × 시군구 × 원천 × 연도 × 찾는 것)마다 하나 둔다. 모델이 하나인 카드는 '' 그대로(예전과 같음).
--      이 파일이 대체된 줄을 바로 되살린다(춘향제 사람 결과가 차량 결과에 '대체됨'으로 묶였던 것).
--   ② change_ranges.parts   : 올린 구간의 도형 하나하나(이름 · 도형 5179 GeoJSON) — 산사태 취약지구처럼 결과를 지구마다 센다.
--   ③ 산사태 취약지구 분석서비스(card-landslide) — 국토 변화와 같은 틀(같은 모델 change-ap25 · 같은 칸) · 상태 '검토'.
--      찾는 변화 = 산림 → 나지 · 산림 → 도로 · 산림 → 건물(카드 판 modules.change_types = 'landslide' · 국토 변화 기본값은 그대로).
-- 되돌리기: migrations/down/0131_target_landslide.down.sql
SET LOCAL lock_timeout = '10s';

-- ① 찾는 것 ───────────────────────────────────────────────────────────────────
ALTER TABLE service_results ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS service_results_cell_t ON service_results (card_id, sgg_cd, source, year, target);

WITH multi AS (                                   -- 어느 판이든 모델이 둘 이상인 카드
  SELECT DISTINCT card_id FROM card_versions WHERE coalesce(array_length(model_ids, 1), 0) > 1
)
UPDATE service_results s SET target = t.tg
FROM (SELECT j.id, (SELECT string_agg(x, '·' ORDER BY x) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(m.classes) = 'array' THEN m.classes ELSE '[]'::jsonb END) x) AS tg
      FROM jobs j JOIN models m ON m.id = j.model_id) t
WHERE t.id = s.set_id AND s.card_id IN (SELECT card_id FROM multi) AND s.target IS DISTINCT FROM coalesce(t.tg, '');

-- 같은 칸(… × 찾는 것)에서 맨 앞 줄만 '지금' — 배포본 지금 결과 > 늦게 분석한 것 > 늦게 적은 것(ext_api.ledger_sync 와 같은 순서)
WITH ranked AS (
  SELECT id, first_value(id) OVER w AS top, row_number() OVER w AS rn
  FROM service_results
  WINDOW w AS (PARTITION BY card_id, sgg_cd, source, year, target
               ORDER BY (origin = 'deploy') DESC, coalesce(analyzed_at, at) DESC, at DESC)
)
UPDATE service_results s SET replaced_at = CASE WHEN r.rn = 1 THEN NULL ELSE coalesce(s.replaced_at, now()) END,
                             replaced_by = CASE WHEN r.rn = 1 THEN NULL ELSE r.top END
FROM ranked r
WHERE r.id = s.id AND s.card_id IN (SELECT DISTINCT card_id FROM card_versions WHERE coalesce(array_length(model_ids, 1), 0) > 1)
  AND (s.replaced_by IS DISTINCT FROM CASE WHEN r.rn = 1 THEN NULL ELSE r.top END);

-- ② 구간 도형 하나하나 ─────────────────────────────────────────────────────────
ALTER TABLE change_ranges ADD COLUMN IF NOT EXISTS parts jsonb;

-- ③ 산사태 취약지구 분석서비스 ─────────────────────────────────────────────────
INSERT INTO cards(id, name, scope, domain, kind, status_history, portable, intro)
VALUES ('card-landslide', '{"ko": "산사태 취약지구 분석서비스", "en": "산사태 취약지구 분석서비스"}'::jsonb, 'local', '산사태 취약지구 관리',
        '{"input": ["ortho"], "output": ["polygon", "series"], "viz": ["layer", "chart"]}', '검토', true,
        '{"line": "취약지구 경계 안에서 두 시점 사이 산림이 나지 · 도로 · 건물로 바뀐 곳을 찾는다.", "headline": "산사태 취약지구 관리"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO card_info(card_id, line, grp, imagery, timepoints, finds, compare, updated_by)
VALUES ('card-landslide', '두 시점 영상을 토지피복 AI로 분석해 취약지구 안에서 산림이 나지 · 도로 · 건물로 바뀐 곳을 찾습니다', '안전',
        '시점마다 하나 — 국토지리정보원 항공정사영상(연도별) · 공유 데이터 · 내 영상', '같은 지구 두 시점',
        '산림 → 나지 · 산림 → 도로 · 산림 → 건물', '지구별 수 · 넓이 · 필지', 'system:landslide-1025')
ON CONFLICT (card_id) DO NOTHING;

INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog)
VALUES ('card-landslide@1.0', 'card-landslide', '1.0', ARRAY['change-ap25'],
        '{"ext": {"mod-change-pair-epoch": true, "mod-change-change-class": true}, "core": ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"],
          "change_types": "landslide"}'::jsonb,
        '국토 변화와 같은 틀 · 토지피복 U-Net(change-ap25) 두 시점 비교 · 산림 → 나지 · 도로 · 건물 · 지구별 집계')
ON CONFLICT (id) DO NOTHING;
-- 찾는 것 칸은 card_info.finds 글 그대로(카드 판 classes 는 낱말 첫 칸만 써서 '산림'으로 줄어든다)
UPDATE card_versions SET modules = modules - 'classes' WHERE id = 'card-landslide@1.0' AND modules ? 'classes';

-- 분야 '안전'(관광지 안전관리와 같은 분야 · 분석 서비스 분야 칩)
INSERT INTO card_group_of(card_id, group_id, by)
SELECT 'card-landslide', 'grp-safety', 'system:0131' WHERE EXISTS (SELECT 1 FROM card_groups WHERE id = 'grp-safety')
ON CONFLICT DO NOTHING;
