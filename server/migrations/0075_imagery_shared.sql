-- 0075_imagery_shared.sql — LX 관리자 '공유 데이터'(10-13 관리자-공유데이터 · 원칙 238) · 멱등
--   imagery.staff_visible  직원에게 보일지(공개 · 비공개). 비공개 영상은 직원의 '공유 데이터에서 고르기' 목록에 나오지 않는다.
--                          처음 값은 모두 공개(지금 화면 그대로).
-- 되돌리기: migrations/down/0075_imagery_shared.down.sql
ALTER TABLE imagery ADD COLUMN IF NOT EXISTS staff_visible boolean NOT NULL DEFAULT true;
