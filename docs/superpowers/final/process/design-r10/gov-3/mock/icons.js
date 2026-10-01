/* 시안용 아이콘 — 실제 키트 shell.js 의 ICON 과 같은 선 아이콘(20×20). 화면 코드는 건드리지 않는다. */
const ICON = {
  home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>',
  proj: '<path d="M3 5h5l2 2h7v9H3z"/>',
  analyze: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
  card: '<path d="M3 4h14v12H3z M3 8h14"/>',
  data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>',
  map: '<path d="M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11"/>',
  menu: '<path d="M3 5h14 M3 10h14 M3 15h14"/>',
  ask: '<path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/>',
  me: '<circle cx="10" cy="7" r="3.5"/><path d="M3.5 17c.8-3 3.3-4.5 6.5-4.5s5.7 1.5 6.5 4.5"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M7.8 8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .8-1 1.5 M10 14h.01"/>',
  exit: '<path d="M8 3H4v14h4 M12 6l4 4-4 4 M16 10H7"/>',
  bell: '<path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 2H3.5z M8.5 17.5a1.5 1.5 0 0 0 3 0"/>',
  upload: '<path d="M10 14V5 M6.5 8.5L10 5l3.5 3.5 M4 14v3h12v-3"/>',
  send: '<path d="M3 10l14-6-4 13-3-5z M10 12l7-8"/>',
  info: '<circle cx="10" cy="10" r="7.5"/><path d="M10 9v5 M10 6.5h.01"/>',
  cloud: '<path d="M6 16h8.5a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 6 16z"/>',
};
if (new URLSearchParams(location.search).get('full')) document.documentElement.dataset.full = '1';   // 전체 페이지 캡처 — 고정 하단 탭은 숨김(실제 화면에서는 아래 고정)
window.mIcon = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k] || ''}</svg>`;
document.querySelectorAll('[data-ic]').forEach((el) => { el.insertAdjacentHTML('afterbegin', window.mIcon(el.dataset.ic)); });
