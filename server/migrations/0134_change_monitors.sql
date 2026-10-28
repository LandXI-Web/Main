-- 0134_change_monitors.sql — 상시 모니터링 대상지 등록(10-28 지시서 v5 §3-8 · §4-5) · 멱등
--   등록 · 상태 표시까지만(실제 스케줄 실행 없음 — '다음 영상이 나오면 자동 분석'은 등록해 둔 표시). 대시보드 · 프로젝트가 같은 줄을 읽는다.
-- 되돌리기: migrations/down/0134_change_monitors.down.sql
SET LOCAL lock_timeout = '10s';
CREATE TABLE IF NOT EXISTS change_monitors (
  range_id    text NOT NULL REFERENCES change_ranges(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  tenant_id   text NOT NULL DEFAULT 'lx',
  on_at       timestamptz NOT NULL DEFAULT now(),
  off_at      timestamptz,
  PRIMARY KEY (range_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON change_monitors TO landxi_app, landxi_worker;
