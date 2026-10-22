-- 0120 되돌리기 — 필지 행 주인을 바꾸기 전 값으로: python server/ops/p4_restore_parcel_owner.py(보관 파일 _backup/p4-20261022/parcels-owner.json.gz)
-- 연도 · 분류 줄(parcel_ai_year)의 채운 값만 지운다(표는 0119 되돌리기가 지운다)
DELETE FROM parcel_ai_year WHERE src = 'survey_parcels';
CREATE INDEX IF NOT EXISTS survey_parcels_tsgg ON survey_parcels (tenant_id, sgg_cd);
