/* 기관 메뉴 한 곳(구현 2차 정리 · 화면 잇기 · 원칙 43 같은 일은 같은 모양 · 구현 5차 기관-1 ⓐ 메뉴 통일 · 18차 촬영-1 ⓑ '요청하기') — 기관 화면은 모두 이 메뉴를 쓴다:
     내 서비스 · 요청하기(분석 요청 · 촬영 요청 · 보낸 요청 탭 — 원칙 120) · (기관 관리자) 기관 정보 · 계정
   '우리 공간' 메뉴는 없앴다(18차 N-1 ⓐ — 결과 설명은 서비스 현황 · 결과 지도 카드, 내려받기는 통계·보고서 탭, 새 결과 알림은 머리의 종, 부서 배정은 계정 화면).
   메뉴 구조를 그 밖으로 바꾸지는 않는다(기관-1 다시 그리기는 검토 필요). 기관 정보 · 계정은 PC 레일 아래쪽(셸 end) · 휴대폰은 '메뉴' 안.
   주소는 이 파일 기준 상대 주소(사본 /Main/ 아래 · 기관 주소 {기관}.land-xi.dev 에서도 같은 출처). */
const at = (p) => new URL('../' + p, import.meta.url).href;

/** 셸 메뉴(rail) — who = 관문 결과 · current = 'list' | 'requests' | 'org' | 'accounts' · service = 요청 화면에 넘길 서비스(배포본 id) */
export function govRail({ who, current = 'list', service = null } = {}) {
  const mgr = who?.me?.realm === 'tenant' && who?.me?.role === 'manager';
  if (current === 'request' || current === 'sent') current = 'requests';
  const items = [
    { id: 'list', label: '내 서비스', icon: 'grid', href: at('gov-select/?list=1') },
    { id: 'requests', label: '요청하기', icon: 'deploy', href: at('gov-request/' + (service ? '?' + new URLSearchParams({ service }) : '')) },
  ];
  if (mgr) items.push({ id: 'org', label: '기관 정보', icon: 'org', href: at('gov-select/?view=org'), end: true, more: true },
    { id: 'accounts', label: '계정', icon: 'list', href: at('gov-accounts/'), end: true, more: true });
  return { kind: 'menu', items, current: Math.max(0, items.findIndex((i) => i.id === current)) };
}

/** 메뉴의 '요청하기' 주소를 서비스 하나로 좁힌다(서비스 대시보드에서 배포본을 알게 된 뒤) — 메뉴 표(rail)와 그려진 칸 둘 다 */
export function setRequestService(rail, railEl, service) {
  if (!service) return;
  const href = at('gov-request/?' + new URLSearchParams({ service }));
  const i = (rail?.items || []).findIndex((x) => x.id === 'requests');
  if (i < 0) return;
  rail.items[i].href = href;
  const a = railEl?.querySelector?.(`a.k-rail-i[data-i="${i}"]`);
  if (a) a.href = href;
}
