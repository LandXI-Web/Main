/* 서비스 지원 공통 — 셸 올리기 · URL 상태 · 첨부 행 · 진입 스태거. (B6 구현, 채택안 = 선택 2 "분할 열람")
   페이지 모듈: support-notice.js · support-faq.js · support-contact.js · support-usecase.js · support-manual.js */
import { mountShell, TABS, say, icon, esc, $, $$ } from './shell.js';
import { AS_OF } from './support-data.js';

export const SUBS = {
  notice: '주요 운영 공지 및 업데이트 소식을 확인하세요',
  faq: 'Land-XI 사용 중 자주 발생하는 질문과 답변을 확인하세요',
  contact: '내가 등록한 문의와 답변 현황을 확인할 수 있습니다.',
  usecase: '실제 현장에서 활용된 사례를 확인하세요',
  manual: '서비스 이용에 필요한 사용 방법을 확인해 보세요.',
};
const LABEL = Object.fromEntries(TABS.support.map((t) => [t.key, t.label]));

/* 서비스 지원은 **로그인한 사용자의 업무 화면**이다.
   로그인 전에 보는 공지·활용 사례는 메인 톤으로 따로 세웠다(landxi/proto/site/).
   한때 여기 관문을 풀어 손님에게 열었는데, 앱 셸에서 레일만 뺀 모양이라 메인과 톤이
   달랐다 — 발주자 지적("메인과 톤앤매너를 맞춰 새로 게시판 만들어야겠다")으로 되돌렸다. */
export function boot(tab) {
  document.body.classList.add('sp');
  const shell = mountShell({
    active: 'support', title: '서비스 지원', titleRule: 1, subtitle: esc(SUBS[tab]),
    tabs: TABS.support, tab, crumbIcon: 'notice',
    crumbs: [{ label: '서비스 지원', href: 'notice.html' }, { label: LABEL[tab] }],
    asOf: AS_OF, demo: true,
  });
  return shell;
}

/* 마스트헤드 경로의 마지막 칸 — 열람 중이면 `공지사항 열람` · `문의 열람`(원판) */
export function setCrumb(label) { const el = $('#mast .crumbs li[aria-current] span'); if (el && el.textContent !== label) el.textContent = label; }

/* ── URL 이 상태다 ─────────────────────────────────────────────────────── */
export const readQ = () => Object.fromEntries(new URLSearchParams(location.search));
export function writeQ(obj, { push = true } = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== false) p.set(k, String(v));
  const qs = p.toString(), url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
  if (url === location.pathname + location.search + location.hash) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

/* ── 글자 · 파일 ───────────────────────────────────────────────────────── */
export const fmtDT = (iso) => String(iso || '').replace('T', ' ').substring(0, 16).replace(/-/g, '.');
export function fmtSize(b) {
  if (typeof b !== 'number') return String(b ?? '');
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
/* 첨부 행 — 원본: 클릭 = 다운로드 시작 토스트(실제 파일은 없다 → 시연) */
export const fileRow = (a, cls = '') => `<button type="button" class="file sp-file ${cls}" data-dl="${esc(a.name)}"><span class="sp-file-ic">${icon('clip', 16)}</span><span class="sp-file-n">${esc(a.name)}</span><span class="n sp-file-s">(${esc(fmtSize(a.size))})</span><span class="sp"></span><span class="sp-file-d">${icon('down', 16)}</span><span class="sr">내려받기</span></button>`;
export function bindDownloads(root = document) {
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-dl]'); if (b) say(`다운로드를 시작합니다 · ${b.dataset.dl} · 시연`); });
}

/* `[분류] 제목` → 분류는 파랑, 사이에 회색 빗금 (원판 ucTitle) */
export function ucTitle(t) {
  const m = /^\[(.+?)\]\s*(.*)$/.exec(t);
  return m ? `<span class="uc-k">${esc(m[1])}</span><span class="uc-sl" aria-hidden="true">/</span>${esc(m[2])}` : esc(t);
}

/* 셸 아이콘 세트에 없는 두 개(원판 생성기의 pen · book) — 같은 각진 1.5 stroke */
const XI = { pen: '<path d="M3 17h4L17 7l-4-4L3 13z"/><path d="M11 5l4 4"/>', book: '<path d="M3 3.5h6l1 1 1-1h6v13h-6l-1 1-1-1H3z"/><path d="M10 4.5v12"/>' };
export const xicon = (name, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${XI[name] || ''}</svg>`;

/* 진입 — 큰 덩어리가 60ms 간격으로 아래에서 올라온다(600ms). backwards 라 끝나면 흔적이 남지 않는다. */
export function stagger(root = document) { $$('[data-in]', root).forEach((el, i) => el.style.setProperty('--i', i)); }

/* 보이지 않는 상태 알림(검색 결과 건수 등) */
export function announce(msg) {
  let el = $('#sp-live');
  if (!el) { el = document.createElement('p'); el.id = 'sp-live'; el.className = 'sr'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); $('#main').append(el); }
  el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; });
}

export { say, icon, esc, $, $$ };
