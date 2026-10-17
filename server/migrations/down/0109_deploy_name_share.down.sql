-- 0109 되돌리기 — 같은 12줄 이름 끝 '· 기관에 공유' → '· 적용'.
UPDATE deploys SET name = regexp_replace(name, '· 기관에 공유$', '· 적용')
 WHERE id IN ('dp-41390-farm-26', 'dp-44180-d8fc01-26', 'dp-12730-farm-26', 'dp-12780-farm-26', 'dp-51130-45424f-26', 'dp-12130-farm-26',
              'dp-12110-farm-26', 'dp-48870-5e85a9-26', 'dp-52190-5e85a9-26', 'dp-44133-389c45-26', 'dp-43745-5e85a9-26', 'dp-41670-389c45-26')
   AND name ~ '· 기관에 공유$';
