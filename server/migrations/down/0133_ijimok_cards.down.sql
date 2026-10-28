-- 0133 되돌리기 — 카드 ② ③ 지움(결과 · 작업 기록은 그대로)
DELETE FROM card_group_of WHERE card_id IN ('card-ijimok', 'card-occupy');
DELETE FROM card_versions WHERE card_id IN ('card-ijimok', 'card-occupy');
DELETE FROM card_info WHERE card_id IN ('card-ijimok', 'card-occupy');
DELETE FROM cards WHERE id IN ('card-ijimok', 'card-occupy');
