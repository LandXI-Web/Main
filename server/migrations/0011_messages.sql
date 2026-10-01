-- 0011 검토 요청 · 메시지 · 알림(구현 2차 · 확인 대장 6차 GF-6 '검토 요청' · 알림-1 · 원칙 50 · 63 · 72 · 73)
-- 요청 한 건 = feedback 한 행(kind 'review'). 지금까지의 feedback(오탐 신고 · 기관 판정 기록 · 영상 등록 요청)은 지우지 않고 같은 표에 이어 쓴다.
-- 주고받기 = review_messages(요청 하나에 짧은 말 여러 줄 · 기관 ↔ LX) · 알림 = review_reads(사람마다 그 대화를 마지막으로 본 때).
-- 받는 사람 = 그 서비스 카드의 담당 LX 직원(cards.owner_id · 없으면 공개 요청한 직원) · 없으면 LX 관리자(recipient_id NULL).
-- LX 관리자는 모든 요청 · 대화를 본다(서버 messages.py). 멱등(IF NOT EXISTS · DROP POLICY IF EXISTS). 실행: postgres(소유자) — migrate.py.

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS sender_id text;        -- 보낸 사람(tenant_users.id)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS card_id text;          -- 어느 서비스로 온 요청인가
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS deploy_id text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS recipient_id text;     -- 담당 LX 직원(lx_users.id) · NULL = LX 관리자가 받음
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status text;           -- 검토 요청: sent(보냄) · seen(확인 중) · answered(답변)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS verdict text;          -- LX 판정(선택): ok(맞음) · ai_error(AI 오류) · unknown(모름)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ctx jsonb;             -- 요청 때 저절로 붙는 것(필지 주소 · 지목 · 면적 · AI 결과 · 서비스 이름)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE INDEX IF NOT EXISTS feedback_review_to ON feedback (recipient_id, updated_at DESC) WHERE kind = 'review';
CREATE INDEX IF NOT EXISTS feedback_review_from ON feedback (sender_id, updated_at DESC) WHERE kind = 'review';
CREATE INDEX IF NOT EXISTS feedback_review_at ON feedback (updated_at DESC) WHERE kind = 'review';

-- 서비스 카드의 담당 LX 직원 칸(카드를 만든 · 공개 요청한 직원). 비어 있으면 서버가 공개 요청 기록에서 찾고, 그래도 없으면 LX 관리자.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS owner_id text;

CREATE TABLE IF NOT EXISTS review_messages(
  id text PRIMARY KEY,
  request_id text NOT NULL,                  -- feedback.id(kind 'review')
  tenant_id text NOT NULL,                   -- 요청한 기관(RLS)
  author_id text NOT NULL,
  author_realm text NOT NULL CHECK (author_realm IN ('lx', 'tenant')),
  author_role text,
  body text NOT NULL DEFAULT '',
  verdict text CHECK (verdict IS NULL OR verdict IN ('ok', 'ai_error', 'unknown')),
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS review_messages_req ON review_messages (request_id, at);

CREATE TABLE IF NOT EXISTS review_reads(
  request_id text NOT NULL,
  reader text NOT NULL,                      -- '{realm}:{user_id}'
  tenant_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, reader));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['review_messages', 'review_reads'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS lx_tenant_isolation ON %I', t);
    EXECUTE format($p$CREATE POLICY lx_tenant_isolation ON %I USING (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx') WITH CHECK (tenant_id = (SELECT current_setting('app.tenant_id', true)) OR (SELECT current_setting('app.realm', true)) = 'lx')$p$, t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON review_messages, review_reads TO landxi_app, landxi_worker;
