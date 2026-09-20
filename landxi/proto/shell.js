/* Land-XI 공용 셸 — 레일 · MY 플라이아웃 · 마스트헤드 · 제목 행 · 푸터 · 토스트 · 모달 (2026-09-20 전수 검토 A4 선택 1).
   한 곳의 NAV 가 모든 화면의 레일이다. 프레임워크 없음 · 빌드 없음 · 경로는 전부 상대(GitHub Pages /Main/).
   문서: docs/superpowers/proto/2026-09-20-shell-parts-api.md · 살아있는 견본: shell-demo.html
   디자인 법전: design/system.md (라운드 0 · 그림자 0 · 그라디언트 0 · 유리 0 · 바닥 14px · 채운 파란 버튼 없음). */

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ymd = (s) => String(s || '').replace(/-/g, '.');
export const nf = new Intl.NumberFormat('ko-KR');

/* ══ 내비 — 단 하나의 출처. 원본 9메뉴 · 원본 순서 · 원본 라벨. ═══════════ */
export const NAV = [
  { key: 'dashboard', name: '대시보드', href: 'dashboard.html', icon: 'dash', group: 'top' },
  { key: 'media', name: '데이터 관리', href: 'dataset.html', icon: 'data', group: 'top' },
  { key: 'project', name: '프로젝트', href: 'ai-project.html', icon: 'proj', group: 'top' },
  { key: 'analysis', name: '분석 서비스', href: 'analysis-ai.html', icon: 'run', group: 'top' },
  { key: 'map', name: '지도 서비스', href: 'ximap.html', icon: 'map', group: 'top' },
  { key: 'support', name: '서비스 지원', href: 'notice.html', icon: 'help', group: 'foot' },
  { key: 'publish', name: '카드 발행 관리', href: 'admin-publish.html', icon: 'stack', group: 'foot' },
  { key: 'produce', name: '생산 관리', href: 'produce.html', icon: 'run', group: 'foot' },
  { key: 'admin', name: '서비스 관리', href: 'admin-notice.html', icon: 'gear', group: 'foot' },
  { key: 'my', name: 'MY', href: 'mypage.html', icon: 'my', group: 'foot' },
];
/* 화면군 탭 — 서비스 지원 · 서비스 관리 원판의 H1 행 오른쪽 탭. mountShell({ tabs: TABS.support, tab: 'faq' }) */
export const TABS = {
  support: [
    { key: 'notice', label: '공지사항', href: 'notice.html' },
    { key: 'faq', label: '자주 묻는 질문', href: 'faq.html' },
    { key: 'contact', label: '문의하기', href: 'contact.html' },
    { key: 'usecase', label: '활용사례', href: 'usecase.html' },
    { key: 'manual', label: '매뉴얼', href: 'manual.html' },
  ],
  admin: [
    { key: 'notice', label: '공지사항 관리', href: 'admin-notice.html' },
    { key: 'inquiry', label: '문의 관리', href: 'admin-inquiry.html' },
    { key: 'faq', label: '자주 묻는 질문 관리', href: 'admin-faq.html' },
    { key: 'users', label: '사용자 관리', href: 'admin-users.html' },
    { key: 'map', label: '지도 속성 관리', href: 'admin-map.html' },
  ],
};
/* 푸터 · 공지 · 기준일 — 정본 한 벌(C3). 데이터 관리 화면의 값. */
export const FOOT_LINKS = ['개인정보처리방침', '이용약관', '이메일주소무단수집거부'];
export const FOOT_ADDR = '(우)54870 전북 전주시 덕진구 기지로 120 · 고객센터 063-713-1213, 1216';
export const NOTICE = { id: 8, title: '고위험 탐지 건 긴급 처리 안내', date: '2026-04-15', href: 'notice.html?notice=8' };
export const AS_OF = '2026-06-08';

/* 레일 아이콘 — dataset.js 와 같은 그림(20×20 · 1.25 stroke). */
const RAIL_ICON = {
  dash: '<rect x="2.6" y="2.6" width="6.4" height="6.4"/><rect x="11" y="2.6" width="6.4" height="6.4"/><rect x="2.6" y="11" width="6.4" height="6.4"/><rect x="11" y="11" width="6.4" height="6.4"/>',
  data: '<ellipse cx="10" cy="4.9" rx="7" ry="2.5"/><path d="M3 4.9v10.2c0 1.4 3.14 2.5 7 2.5s7-1.1 7-2.5V4.9"/><path d="M3 10c0 1.4 3.14 2.5 7 2.5s7-1.1 7-2.5"/>',
  proj: '<path d="M2.4 16.4V4.2h5.1l1.7 2.2h8.4v10z"/>',
  run: '<path d="M6.2 3.4 16 10l-9.8 6.6z"/>',
  map: '<path d="M2.4 5.2 7.6 3l4.8 2.2L17.6 3v11.8l-5.2 2.2-4.8-2.2-5.2 2.2z"/><path d="M7.6 3v14M12.4 5.2v11.8"/>',
  help: '<circle cx="10" cy="10" r="7.3"/><path d="M7.9 7.8a2.15 2.15 0 1 1 3.1 1.9c-.7.4-1 .9-1 1.7"/><circle cx="10" cy="14.3" r=".75" fill="currentColor" stroke="none"/>',
  stack: '<path d="M10 2.5 17.5 6.8 10 11.1 2.5 6.8z"/><path d="M2.5 11.1 10 15.4l7.5-4.3"/>',
  gear: '<circle cx="10" cy="10" r="2.9"/><path d="M10 1.6v2.5M10 15.9v2.5M18.4 10h-2.5M4.1 10H1.6M15.94 4.06l-1.77 1.77M5.83 14.17l-1.77 1.77M15.94 15.94l-1.77-1.77M5.83 5.83 4.06 4.06"/>',
  my: '<circle cx="10" cy="6.9" r="3.1"/><path d="M3.7 17.3c0-3.4 2.9-5.3 6.3-5.3s6.3 1.9 6.3 5.3"/>',
  out: '<path d="M11.6 2.6H3.4v14.8h8.2"/><path d="M8.6 10h9M14.2 6.6 17.6 10l-3.4 3.4"/>',
};
const railSvg = (k) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${RAIL_ICON[k] || ''}</svg>`;

/* 본문 아이콘 — 원판 생성기(tools/design/gen-b6-*.mjs)의 각진 1.5 stroke 세트. icon('search', 14) */
const ICONS = {
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  search: '<path d="M4 4h9v9H4z"/><path d="M13 13l4 4"/>',
  reset: '<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M14.5 2.5v4h-4"/>',
  x: '<path d="M4.5 4.5l11 11M15.5 4.5l-11 11"/>',
  check: '<path d="M4 10.5 8.5 15 16 5.5"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  clip: '<path d="M6 3h8v14H6z"/><path d="M9 6h2v6H9z"/>',
  pin: '<path d="M6.5 3h7v6h-7z"/><path d="M10 9v8"/>',
  down: '<path d="M10 3v10M6 9.5l4 4 4-4"/><path d="M4 17h12"/>',
  list: '<path d="M7 5h10M7 10h10M7 15h10"/><path d="M3 5h1M3 10h1M3 15h1"/>',
  edit: '<path d="M4 16l1-4 8-8 3 3-8 8z"/><path d="M4 17h12"/>',
  lock: '<path d="M4.5 9h11v8h-11z"/><path d="M7 9V5.5h6V9"/>',
  user: '<path d="M7 3.5h6v6H7z"/><path d="M3.5 17v-4.5h13V17"/>',
  mail: '<path d="M3 4.5h14v11H3z"/><path d="M3 5l7 6 7-6"/>',
  layers: '<path d="M10 3 17 7l-7 4-7-4z"/><path d="M3 11l7 4 7-4"/>',
  clock: '<path d="M3 3h14v14H3z"/><path d="M10 6v4.5h3.5"/>',
  image: '<path d="M3 3h14v14H3z"/><path d="M3 13.5l4-4 3.5 3.5 2.5-2.5 4 4"/>',
  grid: '<path d="M3 3h14v14H3z"/><path d="M3 7.67h14M3 12.33h14M7.67 3v14M12.33 3v14"/>',
  chevD: '<path d="M5 7.5l5 5 5-5"/>',
  chevR: '<path d="M7.5 5l5 5-5 5"/>',
};
export const icon = (name, size = 16) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ══ 로그인 관문 ═══════════════════════════════════════════════════════════
   그리기 전에 막으려면 <head> 에 <script src="shell-gate.js"></script>(클래식 · 블로킹)을 둔다.
   mountShell 도 한 번 더 확인한다(관문 스크립트를 빠뜨린 페이지의 안전망). */
const here = () => (location.pathname.split('/').pop() || 'index.html') + location.search;
export function isLoggedIn() { try { return localStorage.getItem('lx_logged_in') === '1'; } catch { return false; } }
export function gate(base = '') {
  if (isLoggedIn()) return true;
  document.documentElement.style.visibility = 'hidden';
  location.replace(`${base}login.html?next=${encodeURIComponent(here())}`);
  return false;
}
export function logout(base = '') {
  try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ }
  location.href = `${base}scrub/index.html`;
}

/* 셸 CSS 가 빠진 페이지(자리 화면 등)에는 직접 단다. */
function ensureCss(base) {
  const dir = new URL('.', import.meta.url).href;
  for (const f of ['fonts-system.css', 'shell.css', 'parts.css']) {
    if ($$('link[rel="stylesheet"]').some((l) => l.href === dir + f)) continue;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = dir + f; l.dataset.shell = '';
    document.head.append(l);
  }
  return base;
}

/* ══ mountShell ═══════════════════════════════════════════════════════════
   active    레일 활성 키: dashboard · media · project · analysis · map · support · publish · admin · my
   title     H1 (문자열). titleRule = 파랑 4px 룰을 받는 앞 단어 수(기본 전체)
   subtitle  H1 옆 회색 한 줄(HTML 허용 — 직접 esc() 할 것)
   crumbs    [{ label, href? }, …] — 주면 마스트헤드 왼쪽이 경로, 없으면 공지 띠
   notice    false = 공지 띠 없음 · { title, date, href } = 덮어쓰기
   tabs      [{ key, label, href, count? }] · tab = 활성 키 · tabStyle 'box'(서비스 지원) | 'line'(서비스 관리)
   mastHtml  마스트헤드 왼쪽을 통째로 바꾸는 HTML(자리 화면의 안내 띠)
   asOf      'YYYY-MM-DD' | false(숨김) · asOfLabel '기준일 현재' · demo true = `시연` 꼬리표
   headRight 제목 행 오른쪽에 넣을 HTML(탭 대신 — 예: 카드 발행 관리의 건수 타일)
   fit       true = 100vh 에 맞춘 앱형(본문 안에서 스크롤) · 기본 = 문서형(페이지 스크롤, 푸터는 바닥)
   rail      false = 레일·관문 없음(가입/찾기 같은 로그인 전 화면) · base = proto/ 까지의 상대 경로 */
export function mountShell(o = {}) {
  const base = ensureCss(o.base || '');
  const withRail = o.rail !== false;
  if (withRail && o.gate !== false && !gate(base)) return null;

  const body = document.body;
  body.classList.add('lx');
  if (o.fit) body.dataset.fit = '';
  if (!withRail) body.dataset.norail = '';
  let main = $('#main') || $('main');
  if (!main) { main = document.createElement('main'); body.prepend(main); }
  main.id = 'main';
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
  if (o.title && !main.hasAttribute('aria-label')) main.setAttribute('aria-label', o.title);

  const item = (n) => {
    const cur = n.key === o.active ? ' aria-current="page"' : '';
    const my = n.key === 'my' ? ' id="rail-my-btn" aria-haspopup="true" aria-expanded="false" aria-controls="rail-my"' : '';
    return `<a class="rail-i" data-menu="${n.key}" href="${base}${n.href}"${cur}${my}>${railSvg(n.icon)}<span class="rl">${esc(n.name)}</span></a>`;
  };
  const rail = !withRail ? '' : `
<aside id="rail" aria-label="주 메뉴">
  <a id="rail-mark" href="${base}scrub/index.html" aria-label="Land-XI 홈"><span>LAND</span><span>XI</span></a>
  <nav id="rail-top" class="rail-group" aria-label="업무">${NAV.filter((n) => n.group === 'top').map(item).join('')}</nav>
  <nav id="rail-foot" class="rail-group" aria-label="지원 · 관리">${NAV.filter((n) => n.group === 'foot').map(item).join('')}
    <div id="rail-my" class="rail-fly" role="group" aria-label="MY" hidden>
      <a href="${base}mypage.html">마이 페이지</a>
      <button type="button" data-action="logout">로그아웃</button>
    </div>
    <button type="button" class="rail-i" data-action="logout">${railSvg('out')}<span class="rl">로그아웃</span></button>
  </nav>
</aside>`;

  const nt = o.notice === false ? null : { ...NOTICE, ...(o.notice || {}) };
  const left = o.mastHtml ? `<div class="mast-free">${o.mastHtml}</div>` : o.crumbs?.length
    ? `<nav class="crumbs" aria-label="현재 위치">${icon(o.crumbIcon || 'notice', 16)}<ol>${o.crumbs.map((c, i, a) => `<li${i === a.length - 1 ? ' aria-current="page"' : ''}>${c.href ? `<a href="${base}${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`}</li>`).join('')}</ol></nav>`
    : nt ? `<a id="mast-notice" class="notice" href="${base}${esc(nt.href)}">${icon('notice', 16)}<span class="chip">공지</span><span class="nt">${esc(nt.title)}</span><span class="n nd">${esc(ymd(nt.date))}</span><span class="more">전체 보기 ›</span></a>` : '';
  const mast = `
<header id="mast">${left}
  ${o.asOf === false ? '' : `<p class="asof"><span class="k">${esc(o.asOfLabel || '기준일 현재')}</span><span class="n" id="mast-asof">${esc(ymd(o.asOf || AS_OF))}</span>${o.demo ? '<em class="tag">시연</em>' : ''}</p>`}
</header>`;

  let h1 = '';
  if (o.title) {
    const words = String(o.title).split(' ');
    const k = Math.min(words.length, o.titleRule || words.length);
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const tabs = o.tabs?.length ? `<nav class="ptabs" data-style="${o.tabStyle === 'line' ? 'line' : 'box'}" aria-label="${esc(o.title)} 메뉴">${o.tabs.map((t) => `<a href="${base}${esc(t.href)}"${t.key === o.tab ? ' aria-current="page"' : ''}>${esc(t.label)}${t.count ? `<b class="n">${esc(t.count)}</b>` : ''}</a>`).join('')}</nav>` : '';
    h1 = `<header id="page-head" data-line><h1 id="page-title" class="d"><span class="rule">${esc(a)}</span>${b ? ' ' + esc(b) : ''}</h1>${o.subtitle ? `<p id="page-sub">${o.subtitle}</p>` : ''}<span class="sp"></span>${tabs}${o.headRight ? `<div id="page-head-right">${o.headRight}</div>` : ''}</header>`;
  }

  const foot = `
<footer id="foot"><span id="foot-links">${FOOT_LINKS.map((t) => `<span>${esc(t)}</span>`).join('')}</span><span id="foot-addr" class="n">${esc(FOOT_ADDR)}</span><span class="fam">Family Site<svg width="8" height="5" viewBox="0 0 9 6" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M.5.5 4.5 5 8.5.5"/></svg></span></footer>`;

  $$('[data-shell-part]').forEach((e) => e.remove());      // 다시 불러도 한 벌
  $('#page-head')?.remove();
  const tpl = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); [...t.content.children].forEach((e) => { e.dataset.shellPart = ''; }); return t.content; };
  body.prepend(tpl(`<a class="skip" href="#main">본문으로 건너뛰기</a>${rail}${mast}`));
  if (h1) main.prepend(tpl(h1));
  main.after(tpl(foot));
  if (!$('#say')) body.append(tpl('<p id="say" role="status" aria-live="polite" aria-atomic="true"></p>'));

  if (withRail) bindRail(base);
  if (o.title && !o.keepDocTitle) document.title = `${o.title}${o.tabs && o.tab ? ' · ' + (o.tabs.find((t) => t.key === o.tab)?.label || '') : ''} — Land-XI`;
  requestAnimationFrame(() => { document.documentElement.dataset.shell = 'ready'; });
  return { main, rail: $('#rail'), mast: $('#mast'), head: $('#page-head'), foot: $('#foot') };
}

/* MY 플라이아웃 — MY 는 진짜 링크(mypage.html)다. 포인터를 올리거나 포커스가 들어오면 열리고,
   ↓ · → 로 메뉴 안으로, ↑↓ 로 항목 사이, Esc 로 닫고 MY 로 돌아온다. Tab 순서도 MY → 항목 2 → 로그아웃. */
let docBound = false, docClick = () => {};
function bindRail(base) {
  const btn = $('#rail-my-btn'), fly = $('#rail-my'); let t = 0;
  const open = (v) => { clearTimeout(t); fly.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
  const later = () => { clearTimeout(t); t = setTimeout(() => { if (!fly.matches(':hover') && !btn.matches(':hover') && !fly.contains(document.activeElement) && document.activeElement !== btn) open(false); }, 160); };
  const items = () => $$('a,button', fly);
  btn.addEventListener('mouseenter', () => open(true)); fly.addEventListener('mouseenter', () => open(true));
  btn.addEventListener('mouseleave', later); fly.addEventListener('mouseleave', later);
  btn.addEventListener('focus', () => open(true));
  btn.addEventListener('blur', later); fly.addEventListener('focusout', later);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); open(true); items()[0].focus(); }
    if (e.key === 'Escape') open(false);
  });
  fly.addEventListener('keydown', (e) => {
    const it = items(), i = it.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
    if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); btn.focus(); open(false); }
  });
  docClick = (e) => {
    if (e.target.closest('[data-action="logout"]')) { logout(base); return; }
    if (!e.target.closest('#rail-my, #rail-my-btn')) open(false);
  };
  if (!docBound) { docBound = true; document.addEventListener('click', (e) => docClick(e)); }
}

/* ══ 토스트 — aria-live="polite". 한 줄 · 4.2초. ═══════════════════════════ */
let sayT = 0;
export function say(msg, ms = 4200) {
  let el = $('#say');
  if (!el) { el = document.createElement('p'); el.id = 'say'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); document.body.append(el); }
  el.textContent = ''; clearTimeout(sayT);
  requestAnimationFrame(() => { el.textContent = msg; });                 // 같은 문구를 다시 말해도 읽히게 비웠다 채운다
  if (ms > 0) sayT = setTimeout(() => { el.textContent = ''; }, ms);
}

/* ══ 모달 — 평면(1px 잉크 · 그림자 0 · 블러 0). 포커스 가둠 · Esc · 바깥 클릭 · 닫히면 부른 자리로 포커스. ══
   openModal({ title, content, actions, tag, width, onClose, dismissible }) → { el, close(result) , closed: Promise }
   content  HTML 문자열 | Node          tag = 제목 옆 점선 꼬리표('시연')
   actions  [{ label, kind: 'primary' | 'bracket' | 'danger', value, onClick(ctx) → false 면 닫지 않음, autofocus }]
            onClick 이 없으면 value 로 닫는다. */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const stack = [];
let uid = 0;
export function openModal({ title = '', content = '', actions = [], tag = '', width = 480, onClose, dismissible = true, role = 'dialog' } = {}) {
  const back = document.activeElement;
  const id = `lx-m${++uid}`;
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div'); el.className = 'modal'; el.id = id; el.style.width = `${width}px`;
  el.setAttribute('role', role); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', `${id}-h`); el.tabIndex = -1;
  el.innerHTML = `<header class="modal-h"><h2 id="${id}-h" class="d">${esc(title)}</h2>${tag ? `<em class="tag">${esc(tag)}</em>` : ''}<span class="sp"></span>${dismissible ? `<button type="button" class="modal-x" aria-label="닫기">${icon('x', 18)}</button>` : ''}</header><div class="modal-b" id="${id}-b"></div>${actions.length ? '<footer class="modal-f"></footer>' : ''}`;
  const bodyEl = $('.modal-b', el);
  if (content instanceof Node) bodyEl.append(content); else bodyEl.innerHTML = content;
  el.setAttribute('aria-describedby', `${id}-b`);

  let done; const closed = new Promise((r) => { done = r; });
  const ctx = { el, close, closed };
  function close(result) {
    const i = stack.indexOf(ctx); if (i < 0) return;
    stack.splice(i, 1);
    scrim.remove(); el.remove(); document.removeEventListener('keydown', onKey, true);
    if (!stack.length) { document.body.removeAttribute('data-modal'); $$('[data-shell-inert]').forEach((n) => { n.inert = false; n.removeAttribute('data-shell-inert'); }); }
    if (back && back.isConnected && typeof back.focus === 'function') back.focus();
    onClose?.(result); done(result);
  }
  actions.forEach((a) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = a.kind === 'primary' ? 'btn' : a.kind === 'danger' ? 'btn btn--danger' : 'btn-br';
    b.textContent = a.label; if (a.autofocus) b.dataset.autofocus = '';
    b.addEventListener('click', () => { if (a.onClick) { if (a.onClick(ctx) === false) return; close(a.value); } else close(a.value); });
    $('.modal-f', el).append(b);
  });
  $('.modal-x', el)?.addEventListener('click', () => close(undefined));
  scrim.addEventListener('click', () => { if (dismissible) close(undefined); });

  function onKey(e) {
    if (stack[stack.length - 1] !== ctx) return;
    if (e.key === 'Escape') { if (dismissible) { e.preventDefault(); e.stopPropagation(); close(undefined); } return; }
    if (e.key !== 'Tab') return;
    const f = $$(FOCUSABLE, el).filter((n) => n.offsetParent !== null);
    if (!f.length) { e.preventDefault(); el.focus(); return; }
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (!el.contains(cur)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (cur === first || cur === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  if (!stack.length) [...document.body.children].forEach((n) => { if (!n.inert && n.id !== 'say') { n.inert = true; n.dataset.shellInert = ''; } });
  document.body.dataset.modal = '';
  document.body.append(scrim, el); stack.push(ctx);
  const first = $('[data-autofocus]', el) || $$(FOCUSABLE, bodyEl)[0] || $('[data-autofocus], .btn, .btn-br', el) || el;
  first.focus();
  return ctx;
}
export function closeModal(result) { stack[stack.length - 1]?.close(result); }

/* 확인 대화 — Promise<boolean>. danger = 파괴적 확인(채움은 잉크 그대로 · 기본 포커스가 취소에 간다). */
export function confirmDialog({ title = '확인', body = '', okLabel = '확인', cancelLabel = '취소', danger = false } = {}) {
  return openModal({
    title, width: 440, role: 'alertdialog',
    content: `<p class="modal-msg">${esc(body)}</p>`,
    actions: [{ label: cancelLabel, kind: 'bracket', value: false }, { label: okLabel, kind: danger ? 'danger' : 'primary', value: true, autofocus: !danger }],
  }).closed.then((v) => v === true);
}

/* ══ 페이저 — 처음/이전/1…/다음/마지막 + 페이지 크기 + `총 n건 중 a~b행` ══
   mountPager(el, { total, page, size, sizes, onChange({ page, size }) }) → { set({ total, page, size }) } */
export function mountPager(el, opt) {
  const s = { total: 0, page: 1, size: 10, sizes: [10, 20, 50], ...opt };
  el.classList.add('pager'); el.setAttribute('role', 'navigation'); if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', '페이지');
  function draw() {
    const pages = Math.max(1, Math.ceil(s.total / s.size)); s.page = Math.min(Math.max(1, s.page), pages);
    const from = s.total ? (s.page - 1) * s.size + 1 : 0, to = Math.min(s.total, s.page * s.size);
    const lo = Math.max(1, Math.min(s.page - 2, pages - 4)), hi = Math.min(pages, lo + 4);
    let nums = ''; for (let p = lo; p <= hi; p++) nums += `<button type="button" class="n" data-p="${p}"${p === s.page ? ' aria-current="page"' : ''} aria-label="${p}쪽">${p}</button>`;
    const b = (l, p, dis) => `<button type="button" data-p="${p}"${dis ? ' disabled' : ''}>${l}</button>`;
    el.innerHTML = `${b('처음', 1, s.page <= 1)}${b('이전', s.page - 1, s.page <= 1)}<span class="pager-n">${nums}</span>${b('다음', s.page + 1, s.page >= pages)}${b('마지막', pages, s.page >= pages)}<span class="pager-sep"></span><label class="pager-size">페이지 크기<span class="sel sel--s"><select class="n" aria-label="페이지 크기">${s.sizes.map((z) => `<option${z === s.size ? ' selected' : ''}>${z}</option>`).join('')}</select></span></label><span class="sp"></span><span class="pager-sum">총 <b class="n">${nf.format(s.total)}</b>건 중 <span class="n">${from}~${to}</span>행</span>`;
  }
  el.addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b || b.disabled) return; s.page = +b.dataset.p; draw(); s.onChange?.({ page: s.page, size: s.size }); $(`button[data-p="${s.page}"][aria-current]`, el)?.focus(); });
  el.addEventListener('change', (e) => { if (!e.target.matches('select')) return; s.size = +e.target.value; s.page = 1; draw(); s.onChange?.({ page: 1, size: s.size }); $('select', el).focus(); });
  draw();
  return { set(n) { Object.assign(s, n); draw(); }, get state() { return { page: s.page, size: s.size, total: s.total }; } };
}

/* 글자 수 세기 — <input|textarea maxlength> 옆의 <span class="cnt" data-for="id">. bindCounters(root) */
export function bindCounters(root = document) {
  $$('.cnt[data-for]', root).forEach((c) => {
    const f = document.getElementById(c.dataset.for); if (!f) return;
    const max = f.maxLength > 0 ? f.maxLength : +c.dataset.max || 0;
    const draw = () => { c.innerHTML = `<b class="n">${f.value.length}</b>자/${max}자`; c.toggleAttribute('data-over', max > 0 && f.value.length >= max); };
    f.addEventListener('input', draw); draw();
  });
}

/* 표 행 키보드 — role="row" tabindex="0" 행을 ↑↓ 로 옮기고 Enter/Space 로 고른다. bindRows(tbodyEl, (row) => …) */
export function bindRows(root, onPick) {
  const rows = () => $$('[data-row]', root);
  root.addEventListener('click', (e) => { const r = e.target.closest('[data-row]'); if (r && !e.target.closest('a,button,input,select,label')) pick(r); });
  root.addEventListener('keydown', (e) => {
    const r = e.target.closest('[data-row]'); if (!r || e.target !== r) return;
    const all = rows(), i = all.indexOf(r);
    if (e.key === 'ArrowDown' && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); }
    if (e.key === 'ArrowUp' && all[i - 1]) { e.preventDefault(); all[i - 1].focus(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r); }
  });
  function pick(r) { rows().forEach((x) => x.setAttribute('aria-selected', String(x === r))); onPick?.(r); }
  return { pick };
}
