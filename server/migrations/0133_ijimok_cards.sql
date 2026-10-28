-- 0133_ijimok_cards.sql — 10-28 지시서 v5 §1 "이지목 현황 · 점유의심 조사 카드를 만든다" · 멱등
--   카드 ② 이지목 현황(card-ijimok)  : 한 시점 영상 → 토지피복 U-Net(change-ap25) → 필지마다 지목 ↔ 실제 피복 → 판정 층 7종(이지목_판정별레이어.gpkg 레이어명)
--   카드 ③ 점유의심 조사(card-occupy) : ① 국토 변화 · ② 이지목 현황 결과를 필지로 겹쳐 → 점유의심 목록 · 판정 · 보고서
--   국토 변화와 같은 틀(같은 모델 · 같은 칸 · 같은 결과 표) — 카드 판 modules.change_types 로 갈린다(ijimok · occupy).
--   상태 '검토'(산사태 취약지구와 같음 · 공개 승인 전).
-- 되돌리기: migrations/down/0133_ijimok_cards.down.sql
SET LOCAL lock_timeout = '10s';

INSERT INTO cards(id, name, scope, domain, kind, status_history, portable, intro)
VALUES ('card-ijimok', '{"ko": "이지목 현황 분석서비스", "en": "이지목 현황 분석서비스"}'::jsonb, 'local', '토지 현행화',
        '{"input": ["ortho"], "output": ["polygon"], "viz": ["layer", "chart"]}', '검토', true,
        '{"line": "한 시점 영상을 토지피복 AI로 분석해 필지마다 지목과 실제 쓰임이 맞는지 판정합니다.", "headline": "토지 현행화"}'::jsonb),
       ('card-occupy', '{"ko": "점유의심 조사 분석서비스", "en": "점유의심 조사 분석서비스"}'::jsonb, 'local', '토지 현행화',
        '{"input": ["ortho"], "output": ["polygon", "table"], "viz": ["layer", "table"]}', '검토', true,
        '{"line": "국토 변화와 이지목 현황 결과를 필지로 겹쳐 현장 확인할 점유의심 필지 목록을 만듭니다.", "headline": "토지 현행화"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO card_info(card_id, line, grp, imagery, timepoints, finds, compare, updated_by)
VALUES ('card-ijimok', '한 시점 영상을 토지피복 AI로 분석해 필지마다 지목과 실제 쓰임이 맞는지 판정합니다', '건축·변화',
        '국토지리정보원 항공정사영상(연도별) · 공유 데이터 · 내 영상', '1시점',
        '정상 · 미확정 · 지목미정리 · 점유의심 · 유휴산림화 · 수역구거 · 기타', '필지(지목 · 소유구분)', 'system:ijimok-1028'),
       ('card-occupy', '국토 변화와 이지목 현황 결과를 필지로 겹쳐 현장 확인할 점유의심 필지 목록을 만듭니다', '건축·변화',
        '국토지리정보원 항공정사영상(연도별) · 공유 데이터 · 내 영상', '같은 대상지 두 시점',
        '점유의심 필지(지번 · 지목 · 소유구분 · 변화 유형 · 면적 · 판정 상태)', '필지(지목 · 소유구분 · 판정)', 'system:ijimok-1028')
ON CONFLICT (card_id) DO NOTHING;

INSERT INTO card_versions(id, card_id, version, model_ids, modules, changelog)
VALUES ('card-ijimok@1.0', 'card-ijimok', '1.0', ARRAY['change-ap25'],
        '{"ext": {"mod-change-change-class": true}, "core": ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"],
          "change_types": "ijimok"}'::jsonb,
        '토지피복 U-Net(change-ap25) 한 시점 · 필지 지목 ↔ 피복 · 판정 규칙 ijimok_synth.judge · 판정 층 7종(gpkg 레이어명)'),
       ('card-occupy@1.0', 'card-occupy', '1.0', ARRAY['change-ap25'],
        '{"ext": {"mod-change-pair-epoch": true}, "core": ["mod-auth", "mod-map", "mod-result", "mod-stats", "mod-report", "mod-feedback", "mod-usage"],
          "change_types": "occupy"}'::jsonb,
        '국토 변화(두 시점) × 이지목 현황(뒤 시점) 필지 교차 · 점유의심 목록')
ON CONFLICT (id) DO NOTHING;
UPDATE card_versions SET modules = modules - 'classes' WHERE id IN ('card-ijimok@1.0', 'card-occupy@1.0') AND modules ? 'classes';

INSERT INTO card_group_of(card_id, group_id, by)
SELECT x, 'grp-build', 'system:0133' FROM unnest(ARRAY['card-ijimok', 'card-occupy']) AS x
WHERE EXISTS (SELECT 1 FROM card_groups WHERE id = 'grp-build')
ON CONFLICT DO NOTHING;
