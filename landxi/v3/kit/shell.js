/* K1 shell.js — 앱 셸: 마스트 64 · 역할 칩 · 신선도 점 · 레일 72(세로 스텝퍼 또는 메뉴) · `?` · 나가기. 모바일(≤ 960) = 하단 탭.
   const S = shell({
     who,                                   // auth-gate gate() 결과(역할 칩 · 기관명)
     home: 'lx-console',                    // 마스트 집 이름(§8) — 생략하면 경로에서
     rail: { kind: 'steps'|'menu', items: [{ id, label, icon?, href? }], current: 0, done?: [0,1], onPick(i, item) },
     onHelp,                                // 기본: 지원 서랍(help-my)
     contained,                             // true = 부모 상자 안(갤러리 · 미리보기) · 기본은 뷰포트 전체
   });
   S.main  → 화면이 채울 판(뷰포트 - 마스트 - 레일)
   S.fresh(date|null) · S.go(i) · S.steps({ done }) · S.mast(우측에 끼울 노드) · S.badge(id, n)
   LX 직원 메뉴(lx-menu.js staffMenu · 확인 대장 10차 메뉴-1 ⓐ): rail.menu = 'staff' — 요청함 숫자(rail.counts) · 알림 칸 대신 요청함 · 휴대폰은 아래 탭 + '메뉴'(rail 항목 more).
     rail 을 주지 않은 LX 직원 화면(분석하기 · 서비스 카드 등 STAFF_OF)은 셸이 이 메뉴를 붙인다.
   rail.sub = true → 마스트 아래 한 줄(S.sub — 프로젝트 안 6단계 막대 · lx-project/context.js)
   rail 항목 end = true → PC 레일 아래쪽에 모아 둔다(기관 메뉴의 기관 정보 · 계정 — gov-select/menu.js · 시안 design-r8/gov-design)
   XI ChatGEO(AI 도우미 · 확인 요청 9차 채팅-1 · 채팅-2 ⓐ): 셸이 모든 화면 오른쪽 아래에 도우미 버튼 · 채팅창을 붙인다(cmdk.js · 지도 없는 화면도 같은 자리).
   머리에는 '물어보기' 버튼을 두지 않는다 — 화면이 S.mast() 로 넘긴 옛 트리거(.k-ck-btn · .gl-ask)는 머리에 넣지 않는다. */
import { h, esc, hhmm } from './util.js';
import { t } from './i18n.js';
import { logout, homeFromPath, allowed } from './auth-gate.js';
import { drawer } from './panel.js';
import { mountBell, hasBell } from './notify.js';   // 알림 칸(검토 요청 · 메시지 — 구현 2차)
import { mountCmdk } from './cmdk.js';               // XI ChatGEO 채팅창(오른쪽 아래 · 로그인한 모든 화면)
import { staffMenu, STAFF_OF } from './lx-menu.js'; // LX 직원 메뉴 한 곳(10차 메뉴-1 ⓐ)

const HOME = {
  'lx-console': 'LX 직원 대시보드', 'lx-ingest': 'LX 직원 대시보드', 'lx-train': 'LX 직원 대시보드', 'lx-review': 'LX 직원 대시보드', 'lx-deploy': 'LX 직원 대시보드', 'lx-release': 'LX 직원 대시보드',
  'lx-project': 'LX 직원 대시보드', 'lx-inbox': 'LX 직원 대시보드', 'lx-analyze': 'LX 직원 대시보드', 'lx-cards': 'LX 직원 대시보드',
  'ops-core': 'LX 관리자 대시보드', 'ops-infra': 'LX 관리자 대시보드', sales: '서비스 카탈로그', 'xi-clean': 'XI맵', 'help-my': '지원',
};
const ICON = {
  home: '<path d="M3 9.5L10 4l7 5.5V16H3z"/>', map: '<path d="M3 5l4.5-1.5 5 2L17 4v11l-4.5 1.5-5-2L3 16z M7.5 3.5v11 M12.5 5.5v11"/>',
  data: '<ellipse cx="10" cy="5" rx="6" ry="2"/><path d="M4 5v10c0 1.1 2.7 2 6 2s6-.9 6-2V5 M4 10c0 1.1 2.7 2 6 2s6-.9 6-2"/>',
  check: '<path d="M4 10.5l4 4 8-9"/>', deploy: '<path d="M10 3v10 M6 7l4-4 4 4 M4 13v4h12v-4"/>', chart: '<path d="M4 16V9 M10 16V4 M16 16v-5"/>',
  gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2 M10 15.5v2 M2.5 10h2 M15.5 10h2 M4.7 4.7l1.4 1.4 M13.9 13.9l1.4 1.4 M4.7 15.3l1.4-1.4 M13.9 6.1l1.4-1.4"/>',
  org: '<path d="M3 17V7l7-4 7 4v10 M8 17v-5h4v5"/>', inbox: '<path d="M3 11l2-7h10l2 7v5H3z M3 11h4l1 2h4l1-2h4"/>', grid: '<path d="M3 3h6v6H3z M11 3h6v6h-6z M3 11h6v6H3z M11 11h6v6h-6z"/>',
  report: '<path d="M5 2.5h7l3 3v12H5z M8 9h5 M8 12h5 M8 15h3"/>', list: '<path d="M7 5h10 M7 10h10 M7 15h10 M3 5h.01 M3 10h.01 M3 15h.01"/>',
  folder: '<path d="M3 5h5l2 2h7v9H3z"/>', card: '<path d="M3 4h14v12H3z M3 8h14"/>', menu: '<path d="M3 5h14 M3 10h14 M3 15h14"/>',
  scan: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M7.8 8a2.2 2.2 0 1 1 3.2 2c-.7.4-1 .8-1 1.5 M10 14h.01"/>', exit: '<path d="M8 3H4v14h4 M12 6l4 4-4 4 M16 10H7"/>',
};
export const icon = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k] || ICON.grid}</svg>`;

function roleText(who) {
  if (!who) return null;
  const k = who.key || '';
  if (k === 'lx/staff') return t('shell.role.staff', { name: who.name });
  if (k === 'lx/admin') return t('shell.role.admin', { name: who.name });
  if (k === 'lx/sales') return t('shell.role.sales', { name: who.name });
  /* 기관 화면 머리 = 사람(기관-1 ⓐ · 시안) — 기관 관리자 · 부서 이름 / 부서 사용자 = 부서 · 이름(계정 값 그대로 · 없으면 역할) */
  if (k === 'tenant/local' && who.name && document.documentElement.lang !== 'en') {
    const dept = who.me?.user?.dept || '';
    return who.me?.role === 'manager' ? `기관 관리자 · ${[dept, who.name].filter(Boolean).join(' ')}` : `${dept || '부서 사용자'} · ${who.name}`;
  }
  return t('shell.role.tenant', { org: who.org || who.name });
}

/* 내 정보(구현 5차 · 확인 17차 P-5 ⓐ) — LX 계정(직원 · 관리자 · 영업) 머리의 내 이름을 누르면 본인이 고치는 창(me.js · 처음 누를 때 불러온다) */
const meOk = (who) => /^lx\//.test(who?.key || '');
function mountMe(el, who) {
  if (!document.querySelector('link[data-k-me]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('./me.css', import.meta.url).href, 'data-k-me': '' }));
  el.type = 'button'; el.title = '내 정보'; el.setAttribute('aria-haspopup', 'dialog');
  el.addEventListener('click', () => import('./me.js').then((m) => m.openMe({ onSaved: (p) => {
    who.name = p.name;
    let [k, n] = (roleText(who) || '').split(' · ');
    if (n && n.trim() === k) n = '';
    el.innerHTML = n ? `<b>${esc(k)}</b>${esc(n)}` : esc(k);
  } })));
}

export function shell({ who = null, home = homeFromPath(), title, rail, onHelp, mount = document.body, contained = false, xiRegion } = {}) {
  /* LX 직원 화면인데 메뉴를 주지 않았으면 LX 직원 메뉴(같은 이름 · 같은 곳 — 원칙 99) */
  if (rail === undefined) rail = STAFF_OF[home] && ['lx/staff', 'lx/admin'].includes(who?.key) ? staffMenu(STAFF_OF[home]) : null;
  const staff = rail?.menu === 'staff';
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
  /* LX 직원 메뉴에 XI맵 칸이 있으면 위 머리 단추는 뺀다(지도-1 ⓐ — 같은 길을 두 번 두지 않는다) */
  const railXi = !!rail?.items?.some((it) => it.id === 'ximap');
  const xi = who && !railXi && home !== 'xi-clean' && allowed('xi-clean', who.key) ? h('a.k-mast-b.k-xi', { href: '/landxi/v3/xi-clean/', text: 'XI맵' }) : null;
  const xiHref = () => {
    let r = null; try { r = (xiRegion && xiRegion()) || new URLSearchParams(location.search).get('region'); } catch { /* */ }
    return '/landxi/v3/xi-clean/' + (r ? '?' + new URLSearchParams({ region: String(r) }) : '');
  };
  if (xi) for (const ev of ['pointerdown', 'focus', 'mouseenter']) xi.addEventListener(ev, () => { xi.href = xiHref(); });
  /* 알림 칸 — 새 요청 · 새 답(LX 관리자 · 기관). LX 직원 메뉴가 있는 화면은 왼쪽 '요청함'(숫자)이 같은 일을 한다(10차 메뉴-1 ⓐ — 위 머리는 역할 · XI맵 · ? · 나가기) */
  const bell = !contained && !staff && hasBell(who) ? h('span.k-bell-slot') : null;
  const mast = h('header.t-mast.k-mast', {},
    h('a.k-word', { href: who?.landing || '/landxi/v3/main/' }, h('span.word', { text: 'LAND-XI' }), name ? h('span.home', { text: name }) : null),
    h('span.sp'), slot, fresh,
    role ? h(meOk(who) ? 'button.t-role.k-role.k-me-b' : 'span.t-role.k-role', { html: rn ? `<b>${esc(rk)}</b>${esc(rn)}` : esc(rk) }) : null,
    xi, bell, help, who ? exit : null);
  const meBtn = mast.querySelector('button.k-me-b');
  if (meBtn) mountMe(meBtn, who);

  const railEl = h('nav.t-rail.k-rail', { 'aria-label': t('shell.menu') });
  const main = h('main.k-main', { id: 'main' });
  const sub = rail?.sub ? h('div.k-sub') : null;     // 마스트 아래 한 줄(프로젝트 안 6단계) — 판보다 먼저 자리를 잡아 지도 크기가 바뀌지 않게
  const more = !!rail?.items?.some((it) => it.more);
  const app = h('div.k-app', { class: [rail && 'has-rail', sub && 'has-sub', more && 'has-more', staff && 'is-staff', contained && 'k-app--in'].filter(Boolean).join(' ') }, mast, rail ? railEl : null, sub, main);
  mount.prepend(app);
  if (bell) mountBell(bell, who);
  /* 마스트 아래 한 줄이 자리를 잡거나 바뀌면 판 크기가 달라진다 — 판 안의 지도(MapLibre 는 창 크기 변화만 듣는다)가 따라오게 한 번 알린다 */
  if (sub && 'ResizeObserver' in window) {
    let first = true, raf = 0;
    new ResizeObserver(() => { if (first) { first = false; return; } cancelAnimationFrame(raf); raf = requestAnimationFrame(() => dispatchEvent(new Event('resize'))); }).observe(main);
  }
  /* XI ChatGEO — 로그인 전(게스트)에는 그리지 않는다(cmdk.js) · 부모 상자 안(갤러리 · 미리보기)과 다른 화면 속 화면(도움말 iframe)에는 붙이지 않는다 */
  let framed = false; try { framed = window.self !== window.top; } catch { framed = true; }
  if (!contained && !framed) mountCmdk({ who, home, guest: !who });

  let cur = rail?.current ?? 0, done = rail?.done;
  const badges = {};                                     // 칸 숫자(요청함) — id → n
  /* 칸 그림 — 아이콘 또는 글자 표기(XI맵 = 'XI' · ChatGEO 'LX' 와 같은 방식 · 새 아이콘 없음) */
  const glyphHtml = (it) => it.glyph ? `<i class="k-rail-g" aria-hidden="true">${esc(it.glyph)}</i>` : icon(it.icon);
  const badgeHtml = (it) => { const n = badges[it.id]; return n ? `<i class="k-rail-b num" aria-hidden="true">${n > 99 ? '99+' : n}</i>` : ''; };
  const drawRail = () => {
    if (!rail) return;
    for (const it of rail.items) if (it.id === 'ximap' && it.href) it.href = xiHref();   // XI맵 칸 = 이 화면의 시군구를 이어 준다(머리 단추와 같은 길)
    const steps = rail.kind === 'steps';
    railEl.classList.toggle('k-rail--steps', steps);
    railEl.innerHTML = rail.items.map((it, i) => {
      const st = done ? (done.includes(i) ? 'done' : i === cur ? 'now' : 'wait') : i < cur ? 'done' : i === cur ? 'now' : 'wait';
      const inner = steps
        ? `<span class="n" data-st="${st}">${st === 'done' ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>' : i + 1}</span><span>${esc(it.label)}</span>`
        : `${glyphHtml(it)}${badgeHtml(it)}<span>${esc(it.label)}</span>`;
      const n = badges[it.id];
      const attrs = `data-i="${i}"${it.id ? ` data-id="${esc(it.id)}"` : ''}${i === cur ? ' aria-current="true"' : ''}${steps ? ` data-st="${st}"` : ''}${n ? ` aria-label="${esc(it.label)} ${n}건"` : ''}`;
      const cls = 'k-rail-i' + (it.more ? ' k-rail-i--more' : '') + (it.end ? ' k-rail-i--end' : '');   // end = 레일 아래쪽 묶음(기관 정보 · 계정 — 기관 메뉴)
      const sep = it.sep && !steps ? '<span class="k-rail-sep" aria-hidden="true"></span>' : '';   // 구분선(지도-1 ⓐ — 분석 흐름 | 데이터 · 요청함)
      return sep + (it.href ? `<a class="${cls}" href="${esc(it.href)}" ${attrs}>${inner}</a>` : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`);
    }).join('') + (more ? `<button type="button" class="k-rail-i k-rail-more" aria-haspopup="dialog"${rail.items[cur]?.more ? ' data-on="1"' : ''}>${icon('menu')}<span>${esc(t('shell.menu'))}</span></button>` : '');
  };
  railEl.addEventListener('pointerdown', (e) => { const x = e.target.closest('a.k-rail-i[data-id="ximap"]'); if (x) x.href = xiHref(); });
  railEl.addEventListener('click', (e) => {
    const b = e.target.closest('.k-rail-i'); if (!b) return;
    if (b.classList.contains('k-rail-more')) { e.preventDefault(); openMore(); return; }
    const i = +b.dataset.i, it = rail.items[i];
    if (!it.href) { e.preventDefault(); cur = i; drawRail(); }
    rail.onPick?.(i, it);
  });
  drawRail();
  /* 칸 숫자 — 처음 · 1분마다 · 창에 돌아올 때 · 이 창에서 요청에 답했을 때('lx:reviews') */
  if (rail?.counts && !contained) {
    const pull = (force) => rail.counts(force).then((m) => { let ch = false; for (const [k, v] of Object.entries(m || {})) if (badges[k] !== v) { badges[k] = v; ch = true; } if (ch) drawRail(); }).catch(() => {});
    pull(false);
    setInterval(() => { if (document.visibilityState === 'visible') pull(true); }, 60000);
    addEventListener('focus', () => pull(true));
    document.addEventListener('lx:reviews', () => pull(true));
  }
  /* 휴대폰(≤ 960) '메뉴' — 아래 탭에 없는 칸(more) + XI맵 · 도움말 · 나가기 */
  function openMore() {
    const list = h('nav.k-more', { 'aria-label': t('shell.menu') });
    let d = null;
    const row = (label, ic, href, on, glyph) => {
      const a = h(href ? 'a.k-more-i' : 'button.k-more-i', href ? { href } : { type: 'button' }, h('span.k-more-ic', { html: glyph ? `<i class="k-rail-g" aria-hidden="true">${esc(glyph)}</i>` : icon(ic) }), h('span', { text: label }));
      if (on) a.addEventListener('click', on);
      list.append(a);
    };
    rail.items.forEach((it, i) => { if (it.more) row(it.label, it.icon, it.id === 'ximap' ? xiHref() : it.href, it.href ? null : () => { d?.close(); cur = i; drawRail(); rail.onPick?.(i, it); }, it.glyph); });
    if (xi) row('XI맵', 'map', xiHref());
    row(t('shell.help'), 'help', null, () => { d?.close(); help.click(); });
    if (who) row(t('shell.exit'), 'exit', null, () => logout());
    d = drawer({ title: t('shell.menu'), body: list, label: t('shell.menu') });
  }

  help.addEventListener('click', () => {
    if (onHelp) return onHelp();
    const d = drawer({ title: t('shell.help'), label: t('shell.help') });
    d.set(h('iframe.k-help-f', { src: '/landxi/v3/help-my/?embed=1', title: t('shell.help'), loading: 'lazy' }));
  });
  exit.addEventListener('click', () => logout());

  const api = {
    app, mast, rail: railEl, main, sub,
    badge(id, n) { badges[id] = n; drawRail(); },
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
    mast(node) {
      slot.innerHTML = '';
      if (!node) return;
      const ASK = '.k-ck-btn, .gl-ask, .lc-ask, [aria-keyshortcuts="Control+K"]';   // 옛 '물어보기' 트리거 — 도우미는 오른쪽 아래 버튼 · 단축키로 연다
      if (node.matches?.(ASK)) return;
      node.querySelectorAll?.(ASK).forEach((n) => n.remove());
      slot.append(node);
    },
  };
  return api;
}
