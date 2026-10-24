-- 0131 되돌리기 — 산사태 카드 · 구간 도형 · 찾는 것 열을 뺀다(찾는 것으로 되살린 줄은 다음 장부 맞추기에서 카드 × 시군구로 다시 묶인다)
DELETE FROM card_versions WHERE id = 'card-landslide@1.0';
DELETE FROM card_group_of WHERE card_id = 'card-landslide';
DELETE FROM card_info WHERE card_id = 'card-landslide';
DELETE FROM cards WHERE id = 'card-landslide' AND NOT EXISTS (SELECT 1 FROM jobs WHERE card_id = 'card-landslide');
ALTER TABLE change_ranges DROP COLUMN IF EXISTS parts;
DROP INDEX IF EXISTS service_results_cell_t;
ALTER TABLE service_results DROP COLUMN IF EXISTS target;
