-- 0107_user_prefs.sql — 개인별 맞춤 대시보드(10-17 원칙 280 · 283) · 멱등
--   user_prefs   사용자 설정 한 사람 · 화면(열쇠)마다 JSON 하나 — 대시보드 칸 배치 · XI맵 통계 판 자리처럼 '사람마다 기억'하는 것 전부.
--                열쇠(screen)는 화면 이름 또는 화면.부분(예: dash.lx-console · lx-map.stats). 값은 화면이 정한다(서버는 보관만 · 32KB).
--   user_events  내 일정(달력 칸) — 직접 적는 일정 한 줄(제목 · 날짜 · 시각(선택) · 메모(선택)). 그 사람만 본다.
--   두 표 모두 계정 = (realm, tenant_id, user_id) — LX 계정 · 기관 계정 모두 쓸 수 있다. audit_log 는 건드리지 않는다.
-- 되돌리기: migrations/down/0107_user_prefs.down.sql
CREATE TABLE IF NOT EXISTS user_prefs(
  realm text NOT NULL,                               -- lx · tenant
  tenant_id text NOT NULL DEFAULT '',                -- 기관 계정의 기관(LX 계정은 '')
  user_id text NOT NULL,                             -- lx_users.id · tenant_users.id
  screen text NOT NULL,                              -- 열쇠(화면 · 화면.부분) 80자
  value jsonb NOT NULL,                              -- 화면이 정한 JSON
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm, tenant_id, user_id, screen));

CREATE TABLE IF NOT EXISTS user_events(
  id text PRIMARY KEY,                               -- ev_…
  realm text NOT NULL,
  tenant_id text NOT NULL DEFAULT '',
  user_id text NOT NULL,
  title text NOT NULL,                               -- 한 줄(80자)
  day date NOT NULL,                                 -- 날짜
  at_time text,                                      -- 'HH:MM'(선택)
  note text,                                         -- 메모(선택 · 300자)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS user_events_who_day ON user_events (realm, tenant_id, user_id, day);

ALTER TABLE user_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS who_only ON user_prefs;
CREATE POLICY who_only ON user_prefs USING (current_setting('app.realm', true) IN ('lx', 'tenant'))
  WITH CHECK (current_setting('app.realm', true) IN ('lx', 'tenant'));
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS who_only ON user_events;
CREATE POLICY who_only ON user_events USING (current_setting('app.realm', true) IN ('lx', 'tenant'))
  WITH CHECK (current_setting('app.realm', true) IN ('lx', 'tenant'));

GRANT SELECT, INSERT, UPDATE, DELETE ON user_prefs TO landxi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_events TO landxi_app;
