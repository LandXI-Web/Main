-- 0030_card_groups 되돌리기 — 새 표 넷과 새 칸만 지운다(card_info.grp 는 그대로 남아 있어 옛 화면이 그대로 돈다). 실행: postgres(소유자) 로 직접.
DROP TABLE IF EXISTS card_group_log, card_group_requests, card_group_of, card_groups;
ALTER TABLE card_info DROP COLUMN IF EXISTS imagery_kinds;
DELETE FROM schema_migrations WHERE name = '0030_card_groups.sql';
