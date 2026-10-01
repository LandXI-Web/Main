/* 기관 메뉴 한 곳(구현 2차 정리 · 화면 잇기 · 원칙 43 같은 일은 같은 모양 · 구현 5차 기관-1 ⓐ 메뉴 통일) — 기관 화면은 모두 이 메뉴를 쓴다:
     내 서비스 · 분석 요청(지금 서비스가 있으면 ?service=) · 보낸 요청(검토 요청 목록) · 우리 공간 · (기관 관리자) 기관 정보 · 계정
   시안(design-r8/gov-design)처럼 기관 정보 · 계정은 PC 레일 아래쪽에 모으고(셸 end), 휴대폰은 아래 탭 다섯(넷 + '메뉴' — 기관 정보 · 계정은 메뉴 안).
   '분석 의뢰'가 아니라 '분석 요청'(원칙 113 · 기관-5). '우리 공간'은 N-1~3 답이 올 때까지 그대로 둔다.
   주소는 이 파일 기준 상대 주소(사본 /Main/ 아래 · 기관 주소 {기관}.land-xi.dev 에서도 같은 출처). */
const at = (p) => new URL('../' + p, import.meta.url).href;

/** 셸 메뉴(rail) — who = 관문 결과 · current = 'list' | 'request' | 'sent' | 'space' | 'org' | 'accounts' · service = 요청 화면에 넘길 서비스(배포본 id) */
export function govRail({ who, current = 'list', service = null } = {}) {
  const mgr = who?.me?.realm === 'tenant' && who?.me?.role === 'manager';
  const items = [
    { id: 'list', label: '내 서비스', icon: 'grid', href: at('gov-select/?list=1') },
    { id: 'request', label: '분석 요청', icon: 'deploy', href: at('gov-request/' + (service ? '?' + new URLSearchParams({ service }) : '')) },
    { id: 'sent', label: '보낸 요청', icon: 'inbox', href: at('gov-select/?list=1&review=all') },
    { id: 'space', label: '우리 공간', icon: 'folder', href: at('gov-space/') },   // 받은 1차 서비스의 결과 설명서 · 내려받기(구현 3차 · 13차 분기-2)
  ];
  if (mgr) items.push({ id: 'org', label: '기관 정보', icon: 'org', href: at('gov-select/?view=org'), end: true, more: true },
    { id: 'accounts', label: '계정', icon: 'list', href: at('gov-accounts/'), end: true, more: true });
  return { kind: 'menu', items, current: Math.max(0, items.findIndex((i) => i.id === current)) };
}

/** 메뉴의 '분석 요청' 주소를 서비스 하나로 좁힌다(서비스 대시보드에서 배포본을 알게 된 뒤) — 메뉴 표(rail)와 그려진 칸 둘 다 */
export function setRequestService(rail, railEl, service) {
  if (!service) return;
  const href = at('gov-request/?' + new URLSearchParams({ service }));
  const i = (rail?.items || []).findIndex((x) => x.id === 'request');
  if (i < 0) return;
  rail.items[i].href = href;
  const a = railEl?.querySelector?.(`a.k-rail-i[data-i="${i}"]`);
  if (a) a.href = href;
}
