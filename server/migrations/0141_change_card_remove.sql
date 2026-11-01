-- 0141 국토 변화 분석서비스 카드 지움(11-01 PM "3. 국토 변화 분석 서비스는 삭제한다") · 멱등.
--   카드만 지운다. 남기는 것: 변화 계산 코드(server/change · 'card-change' 기본 틀) · 모델 change-ap25 · unsupervised-change ·
--   이 카드로 돈 작업 32(완료 24)과 결과(대상지 11곳 — 동충동 · 담양IC · 광산구 · 안성 등 · XI ChatGEO 대상지 도구 site_report · 점유의심 계산이 읽음) ·
--   기관 공유 줄(card_shares · share_history — 도로공사 기관의 대상지 공유 change_shares 가 이 줄을 읽음) · 감시 등록(change_monitors).
--   산사태 취약지역 · 이지목 현황 · 공공용지 무단점유 카드는 같은 변화 틀을 쓰지만 이 카드 줄과는 무관(자기 판 · 모델).
--   지우는 줄: 카드 판 2(card-change@1.0 · @2.0) · 카드 정보 1(그림 포함 · 파일은 _trash 로 · 이 SQL 밖) · 분야 연결 1 · 카드 분류 4 ·
--   되돌린 배포본 1(dp-nw-change · 남원 · stage rolled_back · 결과 없음 — 카드 판을 가리켜 먼저 지워야 함).
--   되돌리기: audit_log 'card.delete'(system:0141) 의 before 값으로 다시 넣는다.
SET LOCAL lock_timeout = '10s';
INSERT INTO audit_log(actor, realm, action, subject, before, after, at)
SELECT 'system:0141', 'lx', 'card.delete', 'card-change',
       jsonb_build_object('card', to_jsonb(c), 'versions', (SELECT jsonb_agg(to_jsonb(v)) FROM card_versions v WHERE v.card_id='card-change'),
                          'info', (SELECT to_jsonb(i) FROM card_info i WHERE i.card_id='card-change'),
                          'groups', (SELECT jsonb_agg(to_jsonb(g)) FROM card_group_of g WHERE g.card_id='card-change'),
                          'classes', (SELECT jsonb_agg(to_jsonb(k)) FROM card_classes k WHERE k.card_id='card-change'),
                          'deploys', (SELECT jsonb_agg(to_jsonb(d)) FROM deploys d WHERE d.card_id='card-change')),
       jsonb_build_object('note', '지움 — 국토 변화 분석서비스 카드(11-01 PM) · 계산 코드 · 모델 · 결과 · 기관 공유 줄은 남김'), now()
FROM cards c WHERE c.id='card-change';
DELETE FROM deploys WHERE card_id='card-change' AND stage='rolled_back' AND snapshot_current IS NULL;
DELETE FROM card_classes WHERE card_id='card-change';
DELETE FROM card_group_of WHERE card_id='card-change';
DELETE FROM card_info WHERE card_id='card-change';
DELETE FROM card_versions WHERE card_id='card-change' AND NOT EXISTS (SELECT 1 FROM deploys d WHERE d.card_id='card-change');
DELETE FROM cards WHERE id='card-change' AND NOT EXISTS (SELECT 1 FROM deploys d WHERE d.card_id='card-change');
