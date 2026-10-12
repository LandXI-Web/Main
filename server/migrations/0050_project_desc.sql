-- 0050_project_desc.sql — 새 프로젝트 한 창(원칙 220 · 10-12) · 멱등
--   projects.description  설명(선택 · 300자) — 새 프로젝트 창의 '설명' 칸 · 프로젝트 카드 · 한 장
--   영상 ↔ 프로젝트는 project_links(kind 'imagery')로 잇는다(새 표 없음 · 대상 지역은 영상 자리에서 정해진다)
-- 되돌리기: migrations/down/0050_project_desc.down.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description text;
