-- 0124_change_detect 되돌리기 — 변화 탐지 표만 지운다(다른 표는 건드리지 않음)
DROP TABLE IF EXISTS change_mark_log;
DROP TABLE IF EXISTS change_marks;
DROP TABLE IF EXISTS change_shares;
DROP TABLE IF EXISTS change_runs;
DROP TABLE IF EXISTS change_ranges;
