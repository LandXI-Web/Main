// 전국 공공 분석 서비스 라인업 13종.
// real:true 4종은 실제 보유 자산(영상·AI 결과)에 기반한다 — 해양쓰레기(전남), 농지이용·불법건축물(제주),
// 도로안전(남원), 드론 변화탐지(국산리). 나머지 9종은 라인업 소개용 예시 수치다.
// color 는 토큰 변수명 문자열이며 하드코딩된 색을 쓰지 않는다.
export const SERVICES = [
  { id: 'marine', name: '해양쓰레기 실태조사', ministry: '해양수산부', lnglat: [126.2, 35.1], count: 38057, unit: '건', lastRun: '2026-08-12', real: true, story: 'marine', color: 'var(--ai)' },
  { id: 'farmland', name: '농지이용·불법건축물', ministry: '농림축산식품부', lnglat: [126.822, 33.507], count: 2418, unit: '필지', lastRun: '2026-07-30', real: true, story: 'jeju', color: 'var(--s-done)' },
  { id: 'pothole', name: '도로안전 다시점 조사', ministry: '국토교통부', lnglat: [127.39, 35.41], count: 1264, unit: '건', lastRun: '2026-08-19', real: true, story: 'namwon', color: 'var(--lx)' },
  { id: 'change', name: '드론 변화탐지', ministry: 'LX 한국국토정보공사', lnglat: [126.983, 35.832], count: 486, unit: '건', lastRun: '2026-08-05', real: true, story: 'kuksan', color: 'var(--lx)' },
  { id: 'greenbelt', name: '개발제한구역 훼손', ministry: '국토교통부', lnglat: [127.05, 37.45], count: 912, unit: '건', lastRun: '2026-06-24', real: false, story: 'generic', color: 'var(--lx)' },
  { id: 'solar', name: '태양광 설비 현황', ministry: '산업통상자원부', lnglat: [126.55, 36.75], count: 3140, unit: '개소', lastRun: '2026-05-18', real: false, story: 'generic', color: 'var(--s-doing)' },
  { id: 'feedcrop', name: '사료작물 재배지', ministry: '농림축산식품부', lnglat: [128.45, 36.55], count: 1785, unit: '필지', lastRun: '2026-06-02', real: false, story: 'generic', color: 'var(--s-done)' },
  { id: 'incinerator', name: '불법 소각시설', ministry: '환경부', lnglat: [127.15, 36.35], count: 274, unit: '개소', lastRun: '2026-07-11', real: false, story: 'generic', color: 'var(--ai)' },
  { id: 'building', name: '건축물 변화 탐지', ministry: '국토교통부', lnglat: [129.3, 36.05], count: 5620, unit: '동', lastRun: '2026-07-22', real: false, story: 'generic', color: 'var(--lx)' },
  { id: 'silage', name: '곤포 사일리지 집계', ministry: '농림축산식품부', lnglat: [127.75, 35.85], count: 8934, unit: '개', lastRun: '2026-06-15', real: false, story: 'generic', color: 'var(--s-done)' },
  { id: 'trash', name: '방치폐기물 탐지', ministry: '환경부', lnglat: [128.6, 35.87], count: 631, unit: '개소', lastRun: '2026-07-03', real: false, story: 'generic', color: 'var(--ai)' },
  { id: 'river', name: '하천 불법점용', ministry: '환경부', lnglat: [128.95, 35.2], count: 358, unit: '건', lastRun: '2026-05-29', real: false, story: 'generic', color: 'var(--ai)' },
  { id: 'greenhouse', name: '비닐하우스 현황', ministry: '농림축산식품부', lnglat: [128.1, 34.95], count: 12470, unit: '동', lastRun: '2026-08-01', real: false, story: 'generic', color: 'var(--s-done)' },
];

export const serviceById = id => SERVICES.find(s => s.id === id) || null;
