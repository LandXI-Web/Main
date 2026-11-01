-- 0139 되돌리기 — 이 모델을 쓰는 카드 판이 없을 때만 지운다.
DELETE FROM project_links WHERE kind='model' AND ref='change-publand' AND NOT EXISTS (SELECT 1 FROM card_versions WHERE 'change-publand' = ANY(model_ids));
DELETE FROM models WHERE id='change-publand' AND NOT EXISTS (SELECT 1 FROM card_versions WHERE 'change-publand' = ANY(model_ids));
