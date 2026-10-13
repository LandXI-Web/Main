-- 0070_national_model.sql — 전국 결과 자산 칸마다 '어느 판(모델)으로 만든 결과인가'(10-13 경작지v2-처리 ⓐ · 원칙 238) · 멱등
--   national_cells.model_id  그 칸의 지금 결과(진행 · XI맵 · 관리자 숫자가 읽는 결과)를 만든 모델. 작업기 설정 'national.run'.model 과 다르면
--                            그 칸은 새 판으로 다시 분석할 차례(결과는 지우지 않고 그대로 보이다가, 새 판 결과가 나오면 바꿔 끼운다).
--   national_jobs.model_id   조각 작업을 돌린 모델 — XI맵 객체 묶음은 칸의 지금 판과 같은 판 작업만 내준다(옛 판 묶음은 E: 에 그대로 남음).
-- 10-13 이전 결과는 모두 aerial25/best(작업 장부 jobs.model_id 로 확인 · 426 조각 전부). 다시 분석할 차례에 넣으며 다시 시도 횟수를 0 으로.
-- 되돌리기: migrations/down/0070_national_model.down.sql
ALTER TABLE national_cells ADD COLUMN IF NOT EXISTS model_id text;
ALTER TABLE national_jobs ADD COLUMN IF NOT EXISTS model_id text;
UPDATE national_jobs n SET model_id = j.model_id FROM jobs j WHERE j.id = n.job_id AND n.model_id IS NULL;
UPDATE national_cells SET model_id = 'aerial25/best', tries = 0, next_try_at = NULL WHERE state = 'done' AND model_id IS NULL;
GRANT SELECT ON national_cells, national_jobs TO landxi_app;
