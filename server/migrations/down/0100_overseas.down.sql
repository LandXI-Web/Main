-- 0100_overseas 되돌리기 — 해외 결과 장부만 지운다(결과 묶음 파일 · 작업 jobs 는 그대로)
DROP TABLE IF EXISTS overseas_faces;
DROP TABLE IF EXISTS overseas_jobs;
DROP TABLE IF EXISTS overseas_cells;
DELETE FROM lx_settings WHERE key = 'overseas.run';
