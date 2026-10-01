-- 0020_improve.sql — 못 한 요청 → 서비스 개선 고리(구현 4차 · 확인 대장 16차 개선-1 확인 · 원칙 98 · 39 · 57 · 59 · 72) · 멱등
--   XI ChatGEO 가 못 한 요청 · 3분 안에 같은 뜻으로 다시 물은 것 · 화면이 보낸 '도움 안 됐어요' · 확인 카드 취소 · 지도 동작 못 그림을 모아
--   비슷한 것끼리 묶고(자주 막히는 요청) → LX 가 채택 · 보류 · 이미 됨 → 만들어지면 물었던 사람 채팅창 맨 위에 '이제 됩니다' 한 줄.
--   개인정보: 대화 원문은 저장하지 않는다 — 요지 한 줄(지명 · 지번 · 사람 이름은 '○○'으로 가림)과 분류만.
--             누가 물었는지(improve_askers)와 알림(improve_notices)은 알림을 위해 90일만 두고 지운다(CPU 정기 작업 · landxi_api/improve.py purge).
--   improve_items    자주 막히는 요청 한 줄(묶음) — 상태(새로 옴 · 채택 · 만들어짐 · 보류 · 이미 됨) · 결정 기록
--   improve_signals  신호 한 번(막힘 · 다시 물음 · 도움 안 됨 · 확인 카드 취소 · 지도 못 그림) — 누가 물었는지는 없다(역할 · 화면 · 기관만)
--   improve_askers   그 묶음을 물었던 계정(알림용 · 90일)
--   improve_notices  '이제 됩니다' 한 줄(사람마다 · 본 때)
-- RLS: 기관 세션은 자기 기관 줄만(신호 · 알림) · 묶음 표는 LX 만 본다(목록은 LX 만 — 원칙 39 · 72). 실행: postgres(소유자) — migrate.py.

CREATE TABLE IF NOT EXISTS improve_items(
  id text PRIMARY KEY,                          -- ic_…
  no serial UNIQUE,                             -- 사람이 부르는 번호(개선 후보 #n — 확인 대장으로 옮길 때 표시)
  key text NOT NULL UNIQUE,                     -- 묶음 열쇠 = 분류 + 요지 낱말(정규화 · 가린 뒤)
  kind text NOT NULL,                           -- 분류(action · screen · nodata · scope · law · parcel · server · other)
  gist text NOT NULL,                           -- 대표 요지(가린 뒤 · 원문 아님)
  note text,                                    -- 한 줄 설명(점검에서 온 줄의 비고 등 · 가린 뒤)
  source text NOT NULL DEFAULT 'auto',          -- auto(저절로) | check-1001(10-01 점검)
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'adopted', 'built', 'held', 'already')),
  how text,                                     -- 제안 방법 한 줄(채택 때 · 없으면 분류의 기본 문구)
  ledger text,                                  -- 확인 대장과 잇기: 채택 = '확인 대기'(서버는 docs 를 고치지 않는다 — tools/review/pull-improvements.py)
  hold_reason text, hold_until date,            -- 보류(사유 · 다시 볼 날짜)
  already_text text, already_try text,          -- 이미 됨(안내 문구 한 줄 · 누르면 보낼 질문)
  notice_text text, notice_try text,            -- 이제 됩니다(보낸 한 줄 · 해 보기 질문)
  notice_n int, notice_at timestamptz, notice_by text,
  decided_by text, decided_at timestamptz,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS improve_items_state ON improve_items (state, last_at DESC);

CREATE TABLE IF NOT EXISTS improve_signals(
  id bigserial PRIMARY KEY,
  item_id text NOT NULL REFERENCES improve_items(id) ON DELETE CASCADE,
  sig text NOT NULL CHECK (sig IN ('blocked', 'reask', 'not_helpful', 'card_cancel', 'map_failed')),
  kind text NOT NULL,                           -- 이 한 번의 분류
  gist text,                                    -- 이 한 번의 요지(가린 뒤 · 예시 질문 자리)
  role text,                                    -- staff | admin | sales | tenant(역할 단위 — 사람 아님)
  screen text,                                  -- 화면 이름(사용자 말)
  tenant_id text NOT NULL,                      -- lx | 기관
  card_id text,                                 -- 어느 서비스(알 때만)
  sgg_cd text,                                  -- 지역 단위(시군구까지 · 화면에는 'n개 시군구' 수만)
  run_id text,                                  -- 어느 답(같은 답의 같은 신호는 한 번만)
  source text NOT NULL DEFAULT 'auto',          -- auto(서버) | screen(화면) | check-1001(10-01 점검)
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS improve_signals_item ON improve_signals (item_id, at DESC);
CREATE INDEX IF NOT EXISTS improve_signals_t ON improve_signals (tenant_id, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS improve_signals_run_sig ON improve_signals (run_id, sig) WHERE run_id IS NOT NULL;
-- 시험 표시(10-01 정리) — 점검 · 시험 계정이 만든 신호는 지우지 않고 test 로 표시해 목록 · 횟수에서 뺀다(감사 기록 'improve.mark_test')
ALTER TABLE improve_signals ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS improve_askers(
  item_id text NOT NULL REFERENCES improve_items(id) ON DELETE CASCADE,
  realm text NOT NULL,                          -- lx | tenant
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),        -- 마지막으로 물은 때 — 90일 지나면 지운다
  PRIMARY KEY (item_id, realm, user_id));
CREATE INDEX IF NOT EXISTS improve_askers_at ON improve_askers (at);
ALTER TABLE improve_askers ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;   -- 시험으로만 물은 사람 — '이제 됩니다'를 보내지 않는다

CREATE TABLE IF NOT EXISTS improve_notices(
  id text PRIMARY KEY,                          -- in_…
  item_id text REFERENCES improve_items(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'now_works' CHECK (kind IN ('now_works')),
  realm text NOT NULL, user_id text NOT NULL, tenant_id text NOT NULL,
  text text NOT NULL,                           -- "지난번에 물으신 '…'가 이제 됩니다."
  try text,                                     -- 해 보기 = 이 질문을 보낸다
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz);
CREATE INDEX IF NOT EXISTS improve_notices_who ON improve_notices (realm, user_id, seen_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['improve_signals', 'improve_askers', 'improve_notices'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS improve_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY improve_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx') WITH CHECK (tenant_id = current_setting('app.tenant_id', true) OR current_setting('app.realm', true) = 'lx')$p$, t);
  END LOOP;
  -- 묶음 표는 LX 만(기관 세션은 한 줄도 못 읽는다 — 서버가 기관에 신호를 남길 때는 LX 영역으로 쓴다)
  ALTER TABLE improve_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS improve_lx_only ON improve_items;
  CREATE POLICY improve_lx_only ON improve_items USING (current_setting('app.realm', true) = 'lx') WITH CHECK (current_setting('app.realm', true) = 'lx');
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON improve_items, improve_signals, improve_askers, improve_notices TO landxi_app, landxi_worker;
GRANT USAGE, SELECT ON SEQUENCE improve_items_no_seq, improve_signals_id_seq TO landxi_app, landxi_worker;
