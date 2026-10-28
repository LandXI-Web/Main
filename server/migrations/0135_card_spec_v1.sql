-- 0135_card_spec_v1.sql — 분석 서비스 카드 명세 v1(E:\도로공사\service_card_spec_v1.md · PM 10-24) 글 칸 · 멱등
--   ① 국토 변화: 조건·시점 '같은 대상지 두 시점 · 1년 이상 간격 권장' · 입력 영상에 해상도
--   ② 이지목 현황: 한 줄 · 입력 영상 · 시점 · 찾는 것(gpkg 7층 이름)
--   ③ 점유의심 조사: 한 줄 · 입력(영상 아님 — 결과 레이어 2종 + 연속지적도 + 소유구분) · 찾는 것
--   숫자(결과 예시 · 걸리는 시간 · 대상 지역)는 여기서 쓰지 않는다 — 실제 결과 · 작업 기록에서 서버가 센다.
SET LOCAL lock_timeout = '10s';
UPDATE card_info SET timepoints = '같은 대상지 두 시점 · 1년 이상 간격 권장',
       imagery = '시점마다 하나 — 국토지리정보원 항공정사영상(연도별 · 25~51cm) · 공유 데이터 · 내 영상', updated_by = 'system:spec-v1'
 WHERE card_id = 'card-change';
UPDATE card_info SET line = '영상을 토지피복 AI로 읽어 지적 지목과 실제 이용을 필지마다 대조하고, 지목이 정리되지 않은 필지와 실제와 다른 필지를 찾습니다',
       imagery = '항공 25~51cm · 1시점 — 국토지리정보원(연도) · 공유 데이터 · 내 영상', timepoints = '1시점(최신 연도 권장)',
       finds = '정상 · 미확정(나지초지) · 지목미정리 · 점유의심 · 유휴산림화 · 수역구거 · 기타', compare = '연속지적도 지목 · 토지마스터 용도(자동 연결)',
       updated_by = 'system:spec-v1'
 WHERE card_id = 'card-ijimok';
UPDATE card_info SET line = '변화 탐지와 이지목 결과 중 구역선 안 점유 의심 필지를 모아 소유구분 · 지목 · 면적과 함께 목록으로 만들고, 현장점검 · 판정 · 보고서까지 이어집니다',
       imagery = '영상 아님 — 결과 레이어 2종(국토 변화 · 이지목 현황) + 연속지적도 + 소유구분', timepoints = '근거 결과의 시점',
       finds = '점유의심 필지 목록 · 필지마다 판정 상태', compare = '규칙 기반 교차(AI 학습 없음)',
       updated_by = 'system:spec-v1'
 WHERE card_id = 'card-occupy';
UPDATE cards SET intro = jsonb_set(coalesce(intro, '{}'::jsonb), '{line}', to_jsonb((SELECT line FROM card_info WHERE card_id = cards.id)))
 WHERE id IN ('card-ijimok', 'card-occupy');
