-- 0080_train_shared.sql — LX 관리자 '공유 데이터' 학습 데이터 탭(10-14 공유데이터-탭 · 원칙 240) · 멱등
--   train_samples.staff_shared  관리자가 직원에게 공개한 학습 데이터(올린 묶음). 공개된 묶음은 다른 프로젝트 학습 화면
--                               학습 데이터 블록의 '공유 데이터에서 고르기'에 나온다. 처음 값은 모두 비공개(지금 화면 그대로).
-- 되돌리기: migrations/down/0080_train_shared.down.sql
ALTER TABLE train_samples ADD COLUMN IF NOT EXISTS staff_shared boolean NOT NULL DEFAULT false;
