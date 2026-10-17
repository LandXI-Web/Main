-- 되돌리기(10-17 원칙 268 DB 이름 바꾸기) — 한 트랜잭션. 바꾸기 전에 '전남광주'(통합 제외)가 든 행은 0건이었으므로 정확히 되돌아간다.
-- 주의: 이름 칸만 바꾸면 코드(regions.py 등)도 옛 이름으로 되돌려야 맞는다.
BEGIN;
SET LOCAL lock_timeout='30s';
UPDATE tenants SET name = regexp_replace(regexp_replace(name::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE name::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE tenant_users SET name = regexp_replace(regexp_replace(name::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE name::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE deploys SET name = regexp_replace(regexp_replace(name::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE name::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE deploys SET region_name = regexp_replace(regexp_replace(region_name::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE region_name::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE jobs SET label = regexp_replace(regexp_replace(label::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE label::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE feedback SET note = regexp_replace(regexp_replace(note::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE note::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE tenant_brand SET short = regexp_replace(regexp_replace(short::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE short::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE tenant_brand SET intro = regexp_replace(regexp_replace(intro::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE intro::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE approvals SET payload = regexp_replace(regexp_replace(payload::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE payload::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE analysis_requests SET meta = regexp_replace(regexp_replace(meta::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE meta::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE agent_runs SET answer_md = regexp_replace(regexp_replace(answer_md::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE answer_md::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE agent_tool_calls SET args = regexp_replace(regexp_replace(args::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE args::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE agent_confirms SET args = regexp_replace(regexp_replace(args::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE args::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE survey_emd SET top5 = regexp_replace(regexp_replace(top5::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g')::jsonb WHERE top5::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE survey_sgg SET sido = regexp_replace(regexp_replace(sido::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE sido::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE survey_findings SET addr = regexp_replace(regexp_replace(addr::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE addr::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE survey_parcels SET addr = regexp_replace(regexp_replace(addr::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE addr::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE national_cells_river_old SET sido = regexp_replace(regexp_replace(sido::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE sido::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
UPDATE national_cells SET sido = regexp_replace(regexp_replace(sido::text,'전남광주(?!통합)','광주전남','g'),'Jeonnam-Gwangju','Gwangju-Jeonnam','g') WHERE sido::text ~ '전남광주(?!통합)|Jeonnam-Gwangju';
COMMIT;
