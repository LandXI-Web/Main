/* LX 직원 왼쪽 메뉴(지도-1 ⓐ · 서비스카드-1 ⓐ · 원칙 149 — 대시보드 · 프로젝트 · 분석하기 · 지도 서비스 · XI맵 | 데이터 · 요청함) — 키트 메뉴 한 곳(kit/lx-menu.js)을 쓴다.
   키트 메뉴가 아직 없을 때만 같은 이름 · 같은 주소의 표로 대신한다(분석하기 · 서비스 카드 화면이 같이 쓴다). */
const at = (p) => new URL(p, import.meta.url).pathname;

export async function staffRail(current) {
  try {
    const m = await import('../kit/lx-menu.js');
    if (typeof m.staffMenu === 'function') return m.staffMenu(current);
  } catch { /* 키트 메뉴 전 — 아래 표 */ }
  const items = [
    { id: 'home', label: '대시보드', icon: 'home', href: at('../lx-console/') },
    { id: 'projects', label: '프로젝트', icon: 'folder', href: at('../lx-project/') },
    { id: 'analyze', label: '분석하기', icon: 'scan', href: at('../lx-analyze/') },
    { id: 'mapsvc', label: '지도 서비스', icon: 'map', href: at('../lx-map/') },
    { id: 'ximap', label: 'XI맵', glyph: 'XI', href: at('../xi-clean/') },
    { id: 'data', label: '데이터', icon: 'data', href: at('../lx-ingest/'), sep: true },
    { id: 'inbox', label: '요청함', icon: 'inbox', href: at('../lx-inbox/') },
  ];
  return { kind: 'menu', items, current: Math.max(0, items.findIndex((i) => i.id === current)) };
}
