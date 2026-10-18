-- 0111_farm_report_rules 되돌리기 — 보고서 발급 목록 · 서비스 × 시군구 보이기 규칙을 지운다.
-- 규칙 표를 지우면 곤포사일리지 보령 결과가 XI맵 · 실적 숫자 · 외부 API 에 다시 보인다(결과 자체는 지운 적 없음).
-- 규칙 하나만 되돌리려면: DELETE FROM service_region_rules WHERE sgg_cd='44180' AND card_id IN (SELECT id FROM cards WHERE name->>'ko' LIKE '곤포사일리지%');
DROP TABLE IF EXISTS report_issues;
DROP TABLE IF EXISTS service_region_rules;
