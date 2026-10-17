-- 0106 (10-17 바퀴 16 · 원칙 268) 남은 배포 이름 4줄 '전남광주통합특별시' → '전남광주특별시'. 그 4줄만(id 지정) · audit_log 는 건드리지 않는다. 몇 번 돌려도 같다.
UPDATE deploys SET name = replace(name, '전남광주통합특별시', '전남광주특별시'),
                   region_name = replace(region_name::text, '전남광주통합특별시', '전남광주특별시')::jsonb
 WHERE id IN ('dp-12730-farm-26', 'dp-12130-farm-26', 'dp-12110-farm-26', 'dp-12780-farm-26')
   AND (name LIKE '%전남광주통합특별시%' OR region_name::text LIKE '%전남광주통합특별시%');
