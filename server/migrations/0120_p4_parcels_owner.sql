-- 0120_p4_parcels_owner.sql — (2/2 · 무거운 쓰기) 필지 행 주인을 전국 공통(lx) 한 벌로 · 연도 · 분류 줄 채우기(10-22 now21 · 바퀴 22 P4) · 멱등
--   0119 가 정책을 '볼 수 있는 시군구'로 먼저 바꿨으므로 이 쓰기 동안에도 기관이 보는 필지는 그대로다. 읽기는 막지 않는다(행 잠금만).
--   바꾸기 전 보관: 02. 데이터/_backup/p4-20261022/parcels-owner.json.gz · 되돌리기: server/ops/p4_restore_parcel_owner.py
SET LOCAL lock_timeout = '30s';
UPDATE survey_parcels SET tenant_id = 'lx' WHERE tenant_id IS DISTINCT FROM 'lx';
INSERT INTO parcel_ai_year(pnu, sgg_cd, year, cls, area_m2, in_m2, n, conf, ids)
SELECT pnu, coalesce(sgg_cd, left(pnu, 5)), 2023, c.cls, c.m2, c.in_m2, c.n, c.conf, c.ids FROM survey_parcels sp
CROSS JOIN LATERAL (VALUES
  ('building',   sp.a23_bld_m2,  sp.a23_bld_in_m2,  sp.a23_bld_n,  sp.a23_bld_conf,  sp.a23_bld_ids),
  ('crop',       sp.a23_crop_m2, sp.a23_crop_in_m2, sp.a23_crop_n, sp.a23_crop_conf, sp.a23_crop_ids),
  ('parking',    sp.a23_park_m2, sp.a23_park_in_m2, sp.a23_park_n, sp.a23_park_conf, sp.a23_park_ids),
  ('greenhouse', sp.a23_gh_m2,   sp.a23_gh_in_m2,   sp.a23_gh_n,   sp.a23_gh_conf,   sp.a23_gh_ids)) c(cls, m2, in_m2, n, conf, ids)
WHERE coalesce(c.m2, 0) > 0
ON CONFLICT (pnu, year, cls) DO NOTHING;
INSERT INTO parcel_ai_year(pnu, sgg_cd, year, cls, area_m2, in_m2, n, conf, ids)
SELECT pnu, coalesce(sgg_cd, left(pnu, 5)), 2025, c.cls, c.m2, c.in_m2, c.n, c.conf, c.ids FROM survey_parcels sp
CROSS JOIN LATERAL (VALUES
  ('crop',       sp.a25_crop_m2,   NULL::double precision, NULL::int, NULL::real, NULL::text),
  ('uncrop',     sp.a25_uncrop_m2, NULL::double precision, NULL::int, NULL::real, NULL::text),
  ('greenhouse', sp.a25_gh_m2,     sp.a25_gh_in_m2,        sp.a25_gh_n, sp.a25_gh_conf, sp.a25_gh_ids)) c(cls, m2, in_m2, n, conf, ids)
WHERE coalesce(c.m2, 0) > 0
ON CONFLICT (pnu, year, cls) DO NOTHING;
