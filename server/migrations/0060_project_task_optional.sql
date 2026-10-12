-- 0060_project_task_optional.sql — 새 프로젝트 창에서 '무엇을' 칸을 뺌(원칙 225 · 10-12 사용자 "무엇을? 하나고르기 이게 꼭 필요한 기능인가") · 멱등
--   projects.task  비울 수 있음 — 새 프로젝트는 비운 채 만든다. 프로젝트가 찾는 것은 학습데이터 구축에서 올린 클래스(train_samples.names →
--                  클래스 한 곳)로 저절로 정해진다. 옛 프로젝트의 값은 지우지 않고 그대로 읽는다(옛 데이터 호환).
-- 되돌리기: migrations/down/0060_project_task_optional.down.sql
ALTER TABLE projects ALTER COLUMN task DROP NOT NULL;
