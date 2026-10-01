-- 0021 기관 사용자 연락처(선택) — 확인 대장 '기관 화면 확인' 기관-8 ⓐ(이름 · 부서 + 연락처(선택 · LX 담당 직원과 관리자만)) · 원칙 102 · 105 · 멱등
--   연락처는 그 사람이 스스로 적은 경우에만 있다(가입 신청의 '연락처(선택)' 칸) — 관리자가 대신 적지 않는다(원칙 105 내 정보는 본인이).
--   보는 사람 = 그 요청을 받은 LX 담당 직원과 LX 관리자만(서버가 잘라 준다 — GET /api/v1/accounts/senders · landxi_api/accounts.py).
--   기관 화면 · 다른 기관 · 다른 LX 직원에게는 내지 않는다. 비우면(빈 칸) 없음과 같다.
ALTER TABLE tenant_users    ADD COLUMN IF NOT EXISTS contact text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS contact text;
