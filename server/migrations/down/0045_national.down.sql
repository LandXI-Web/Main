-- 0045_national 되돌리기 — 전국 결과 자산 장부만 지운다(결과 객체 detections 와 작업 jobs 는 그대로)
DROP TABLE IF EXISTS national_faces;
DROP TABLE IF EXISTS national_jobs;
DROP TABLE IF EXISTS national_cells;
DELETE FROM lx_settings WHERE key = 'national.run';
