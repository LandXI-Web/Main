-- 0140 되돌리기 — 지울 때 audit_log(card.delete · card-occupy)에 남긴 줄로 되살린다. 카드 그림은 02. 데이터/_trash/card-occupy 에서 cards/card-occupy 로 옮긴다(파일).
WITH a AS (SELECT before FROM audit_log WHERE action='card.delete' AND subject='card-occupy' ORDER BY at DESC LIMIT 1)
INSERT INTO cards SELECT (jsonb_populate_record(NULL::cards, a.before->'card')).* FROM a ON CONFLICT (id) DO NOTHING;
WITH a AS (SELECT before FROM audit_log WHERE action='card.delete' AND subject='card-occupy' ORDER BY at DESC LIMIT 1)
INSERT INTO card_versions SELECT (jsonb_populate_record(NULL::card_versions, v)).* FROM a, jsonb_array_elements(a.before->'versions') v ON CONFLICT (id) DO NOTHING;
WITH a AS (SELECT before FROM audit_log WHERE action='card.delete' AND subject='card-occupy' ORDER BY at DESC LIMIT 1)
INSERT INTO card_info SELECT (jsonb_populate_record(NULL::card_info, a.before->'info')).* FROM a ON CONFLICT (card_id) DO NOTHING;
WITH a AS (SELECT before FROM audit_log WHERE action='card.delete' AND subject='card-occupy' ORDER BY at DESC LIMIT 1)
INSERT INTO card_group_of SELECT (jsonb_populate_record(NULL::card_group_of, g)).* FROM a, jsonb_array_elements(coalesce(a.before->'groups','[]'::jsonb)) g ON CONFLICT DO NOTHING;
