-- 0127_change_service.sql — 국토 변화를 분석 서비스 카드 안에서(10-23 원칙 329) · 멱등
--   change_runs.src_key : 시점마다 영상 출처(국토지리정보원 해 · 등록 영상) — 같은 대상지 · 같은 두 해라도 출처가 다르면 다른 결과(캐시 열쇠)
--   change_runs.sources : 시점별 출처 {a:{kind, year, id?, name}, b:{…}} — 화면 · 보고서 글
--   change_ranges.origin: 'project'(예전 새 프로젝트 창) · 'card'(분석 서비스 카드에서 올린 대상지)
-- 기존 줄은 그대로(src_key NULL = 국토지리정보원 두 해 · origin NULL = 예전 프로젝트 대상지).
-- 되돌리기: migrations/down/0127_change_service.down.sql
SET LOCAL lock_timeout = '10s';
ALTER TABLE change_runs ADD COLUMN IF NOT EXISTS src_key text;
ALTER TABLE change_runs ADD COLUMN IF NOT EXISTS sources jsonb;
ALTER TABLE change_ranges ADD COLUMN IF NOT EXISTS origin text;
