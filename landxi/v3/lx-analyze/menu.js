/* LX 직원 왼쪽 메뉴(10차 메뉴-1 ⓐ — 홈 · 프로젝트 · 분석하기 · 서비스 카드 · 데이터 · 요청함) — 키트 메뉴 한 곳(kit/lx-menu.js)을 쓴다.
   키트 메뉴가 아직 없을 때만 같은 이름 · 같은 주소의 표로 대신한다(분석하기 · 서비스 카드 화면이 같이 쓴다). */
const at = (p) => new URL(p, import.meta.url).pathname;

export async function staffRail(current) {
  try {
    const m = await import('../kit/lx-menu.js');
    if (typeof m.staffMenu === 'function') return m.staffMenu(current);
  } catch { /* 키트 메뉴 전 — 아래 표 */ }
  const items = [
    { id: 'home', label: '대시보드', icon: 'home', href: at('../lx-console/') },
    { id: 'projects', label: '프로젝트', icon: 'list', href: at('../lx-project/') },
    { id: 'analyze', label: '분석하기', icon: 'grid', href: at('../lx-analyze/') },
    { id: 'cards', label: '서비스 카드', icon: 'report', href: at('../lx-cards/') },
    { id: 'data', label: '데이터', icon: 'data', href: at('../lx-ingest/') },
    { id: 'inbox', label: '요청함', icon: 'inbox', href: at('../lx-inbox/') },
  ];
  return { kind: 'menu', items, current: Math.max(0, items.findIndex((i) => i.id === current)) };
}
