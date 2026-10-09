-- 0027_release.sql — 분석 서비스 배포: 기관 공유 기록(확인 대장 배포-5 · 원칙 152 · 160) · 멱등
--   card_shares  LX 관리자가 '배포 → 기관 공유' 체크 표에서 서비스(카드)를 기관에 켜고 끈 기록 한 줄씩(지우지 않고 쌓는다).
--                서비스 × 기관의 지금 상태 = 그 쌍의 마지막 줄(shared). 줄이 없는 쌍은 지금까지처럼 그 기관 배포 기록으로 판정한다
--                (brand._services — 이미 운영 중인 공유 상태를 바꾸지 않는다 · 진행 중 데이터 0 변경).
--                test = 시험으로 켠 줄(확인 흐름 점검) — 시험이 끝나면 원래 상태로 되돌리는 줄을 같은 표에 남긴다.
--   배포 신청(신청서 메모 · 결과 장면 · 학습 데이터 · 정확도)은 새 표 없이 지금 있는 승인 요청 행(approvals · subject card)의 payload 에 담는다.
--   추론(프로젝트 모델로 분석)은 지금 있는 분석 작업(jobs · kind infer)의 options.project_id · options.project_infer 로 표시한다.
-- 되돌리기: migrations/down/0027_release.down.sql (DROP TABLE card_shares — 다른 표는 건드리지 않는다).
-- RLS: LX 영역만 쓰고 읽는다(기관 세션은 brand._services 가 lx 영역 연결로 읽는다). 실행: postgres(소유자) — migrate.py.

CREATE TABLE IF NOT EXISTS card_shares(
  id bigserial PRIMARY KEY,
  card_id text NOT NULL,                             -- cards.id
  tenant_id text NOT NULL,                           -- tenants.id(이용 기관)
  shared boolean NOT NULL,                           -- true = 공유 켬 · false = 공유 끔
  by text,                                           -- 바꾼 LX 관리자(lx_users.id)
  at timestamptz NOT NULL DEFAULT now(),
  test boolean NOT NULL DEFAULT false,               -- 시험으로 바꾼 줄
  note text);
CREATE INDEX IF NOT EXISTS card_shares_pair ON card_shares (card_id, tenant_id, at DESC, id DESC);

ALTER TABLE card_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lx_only ON card_shares;
CREATE POLICY lx_only ON card_shares USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');

GRANT SELECT, INSERT ON card_shares TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE card_shares_id_seq TO landxi_app, landxi_worker;
