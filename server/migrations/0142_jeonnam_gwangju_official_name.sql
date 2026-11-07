-- 0142 (11-07 PM "응 바꾼다") 기관 · 지역 정식 이름 '전남광주특별시' → '전남광주통합특별시'. 10-17 원칙 268 · 0105 · 0106 의 결정을 뒤집는다(날짜가 늦은 쪽이 이김).
-- '전남광주통합특별시' 안에는 '전남광주특별시' 글자가 들어 있지 않으므로 몇 번 돌려도 같다(이미 바뀐 줄은 0행). 영어 이름(Jeonnam-Gwangju)은 그대로. audit_log 는 건드리지 않는다.
UPDATE tenants SET name = replace(name::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE name::text LIKE '%전남광주특별시%';
UPDATE tenant_users SET name = replace(name::text,'전남광주특별시','전남광주통합특별시') WHERE name::text LIKE '%전남광주특별시%';
UPDATE deploys SET name = replace(name::text,'전남광주특별시','전남광주통합특별시') WHERE name::text LIKE '%전남광주특별시%';
UPDATE deploys SET region_name = replace(region_name::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE region_name::text LIKE '%전남광주특별시%';
UPDATE jobs SET label = replace(label::text,'전남광주특별시','전남광주통합특별시') WHERE label::text LIKE '%전남광주특별시%';
UPDATE feedback SET note = replace(note::text,'전남광주특별시','전남광주통합특별시') WHERE note::text LIKE '%전남광주특별시%';
UPDATE tenant_brand SET short = replace(short::text,'전남광주특별시','전남광주통합특별시') WHERE short::text LIKE '%전남광주특별시%';
UPDATE tenant_brand SET intro = replace(intro::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE intro::text LIKE '%전남광주특별시%';
UPDATE approvals SET payload = replace(payload::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE payload::text LIKE '%전남광주특별시%';
UPDATE analysis_requests SET meta = replace(meta::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE meta::text LIKE '%전남광주특별시%';
UPDATE agent_runs SET answer_md = replace(answer_md::text,'전남광주특별시','전남광주통합특별시') WHERE answer_md::text LIKE '%전남광주특별시%';
UPDATE agent_tool_calls SET args = replace(args::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE args::text LIKE '%전남광주특별시%';
UPDATE agent_confirms SET args = replace(args::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE args::text LIKE '%전남광주특별시%';
UPDATE survey_emd SET top5 = replace(top5::text,'전남광주특별시','전남광주통합특별시')::jsonb WHERE top5::text LIKE '%전남광주특별시%';
UPDATE survey_sgg SET sido = replace(sido::text,'전남광주특별시','전남광주통합특별시') WHERE sido::text LIKE '%전남광주특별시%';
UPDATE national_cells_river_old SET sido = replace(sido::text,'전남광주특별시','전남광주통합특별시') WHERE sido::text LIKE '%전남광주특별시%';
UPDATE national_cells SET sido = replace(sido::text,'전남광주특별시','전남광주통합특별시') WHERE sido::text LIKE '%전남광주특별시%';
UPDATE survey_findings SET addr = replace(addr::text,'전남광주특별시','전남광주통합특별시') WHERE addr::text LIKE '%전남광주특별시%';
UPDATE survey_parcels SET addr = replace(addr::text,'전남광주특별시','전남광주통합특별시') WHERE addr::text LIKE '%전남광주특별시%';
