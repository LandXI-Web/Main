import { icon } from './ui/icon.js';
import { initPalette } from './ui/palette.js';
const MENU = [
  { key: 'dashboard', label: '대시보드', href: 'dashboard.html', icon: 'dashboard' },
  { group: 'BUILD' },
  { key: 'project', label: '프로젝트', href: 'ai-project.html', icon: 'project' },
  { key: 'data', label: '데이터', href: 'dataset.html', icon: 'data' },
  { key: 'card', label: '카드 발행', href: 'admin-publish.html', icon: 'card' },
  { group: 'USE' },
  { key: 'run', label: '분석 실행', href: 'analysis-ai.html', icon: 'run' },
  { key: 'map', label: 'XI 맵', href: 'ximap.html', icon: 'map' },
  { spacer: true },
  { key: 'admin', label: '서비스 관리', href: 'admin-notice.html', icon: 'settings' },
  { key: 'support', label: '서비스 지원', href: 'notice.html', icon: 'help' },
  { key: 'my', label: 'MY', href: 'mypage.html', icon: 'user', flyout: [{ label: '마이 페이지', href: 'mypage.html' }, { label: '로그아웃', action: 'logout' }] },
];
export const AuthState = {
  isLoggedIn: () => localStorage.getItem('lx_logged_in') === '1',
  login: () => localStorage.setItem('lx_logged_in', '1'),
  logout: () => { localStorage.removeItem('lx_logged_in'); location.href = 'home.html'; },
};
export function mountShell(opts = {}) {
  const q = new URLSearchParams(location.search); const embed = q.get('embed') === '1';
  const body = document.body; body.classList.add('has-shell'); if (opts.mapPage) body.classList.add('is-map');
  if (!opts.public && !AuthState.isLoggedIn()) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search)); return; }
  const main = document.createElement('main'); main.id = 'page'; main.className = 'page'; while (body.firstChild) main.append(body.firstChild); body.append(main);
  if (embed) { body.classList.add('is-embed'); return; }
  body.prepend(renderRail(opts.active), renderCtx(opts));
  if (opts.secondary) { body.classList.add('has-secondary'); main.before(renderSecondary(opts.secondary)); }
  if (opts.footer !== false && !opts.mapPage) body.append(renderFooter());
  bindFlyout(); window.LX = Object.assign(window.LX || {}, { shell: { setCrumb, notify } });
  const palette = initPalette({ sources: () => (window.LX?.paletteSources?.() || []), onPlace: i => window.LX?.map?.flyTo?.(i.lnglat, 14) || window.LX?.onPlace?.(i) });
  window.LX = Object.assign(window.LX || {}, { palette });
}
function renderRail(active) {
  const nav = document.createElement('nav'); nav.className = 'rail'; nav.setAttribute('aria-label', '주 메뉴');
  nav.innerHTML = `<a class="rail__logo" href="dashboard.html"><span>LAND<br>XI</span><small>PLATFORM</small></a>` + MENU.map(m => m.group ? `<div class="rail__group">${m.group}</div>` : m.spacer ? `<div class="rail__spacer"></div>` :
    `<a class="rail__item" data-menu="${m.key}" href="${m.href}" ${m.key === active ? 'aria-current="page"' : ''} ${m.flyout ? 'data-flyout' : ''}><i class="rail__ic">${icon(m.icon, 18)}</i><span>${m.label}</span>${m.flyout ? `<div class="rail__flyout">${m.flyout.map(f => f.action ? `<button type="button" data-action="${f.action}">${f.label}</button>` : `<button type="button" data-href="${f.href}">${f.label}</button>`).join('')}</div>` : ''}</a>`).join('');
  return nav;
}
function renderCtx({ crumb = [] }) {
  const h = document.createElement('header'); h.className = 'ctx rule';
  h.innerHTML = `<div class="ctx__org"><span class="ctx__tag">LX</span>한국국토정보공사 <span class="faint">· 공간정보AI팀</span></div><div class="ctx__crumb">${crumbHtml(crumb)}</div><div class="ctx__spacer"></div><button type="button" class="ctx__search" data-palette>${icon('search', 16)}<span>프로젝트, 카드, 사용자, 공지, 주소 검색</span><kbd>/</kbd></button><button type="button" class="icon-btn ctx__bell" aria-label="알림">${icon('bell', 16)}<span class="badge">3</span></button><div class="ctx__me"><span class="avatar">관</span>관리자</div>`;
  return h;
}
const crumbHtml = (arr) => arr.map((c, i) => i === arr.length - 1 ? `<b>${c}</b>` : `<span>${c}</span><i>›</i>`).join('');
function setCrumb(arr) { document.querySelector('.ctx__crumb').innerHTML = crumbHtml(arr); }
function notify(n) { const b = document.querySelector('.ctx__bell .badge'); b.textContent = n; b.hidden = !n; }
function renderSecondary(groups) {
  const a = document.createElement('aside'); a.className = 'secondary';
  a.innerHTML = groups.map(g => `<div class="secondary__group"><div class="secondary__label">${g.group}</div>${g.items.map(i => `<a class="secondary__item" href="${i.href}" ${i.active ? 'aria-current="page"' : ''}>${i.label}</a>`).join('')}</div>`).join('');
  return a;
}
function renderFooter() {
  const f = document.createElement('footer'); f.className = 'gov-footer';
  f.innerHTML = `<div class="gov-footer__links"><a href="#" data-policy="privacy"><b>개인정보처리방침</b></a><a href="#" data-policy="terms">이용약관</a><a href="#" data-policy="email">이메일주소무단수집거부</a></div><div class="gov-footer__addr">(우)54870 전라북도 전주시 덕진구 기지로 120 (중동) LX · 고객센터 063-713-1213, 1216 · © LX. All rights reserved.</div><select class="select gov-footer__family" aria-label="패밀리 사이트"><option>Family Site</option><option value="https://www.lx.or.kr">LX 한국국토정보공사</option><option value="https://map.ngii.go.kr">국토정보플랫폼</option><option value="https://www.vworld.kr">브이월드</option><option value="https://www.nsdi.go.kr">국가공간정보포털</option><option value="https://www.gov.kr">정부24</option></select>`;
  f.querySelector('select').addEventListener('change', e => { if (e.target.value.startsWith('http')) window.open(e.target.value, '_blank'); });
  return f;
}
function bindFlyout() {
  document.querySelectorAll('[data-action=logout]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); AuthState.logout(); }));
  document.querySelectorAll('.rail__flyout [data-href]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); location.href = b.dataset.href; }));
}
