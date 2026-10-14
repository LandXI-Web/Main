-- 0090_shared_ledger.sql — LX 관리자 '공유 데이터' 행정 자료 올리기 · 관리(10-14 공유데이터-탭 다시 · 원칙 246) · 멱등
--   LX 가 올린 행정 자료 = 기관 대장 올리기와 같은 표(ledger_imports) · tenant_id 'lx' 줄. 새 표 없음.
--   ledger_imports.name          화면 이름(관리자가 고침 · 기관 줄은 비움 = 종류 이름)
--   ledger_imports.staff_shared  공개(직원 지도 서비스의 층으로 고를 수 있음) · 처음 값 비공개
-- 되돌리기: migrations/down/0090_shared_ledger.down.sql
ALTER TABLE ledger_imports ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE ledger_imports ADD COLUMN IF NOT EXISTS staff_shared boolean NOT NULL DEFAULT false;
