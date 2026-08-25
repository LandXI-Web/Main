// Land-XI 실태조사 → AI 분석 서비스 전환 대상 (컨트롤러 확정, id 고정값 — 후속 태스크 의존)
export const SURVEYS = [
  { id: 'farmland', ministry: '농식품부', name: '농지이용 실태조사', method: '현장 인력', cycle: '연 1회', service: '농지 활용 분석', color: '#7C4DFF', layerId: 'survey-farmland' },
  { id: 'greenbelt', ministry: '국토부', name: '개발제한구역 실태조사', method: '현장 인력', cycle: '연 2회', service: '개발제한구역 위반 탐지', color: '#00897B', layerId: 'survey-greenbelt' },
  { id: 'trash', ministry: '환경부', name: '방치쓰레기 실태조사', method: '현장 인력', cycle: '분기 1회', service: '방치 쓰레기 탐지', color: '#8D6E63', layerId: 'survey-trash' },
  { id: 'incinerator', ministry: '환경부', name: '불법소각장 실태조사', method: '현장 인력', cycle: '분기 1회', service: '불법소각 탐지', color: '#AD1457', layerId: 'survey-incinerator' },
  { id: 'marine', ministry: '해수부', name: '해양쓰레기 실태조사', method: '현장 인력', cycle: '연 4회', service: '해양쓰레기 탐지', color: '#00ACC1', layerId: 'survey-marine' },
  { id: 'greenhouse', ministry: '농식품부·지자체', name: '비닐하우스 실태조사', method: '현장 인력', cycle: '연 1회', service: '비닐하우스 탐지', color: '#FBC02D', layerId: 'survey-greenhouse' },
  { id: 'pothole', ministry: '국토부·지자체', name: '도로안전(포트홀) 실태조사', method: '현장 인력', cycle: '월 1회', service: '도로안전 정사영상', color: '#455A64', layerId: 'survey-pothole' },
];

// 현장 실태조사 대 XI-VFM AI 분석 비교 카운터 (홈 파이프라인 섹션용)
export const SURVEY_COUNTERS = {
  field: { teams: '7팀', months: '12개월', coverage: '표본', formats: '7개 양식' },
  ai: { teams: '1팀 + 검증', months: '3주', coverage: '전수', formats: '1개 공간DB' },
};
