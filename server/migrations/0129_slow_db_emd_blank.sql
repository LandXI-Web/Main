-- 0129_slow_db_emd_blank.sql — 읍면동 빈칸 채우기(workers/postprocess.fill_blank · 게이트웨이 주기 작업)가 빈칸 몇 줄을 찾으려고
--   detections 162만 줄을 매번 다 훑던 것(평균 0.5초 · 최장 13초 · 10-23 slow-db-1023) → 빈칸 줄만 담은 작은 색인. 색인만 더함(자료 그대로) · 멱등.
--   운영 DB 는 10-23 에 조각(파티션)마다 CONCURRENTLY 로 먼저 만들어 붙였다(이 파일은 새 설치 · 시험 DB 용 — 있으면 건너뜀).
--   되돌리기: migrations/down/0129_slow_db_emd_blank.down.sql
CREATE INDEX IF NOT EXISTS detections_emd_blank ON detections (job_id) WHERE (emd IS NULL OR emd = '');
