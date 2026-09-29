-- core-flow(2026-09-29) · 관리-생산-서비스 한 흐름: 배포본 = 적용 → 결재 → 영상 → AI 분석 → 실태조사 → 결과.
-- 추가만(기존 열 이름·자료 그대로). 멱등.
--   deploys.flow      흐름 상태 한 곳(jsonb) — {state, job_id, survey_job_id, imagery_id, model_id, reason, todo, steps[], updated_at}
--                     state: approval(결재 대기) · need_imagery(영상 등록 필요) · analyzing(AI 분석) · surveying(실태조사) · done · failed
--   deploys.sgg_cd    0004 에서 추가됨 — 새 배포본은 필수(국내). 기존 배포본은 seed/backfill_deploy_sgg.py 1회 백필.
ALTER TABLE deploys ADD COLUMN IF NOT EXISTS flow jsonb;
CREATE INDEX IF NOT EXISTS deploys_flow_state ON deploys ((flow->>'state'));
CREATE INDEX IF NOT EXISTS jobs_deploy ON jobs (deploy_id, created_at);
CREATE INDEX IF NOT EXISTS usage_events_job ON usage_events (job_id);
