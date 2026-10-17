-- 0105 (10-17 원칙 268) 기관 · 지역 이름 '광주전남(특별시)' → '전남광주(특별시)'. 몇 번 돌려도 같다(없으면 0행). 큰 표(필지 주소 · 결과 주소)는 바깥에서 한 번 바꿨고, 새로 들어오는 주소는 regions.py 가 새 이름으로 적는다.
UPDATE tenants SET name = replace(replace(name::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE name::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE tenant_users SET name = replace(replace(name::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE name::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE deploys SET name = replace(replace(name::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE name::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE deploys SET region_name = replace(replace(region_name::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE region_name::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE jobs SET label = replace(replace(label::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE label::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE feedback SET note = replace(replace(note::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE note::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE tenant_brand SET short = replace(replace(short::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE short::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE tenant_brand SET intro = replace(replace(intro::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE intro::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE approvals SET payload = replace(replace(payload::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE payload::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE analysis_requests SET meta = replace(replace(meta::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE meta::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE agent_runs SET answer_md = replace(replace(answer_md::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE answer_md::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE agent_tool_calls SET args = replace(replace(args::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE args::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE agent_confirms SET args = replace(replace(args::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE args::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE survey_emd SET top5 = replace(replace(top5::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju')::jsonb WHERE top5::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE survey_sgg SET sido = replace(replace(sido::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE sido::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE national_cells_river_old SET sido = replace(replace(sido::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE sido::text ~ '광주전남|Gwangju-Jeonnam';
UPDATE national_cells SET sido = replace(replace(sido::text,'광주전남','전남광주'),'Gwangju-Jeonnam','Jeonnam-Gwangju') WHERE sido::text ~ '광주전남|Gwangju-Jeonnam';
