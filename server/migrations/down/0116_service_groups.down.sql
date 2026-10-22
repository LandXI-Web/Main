-- 0116_service_groups 되돌리기 — 행정서비스 묶음 표를 지운다(분석서비스 · 결과는 그대로 · 묶음만 사라진다).
ALTER TABLE deploys DROP COLUMN IF EXISTS group_id;
DROP TABLE IF EXISTS group_cards;
DROP TABLE IF EXISTS service_groups;
