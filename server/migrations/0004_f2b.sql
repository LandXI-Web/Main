-- Land-XI 0004_f2b — F2-B(실추론 백엔드 v2 · 계약 v1.1) 추가 스키마. 멱등(IF NOT EXISTS).
-- 0002_survey(F2-S) · 0003_agent(F2-E) 는 예약 번호 — migrate.py 가 번호순으로 전부 적용한다.

-- v1.1-6: job.done 두 줄 실측(chips_per_gpu_s · chips_per_wall_s · gpu_s · elapsed) 을 GET /jobs/{id} 가 그대로 돌려주도록
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS perf jsonb;
-- v1.1-15: 재부팅 복구 기록(mode · shards_done/total · reason · at)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recovered jsonb;

-- v1.1-19: 이름 붙은 게시 세트 → job_id 별칭(results/lx/{publish_as} → detections(job_id))
CREATE TABLE IF NOT EXISTS published_sets(
  set_id text PRIMARY KEY, job_id text NOT NULL, tenant_id text, path text, n int,
  published_at timestamptz DEFAULT now());

-- v1.1-20: /results/{set}/index 조회
CREATE INDEX IF NOT EXISTS index_results_job ON index_results (job_id, shard_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON published_sets TO landxi_app, landxi_worker;
