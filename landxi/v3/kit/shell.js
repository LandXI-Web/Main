/* K1 shell.js — 앱 셸: 마스트 64 · 역할 칩 · 신선도 점 · 레일 72(세로 스텝퍼 또는 메뉴) · `?` · 나가기. 모바일(≤ 960) = 하단 탭.
   const S = shell({
     who,                                   // auth-gate gate() 결과(역할 칩 · 기관명)
     home: 'lx-console',                    // 마스트 집 이름(§8) — 생략하면 경로에서
     rail: { kind: 'steps'|'menu', items: [{ id, label, icon?, href? }], current: 0, done?: [0,1], onPick(i, item) },
     onHelp,                                // 기본: 지원 서랍(help-my)
     contained,                             // true = 부모 상자 안(갤러리 · 미리보기) · 기본은 뷰포트 전체
   });
   S.main  → 화면이 채울 판(뷰포트 - 마스트 - 레일)
   S.fresh(date|null) · S.go(i) · S.steps({ done }) · S.mast(우측에 끼울 노드) */
import { h, esc, hhmm } from './util.js';
import { t } from './i18n.js';
import { logout, homeFromPath, allowed } from './auth-gate.js';
import { drawer } from './panel.js';
import { mountBell, hasBell } from './notify.js';   // 알림 칸(검토 요청 · 메시지 — 구현 2차)

const HOME = {
  'lx-console': 'LX 직원 대시보드', 'lx-ingest': 'LX 직원 대시보드', 'lx-train': 'LX 직원 대시보드', 'lx-review': 'LX 직원 대시보드', 'lx-deploy': 'LX 직원 대시보드',
  'ops-core': 'LX 관리자 대시보드', 'ops-infra': 'LX 관리자 대시보드', sales: '서비스 카탈로그', 'xi-clean': 'XI맵', 'help-my': '지원',
};
const ICON = {
  home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>', map: '<path d="M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11"/>',
  data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  check: '<path d="M4 10.5l4 4 8-9"/>', deploy: '<path d="M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4"/>', chart: '<path d="M4 16V9 M10 16V4 M16 16v-5"/>',
  gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2 M4.7 4.7l1.4 1.4 M13.9 13.9l1.4 1.4 M4.7 15.3l1.4-1.4 M13.9 6.1l1.4-1.4"/>',
  org: '<path d="M3 17V7l7-4 7 4v10 M8 17v-5h4v5"/>', inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>', grid: '<path d="M3 3h6v6H3z M11 3h6v6h-6z M3 11h6v6H3z M11 11h6v6h-6z"/>',
  report: '<path d="M5 2.5h7l3 3v12H5z M8 9h5 M8 12h5 M8 15h3"/>', list: '<path d="M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01"/>',
};
export const icon = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k] || ICON.grid}</svg>`;

function roleText(who) {
  if (!who) return null;
  const k = who.key || '';
  if (k === 'lx/staff') return t('shell.role.staff', { name: who.name });
  if (k === 'lx/admin') return t('shell.role.admin', { name: who.name });
  if (k === 'lx/sales') return t('shell.role.sales', { name: who.name });
  return t('shell.role.tenant', { org: who.org || who.name });
}

export function shell({ who = null, home = homeFromPath(), title, rail = null, onHelp, mount = document.body, contained = false, xiRegion } = {}) {
  document.body.classList.add('t');
  if (!contained) document.body.classList.add('k-shelled');
  const name = title || (home && home.startsWith('gov') || home === 'global' ? (who?.org || '') : HOME[home] || '');
  const role = roleText(who);
  let [rk, rn] = role ? role.split(' · ') : [];
  if (rn && rn.trim() === rk) rn = '';   // 계정 이름이 역할 표기와 같으면(개발 계정) 'LX 직원 · LX 직원' 반복 대신 한 번만 — 이름을 지어내지 않는다

  const fresh = h('span.t-fresh.k-fresh.k-sig', { hidden: true, tabindex: '0' }, h('i'), h('span.num'));
  const help = h('button.k-mast-b.k-help', { type: 'button', 'aria-label': t('shell.help'), text: '?' });
  const exit = h('button.k-mast-b.k-exit', { type: 'button', text: t('shell.exit') });
  const slot = h('span.k-mast-slot');
  /* XI맵 — 들어갈 수 있는 모든 화면의 마스트에 한 칸(원스톱 · 주소 입력 없이 C1 에 닿는다). 이 화면의 시군구(?region 또는 화면이 준 xiRegion)를 이어 준다 */
  const xi = who && home !== 'xi-clean' && allowed('xi-clean', who.key) ? h('a.k-mast-b.k-xi', { href: '/landxi/v3/xi-clean/', text: 'XI맵' }) : null;
  const xiHref = () => {
    let r = null; try { r = (xiRegion && xiRegion()) || new URLSearchParams(location.search).get('region'); } catch { /* */ }
    return '/landxi/v3/xi-clean/' + (r ? '?' + new URLSearchParams({ region: String(r) }) : '');
  };
  if (xi) for (const ev of ['pointerdown', 'focus', 'mouseenter']) xi.addEventListener(ev, () => { xi.href = xiHref(); });
  const bell = !contained && hasBell(who) ? h('span.k-bell-slot') : null;   // 알림 칸 — 새 요청 · 새 답(LX 직원 · LX 관리자 · 기관)
  const mast = h('header.t-mast.k-mast', {},
    h('a.k-word', { href: who?.landing || '/landxi/v3/main/' }, h('span.word', { text: 'LAND-XI' }), name ? h('span.home', { text: name }) : null),
    h('span.sp'), slot, fresh,
    role ? h('span.t-role.k-role', { html: rn ? `<b>${esc(rk)}</b>${esc(rn)}` : esc(rk) }) : null,
    xi, bell, help, who ? exit : null);

  const railEl = h('nav.t-rail.k-rail', { 'aria-label': t('shell.menu') });
  const main = h('main.k-main', { id: 'main' });
  const app = h('div.k-app', { class: [rail && 'has-rail', contained && 'k-app--in'].filter(Boolean).join(' ') }, mast, rail ? railEl : null, main);
  mount.prepend(app);
  if (bell) mountBell(bell, who);

  let cur = rail?.current ?? 0, done = rail?.done;
  const drawRail = () => {
    if (!rail) return;
    const steps = rail.kind === 'steps';
    railEl.classList.toggle('k-rail--steps', steps);
    railEl.innerHTML = rail.items.map((it, i) => {
      const st = done ? (done.includes(i) ? 'done' : i === cur ? 'now' : 'wait') : i < cur ? 'done' : i === cur ? 'now' : 'wait';
      const inner = steps
        ? `<span class="n" data-st="${st}">${st === 'done' ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>' : i + 1}</span><span>${esc(it.label)}</span>`
        : `${icon(it.icon)}<span>${esc(it.label)}</span>`;
      const attrs = `data-i="${i}"${i === cur ? ' aria-current="true"' : ''}${steps ? ` data-st="${st}"` : ''}`;
      return it.href ? `<a class="k-rail-i" href="${esc(it.href)}" ${attrs}>${inner}</a>` : `<button type="button" class="k-rail-i" ${attrs}>${inner}</button>`;
    }).join('');
  };
  railEl.addEventListener('click', (e) => {
    const b = e.target.closest('.k-rail-i'); if (!b) return;
    const i = +b.dataset.i, it = rail.items[i];
    if (!it.href) { e.preventDefault(); cur = i; drawRail(); }
    rail.onPick?.(i, it);
  });
  drawRail();

  help.addEventListener('click', () => {
    if (onHelp) return onHelp();
    const d = drawer({ title: t('shell.help'), label: t('shell.help') });
    d.set(h('iframe.k-help-f', { src: '/landxi/v3/help-my/?embed=1', title: t('shell.help'), loading: 'lazy' }));
  });
  exit.addEventListener('click', () => logout());

  const api = {
    app, mast, rail: railEl, main,
    go(i) { cur = i; drawRail(); },
    steps({ done: d, current } = {}) { if (d) done = d; if (current !== undefined) cur = current; drawRail(); },
    fresh(d) {
      if (!d) { fresh.hidden = true; return; }
      const at = new Date(d), live = Date.now() - at < 5 * 60 * 1000;
      fresh.hidden = false; fresh.dataset.live = live ? '1' : '0';
      fresh.querySelector('span').textContent = hhmm(at);
      fresh.setAttribute('aria-label', t('shell.fresh', { time: hhmm(at) }));
      fresh.dataset.why = t('shell.fresh', { time: hhmm(at) });
    },
    mast(node) { slot.innerHTML = ''; if (node) slot.append(node); },
  };
  return api;
}
