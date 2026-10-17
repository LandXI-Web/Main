-- 0107_user_prefs 되돌리기 — 사용자 설정 · 내 일정 표만 지운다(audit_log 는 그대로)
DROP TABLE IF EXISTS user_events;
DROP TABLE IF EXISTS user_prefs;
