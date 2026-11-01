-- 0140 점유의심 조사 카드 지움(11-01 PM "점유의심 조사 카드 기존은 삭제해야 한다" · 새 공공용지 무단점유 분석서비스로 대체) · 멱등.
--   지우기 전 확인(11-01): 이 카드로 돈 작업 0 · 배포 0 · 결과 0 · 피드백 0 · 공개 승인 0(상태 '검토').
--   걸린 줄: 카드 판 1(card-occupy@1.0) · 카드 정보 1 · 분야 연결 1. 이지목 현황(card-ijimok)은 그대로.
--   점유의심 목록 계산(landxi_api/occupy.py · /change/runs/{이지목}/occupy)은 남긴다 — 도로공사 XI ChatGEO site_report 가 읽는다.
--   카드 그림(02. 데이터/cards/card-occupy)은 _trash 로 옮긴다(파일 · 이 SQL 밖). 되돌리기: down/0140 + _trash 에서 되돌림.
SET LOCAL lock_timeout = '10s';
INSERT INTO audit_log(actor, realm, action, subject, before, after, at)
SELECT 'system:0140', 'lx', 'card.delete', 'card-occupy',
       jsonb_build_object('card', to_jsonb(c), 'versions', (SELECT jsonb_agg(to_jsonb(v)) FROM card_versions v WHERE v.card_id='card-occupy'),
                          'info', (SELECT to_jsonb(i) FROM card_info i WHERE i.card_id='card-occupy'),
                          'groups', (SELECT jsonb_agg(to_jsonb(g)) FROM card_group_of g WHERE g.card_id='card-occupy')),
       jsonb_build_object('note', '지움 — 공공용지 무단점유 분석서비스로 대체(11-01 PM)'), now()
FROM cards c WHERE c.id='card-occupy';
DELETE FROM card_group_of WHERE card_id='card-occupy';
DELETE FROM card_info WHERE card_id='card-occupy';
DELETE FROM card_versions WHERE card_id='card-occupy';
DELETE FROM cards WHERE id='card-occupy';
