-- 0070_national_model 되돌리기
ALTER TABLE national_jobs DROP COLUMN IF EXISTS model_id;
ALTER TABLE national_cells DROP COLUMN IF EXISTS model_id;
