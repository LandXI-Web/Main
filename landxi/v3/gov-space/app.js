/* gov-space — 옛 '우리 공간' 주소(구현 3차 · 13차 분기-2). 확인 대장 18차 N-1 ⓐ 로 메뉴에서 없앴다 — 거기 있던 네 가지는 서비스 안으로:
     결과 설명  → 서비스 대시보드 현황 '이 결과는'(+ '자세히' 서랍) · 결과 지도의 '보고 있는 결과' 카드
     내려받기   → 서비스 대시보드 '통계·보고서' 탭 한 곳(처음 한 번 이용 약속 · 누가 받았는지는 '이력' 탭)
     새 결과 알림 → 머리의 종 + 메일 한 줄(메일 설정이 있을 때)
     부서 배정  → 계정 화면에서 사람마다 '볼 수 있는 서비스'
   옛 주소로 오면 같은 자리로 보낸다(?card= → 그 서비스의 통계·보고서 탭 · 없으면 내 서비스). 서버(GET /spaces/me · …/guides · …/download)는 그대로 쓴다.
   결과 설명서 부품(guide.js · gov-space.css)은 대시보드 · 결과 지도가 같이 쓴다. */
const card = new URLSearchParams(location.search).get('card');
location.replace(new URL('../gov-select/' + (card ? '?' + new URLSearchParams({ service: card, tab: 'stats' }) : '?list=1'), import.meta.url).href);
