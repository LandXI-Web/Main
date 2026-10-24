-- 0130_range_ledger.sql — 분석 구간 설정하기(10-24 사용자 "분석 구간 설정하기 … 구간을 업로드 하거나 행정 구역을 설정 … 분석 서비스 카드 모두") · 멱등
--   구간은 국토 변화 대상지 표(change_ranges) 한 곳에 둔다(원칙 320 · 장부 하나) — 모든 분석 서비스 카드가 같은 표를 쓴다.
--   change_ranges.codes : 행정구역 구간의 시군구 · 읍면동 코드(같은 코드 구간을 다시 만들지 않고 다시 쓴다)
--   range_counts        : 결과 × 구간 안/밖 · 필지 집계를 한 번 세고 다시 쓰는 장부(열쇠 = 작업 · 구간 · 도구 · 값)
-- 되돌리기: migrations/down/0130_range_ledger.down.sql
SET LOCAL lock_timeout = '10s';

ALTER TABLE change_ranges ADD COLUMN IF NOT EXISTS codes text[];
CREATE INDEX IF NOT EXISTS change_ranges_codes ON change_ranges USING gin (codes);

CREATE TABLE IF NOT EXISTS range_counts (
  job_id     text NOT NULL,
  range_id   text NOT NULL REFERENCES change_ranges(id) ON DELETE CASCADE,
  tool       text NOT NULL,                 -- split(안/밖) · parcels(필지 집계)
  val        text NOT NULL DEFAULT '',      -- 도구 값(예: 겹침 기준)
  stamp      text NOT NULL DEFAULT '',      -- 결과 판(지운 결과 수 · 끝난 시각) — 바뀌면 다시 센다
  out        jsonb NOT NULL,
  at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, range_id, tool, val)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON range_counts TO landxi_app, landxi_worker;
