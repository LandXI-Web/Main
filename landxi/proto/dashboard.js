// LX 관리자 대시보드 — SPLIT-5050 판 스택. 지도 위젯 없음.
// 규칙.
//  1) 기능은 원본과 1:1 — https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html
//     의 레일 A1–A11 · 위젯 B1–B16 이 전부. 대조표 docs/superpowers/proto/2026-08-26-dashboard-parity.md
//  2) 조판은 design-canvas/v2/B5-Dashboard.dc.html rev2 (NOTES.md §12.5): 좌 스택 = 발행 분석 카드의 실체(B5),
//     우 스택 = AI 개발 프로젝트 현황의 실체(B10). 호버 = 판 −8px + 브래킷 + 리더선 + 콜아웃, 나머지 .54.
//  3) 숫자는 results.js · imagery.js · crops.js · dashboard.js 에서만. 원본 시드 = 시연, 우리가 이은 값 = 추정.
//     판 위 청록 지오메트리는 GeoJSON 을 크롭의 z19 격자로 투영한 것(db-geo.js) — 손으로 옮긴 좌표가 아니다.
//  4) 불필요한 글자 없음(발주 2026-08-27): 설명 문장 0, 수치·칩만. 자세한 값은 호버 콜아웃에.
import {
  nf, ymd, T1, DONE, IMG, BACKBONE, KPI, NAV, NAV_FOOT, NAV_MY, NOTICE, APPROVALS, ADMIN_TILES,
  PROJECTS, VISITS, VISITS_TOTAL, STORAGE, JOBS, JOB_UNMAPPED, CHANGE_PAIRS,
} from './db-data.js';
import { CROPS } from '../assets/data/crops.js';
import { CHANGE } from '../assets/data/change.js';
import { drapeSvg } from './db-geo.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE4 = (k) => 1 - (1 - k) ** 4;
const cm = (gsd) => (gsd < 1 ? `${+(gsd * 100).toFixed(2)} cm` : `${gsd} m`);
const ym = (s) => s.slice(0, 7);
const sayEl = $('#say'); let sayT = 0;
function say(t) { sayEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4200); }

/* ══ A1–A11 좌측 레일 — 데이터 관리와 같은 컴포넌트 ═══════════════════════
   원본 페이지가 저장소에 없는 항목은 같은 데이터가 있는 우리 자리로 보낸다(to). */
const ICON = {
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
const RAIL_TO = { media: null, project: 'stack-r', analysis: 'stack-l', map: 'stack-l', support: 'b-notice', 'publish-admin': 'b-approve', admin: 'ad-rows' };
const RAIL_GO = { media: 'dataset.html' };
const railSvg = (k) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[k] || ''}</svg>`;
const railItem = (n) => `
  <button type="button" class="rail-i" data-menu="${n.menu}" data-to="${RAIL_TO[n.menu] || ''}" data-go="${RAIL_GO[n.menu] || ''}"
    title="원본 ${n.href}"${n.menu === 'dashboard' ? ' aria-current="page"' : ''}${n.menu === 'my' ? ' aria-haspopup="menu" aria-expanded="false"' : ''}>${railSvg(n.icon)}<span class="rl">${esc(n.name)}</span></button>`;
$('#rail-top').innerHTML = NAV.map(railItem).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map(railItem).join('')
  + railItem({ menu: 'my', name: 'MY', href: 'mypage.html', icon: 'my' })
  + `<button type="button" class="rail-i" data-action="logout" title="원본 로그아웃">${railSvg('out')}<span class="rl">로그아웃</span></button>`;
$('#rail-my').innerHTML = NAV_MY.map((m) => (m.action
  ? `<button type="button" data-action="${m.action}">${esc(m.name)}</button>`
  : `<a href="${m.href}" title="원본 mypage.html">${esc(m.name)}</a>`)).join('');

function logout() { try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ } location.href = 'scrub/index.html'; }
function goTo(id) {
  const el = document.getElementById(id); if (!el) return;
  el.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' });
  if (el.classList.contains('stack')) { const f = $('.pl.is-front', el); if (f) { f.focus({ preventScroll: true }); } return; }
  const t = el.matches('a,button,[tabindex]') ? el : $('a,button,[tabindex]', el);
  if (t) t.focus({ preventScroll: true });
}
$('#rail').addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="logout"]')) { logout(); return; }
  const b = ev.target.closest('.rail-i[data-menu]'); if (!b) return;
  if (b.dataset.menu === 'my') { const fly = $('#rail-my'); fly.hidden = !fly.hidden; b.setAttribute('aria-expanded', String(!fly.hidden)); return; }
  if (b.dataset.menu === 'dashboard') { window.scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }); return; }
  if (b.dataset.go) { location.href = b.dataset.go; return; }
  if (b.dataset.to) goTo(b.dataset.to);
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('#rail')) { $('#rail-my').hidden = true; $('#rail [data-menu="my"]').setAttribute('aria-expanded', 'false'); }
});

/* ══ 마스트헤드 — B3 공지 · B2 기준일(데이터 기준시점, 오늘이 아니다) ═══════ */
$('#notice-t').textContent = NOTICE.title;
$('#notice-d').textContent = ymd(NOTICE.date);
$('#b-notice').href = `${NOTICE.more}?notice=${NOTICE.id}`;
$('#b2-d').textContent = ymd(T1);

/* ══ SPLIT-5050 · 판 스택 ═══════════════════════════════════════════════
   판 = 실크롭(crops.js) 위 흰 그래티큘 4×2. 좌 스택은 결과 GeoJSON 을 투영해 청록으로 얹는다. */
const RES = Object.fromEntries(DONE.map((r) => [r.id, r]));
const crop = (k, i) => CROPS[k][i];
const topClasses = (cls, n = 2) => Object.entries(cls || {}).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => `${k.replace(/^비닐하우스_/, '')} ${nf.format(v)}`).join(' · ');
const nClasses = (r) => Object.keys(r.classes || {}).length;
const ep2506 = IMG.find((i) => i.id === 'namwon_2506');
const P_FARM = PROJECTS.find((p) => /농지/.test(p.name));

/** 좌 스택 — 발행 분석 카드 8건의 실체: 실측 결과 4 · 비지도 1 · 준비 중 1. 앞(01)이 배열 끝. */
const LEFT = [
  { no: '06', name: '도로안전 다시점 조사', v: '준비 중', ghost: true, empty: true,
    call: { c2: '준비 중', c3: ['결과 파일 없음', '카드 매핑 미확정'] } },
  { no: '05', name: '남원 변화지수', tagn: '비지도', v: `${nf.format(CHANGE_POLYS())}폴리곤 · 4시점 ${ym(CHANGE[0].fromDate)}→${ym(CHANGE[CHANGE.length - 1].toDate).slice(5)}`,
    ghost: true, crop: crop('namwon-epoch', 3), img: crop('namwon-epoch', 3).file, geo: CHANGE_PAIRS[0].polygons, unit: '폴리곤',
    call: { c2: `${nf.format(CHANGE_POLYS())}<small>폴리곤</small>`, c3: [
      `비지도 · 탐지 아님`,
      CHANGE.slice(0, 3).map((c) => `${c.toDate.slice(2)} ${c.stats.n}`).join(' · '),
      `${ym(CHANGE[0].fromDate)} → ${ym(CHANGE[CHANGE.length - 1].toDate)} 드론`,
      '__ON__', `추정 · 기준 ${ym(CHANGE[CHANGE.length - 1].toDate)}`] } },
  res('04', 'yeosu-marine-2026-drone', '여수 해양쓰레기 드론', 0, (r) => `${nf.format(r.count)}건 · ${nClasses(r)}종 · ${r.date.slice(0, 4)}`),
  res('03', 'yeosu-marine-2025-aerial', '여수 해양쓰레기 항공', 0, (r) => `${nf.format(r.count)}건 · 스티로폼 ${nClasses(r)}종 · ${r.date.slice(0, 4)}`),
  res('02', 'namwon-greenhouse-2025', '남원 비닐하우스', 0, (r) => `${nf.format(RES_OBJ(r.id))}동 · ${nf.format(r.count)}필지 · ${r.date.slice(0, 4)} ${r.sensor}`),
  res('01', 'namwon-farmland-2025', '남원 농지이용', 1, (r) => `${nf.format(r.count)}${r.unit} · ${r.date.slice(0, 4)} ${r.sensor}`),
];
function CHANGE_POLYS() { return CHANGE.reduce((a, c) => a + c.stats.n, 0); }
function RES_OBJ(id) { const r = RES[id]; return r && r.objTotal ? r.objTotal : 0; }
function res(no, id, name, ci, vf) {
  const r = RES[id]; const c = crop(id, ci);
  const big = id === 'namwon-greenhouse-2025' ? RES_OBJ(id) : r.count;
  const unit = id === 'namwon-greenhouse-2025' ? '동' : r.unit;
  return { no, name, id, v: vf(r), crop: c, img: c.clean || c.file, geo: r.geojson, unit: r.unit,
    call: { c2: `${nf.format(big)}<small>${unit}</small>`, c3: [
      topClasses(r.classes),
      `${r.date.slice(0, 4)} ${r.sensor} · GSD ${cm(c.gsd)} <em>추정</em>`,
      `${BACKBONE.name} ${BACKBONE.ver} · 신뢰도 μ ${r.conf.toFixed(2)}`,
      '__ON__',
      `측정 · 기준 ${ymd(r.date)}`] } };
}

/** 우 스택 — AI 개발 프로젝트 현황의 실체: 정사영상 시점 7. 앞(01) = 라벨이 연결된 2025-06. */
const img = (id) => IMG.find((i) => i.id === id);
const bound = (i) => [`E ${i.bounds[0].toFixed(3)}–${i.bounds[2].toFixed(3).slice(-4)} · 줌 ${i.minzoom}–${i.maxzoom}`, `N ${i.bounds[1].toFixed(3)}–${i.bounds[3].toFixed(3).slice(-4)} · ${i.kind === 'ortho' ? '드론' : '항공'}`];
const ep = (no, id, ci, extra, lab) => {
  const i = img(id); const c = crop('namwon-epoch', ci);
  return { no, name: `남원 농경지 ${i.captured}`, v: `드론 · GSD ${cm(i.gsd)} · ${lab}`, crop: c, img: c.file,
    call: { c2: `GSD ${cm(i.gsd).replace(' cm', '<small>cm</small>')}`, c3: [...bound(i), lab, ...extra, `측정 · 촬영 ${i.captured}`] } };
};
const city = img('namwon_city_2510');
const RIGHT = [
  { no: '07', name: `여수 항공 ${RES['yeosu-marine-2025-aerial'].date.slice(0, 4)} · 드론 ${RES['yeosu-marine-2026-drone'].date.slice(0, 4)}`, v: '타일 카탈로그 미등록 · 결과만 보유', ghost: true, empty: true,
    call: { c2: '미등록', c3: ['타일 카탈로그 미등록', `결과 ${nf.format(RES['yeosu-marine-2025-aerial'].count + RES['yeosu-marine-2026-drone'].count)}건 보유`] } },
  (() => { const a = img('jeju_2020'), b = img('jeju_2022'), c = crop('jeju-illegal', 1);
    return { no: '06', name: `제주 항공 ${a.captured} · ${b.captured}`, v: `GSD ${cm(a.gsd)} · ${cm(b.gsd)} · 토지형질`, crop: c, img: c.clean || c.file,
      call: { c2: `GSD ${cm(b.gsd).replace(' cm', '<small>cm</small>')}`, c3: [...bound(b), `${cm(a.gsd)} · ${a.captured} 불법건축물 도엽`, `토지형질 세그멘테이션 ${b.captured}`, `측정 · 촬영 ${b.captured}`] } }; })(),
  (() => { const a = img('kuksan_a68'), c = crop('kuksan-change', 0);
    return { no: '05', name: '국산리 드론 A68 · A71', v: `${a.captured} · GSD ${cm(a.gsd)} · 2비행`, crop: c, img: c.file,
      call: { c2: `GSD ${cm(a.gsd).replace(' cm', '<small>cm</small>')}`, c3: [...bound(a), 'A68 · A71 2비행', '변화탐지 · 라벨 연결 없음', `측정 · 촬영 ${a.captured}`] } }; })(),
  ep('04', 'namwon_2510', 3, [], `전역 ${cm(city.gsd)}`),
  ep('03', 'namwon_2508', 2, [], '라벨 연결 없음'),
  ep('02', 'namwon_2504', 0, [], '라벨 연결 없음'),
  (() => { const i = ep2506; const c = crop('namwon-epoch', 1);
    return { no: '01', name: `남원 농경지 ${i.captured}`, v: `드론 · GSD ${cm(i.gsd)} · 라벨 연결`, crop: c, img: c.file,
      call: { c2: `GSD ${cm(i.gsd).replace(' cm', '<small>cm</small>')}`, c3: [...bound(i),
        `라벨 ${nf.format(RES['namwon-farmland-2025'].count)} + ${nf.format(RES['namwon-greenhouse-2025'].count)}필지 <em>추정</em>`,
        `용량 ${P_FARM.gb} GB <em>시연 · 추정</em>`, `측정 · 촬영 ${i.captured}`] } }; })(),
];

const GRAT = '<g class="grat"><line x1="128" y1="0" x2="128" y2="420"/><line x1="256" y1="0" x2="256" y2="420"/><line x1="384" y1="0" x2="384" y2="420"/><line x1="512" y1="0" x2="512" y2="420"/><line x1="0" y1="140" x2="640" y2="140"/><line x1="0" y1="280" x2="640" y2="280"/></g>';
function plateHtml(p, top, z, side) {
  const c3 = (p.call.c3 || []).map((t) => `<div class="c3${t === '__ON__' ? ' on' : ''}">${t === '__ON__' ? '' : t}</div>`).join('');
  return `<div class="pl${p.ghost ? ' is-ghost' : ''}${p.no === '01' ? ' is-front' : ''}" role="listitem" tabindex="0" data-no="${p.no}" data-side="${side}"${p.id ? ` data-id="${p.id}"` : ''}
      style="top:calc(${top}px * var(--ps));z-index:${z}" aria-label="${esc(p.no)} ${esc(p.name)} — ${esc(p.v)}">
    <div class="box">${p.img ? `<img src="../${esc(p.img)}" alt="" loading="lazy">` : ''}
      <svg viewBox="0 0 640 420" preserveAspectRatio="xMidYMid slice">${p.empty ? '' : GRAT}<g class="geo"></g></svg></div>
    <i class="bk bk-tl"></i><i class="bk bk-tr"></i><i class="bk bk-bl"></i><i class="bk bk-br"></i>
    <svg class="lead" viewBox="0 0 24 20" aria-hidden="true"><rect x="0.5" y="0.5" width="5" height="5" fill="#006DF7"/><polyline points="3,3 11,3 11,17 16,17" fill="none" stroke="#006DF7" stroke-width="1"/></svg>
    <i class="tick"></i>
    <div class="lab"><span class="n i">${p.no}</span> · ${esc(p.name)}${p.tagn ? ` <span class="i">${esc(p.tagn)}</span>` : ''}<span class="n v">${esc(p.v)}</span></div>
    <div class="callout n" role="tooltip"><div class="c1"><span class="i">${p.no}</span> · ${esc(p.name)}</div><div class="c2 big">${p.call.c2}</div>${c3}</div>
  </div>`;
}
function buildStack(el, list, pitch) {
  const n = list.length;
  el.innerHTML = list.map((p, i) => plateHtml(p, i === n - 1 ? 232 : i * pitch, i + 1, el.id.endsWith('-l') ? 'l' : 'r')).join('');
}
buildStack($('#plates-l'), LEFT, 48);
buildStack($('#plates-r'), RIGHT, 40);
const chips = (arr) => arr.map(([k, v]) => `<span class="chip">${esc(k)} <b class="n">${esc(v)}</b></span>`).join('');
$('#sl-sub').innerHTML = chips([['실측', 4], ['비지도', 1], ['준비 중', 1]]) + `<span class="chip dim">카드 ↔ 결과 매핑 미확정</span>`;
$('#sr-sub').innerHTML = PROJECTS.map((p, i) => `<span class="chip${i ? '' : ' on'}">${esc(p.name)} <b class="n">${p.gb}</b></span>`).join('');
$('#proj-sum').dataset.n = String(PROJECTS.reduce((a, p) => a + p.gb, 0));
$('#sl-src').innerHTML = `출처 · 남원 ${RES['namwon-farmland-2025'].date.slice(0, 4)} 드론 · 여수 ${RES['yeosu-marine-2025-aerial'].date.slice(0, 4)} 항공 · ${RES['yeosu-marine-2026-drone'].date.slice(0, 4)} 드론 · 변화지수 4시점<i> | </i>기준 ${ymd(T1)}`;
$('#sr-src').innerHTML = `출처 · 정사영상 타일 카탈로그 ${IMG.length}종 · 프로젝트 용량 집계<span class="tag">시연</span><i> | </i>기준 ${ym(T1).replace('-', '.')}`;

/* 호버·포커스 — 한 번에 하나만 뜨겁다 */
let hot = null;
function setHot(pl) {
  if (hot === pl) return;
  if (hot) { hot.classList.remove('is-hot'); hot.closest('.plates').classList.remove('is-hot'); }
  hot = pl;
  if (pl) { pl.classList.add('is-hot'); pl.closest('.plates').classList.add('is-hot'); }
  document.documentElement.dataset.hot = pl ? `${pl.dataset.side}-${pl.dataset.no}` : '';
}
for (const wrap of $$('.plates')) {
  wrap.addEventListener('pointerover', (ev) => { const pl = ev.target.closest('.pl'); if (pl) setHot(pl); });
  wrap.addEventListener('pointerleave', () => { if (hot && !hot.matches(':focus-visible')) setHot(null); });
  wrap.addEventListener('focusin', (ev) => { const pl = ev.target.closest('.pl'); if (pl) setHot(pl); });
  wrap.addEventListener('focusout', (ev) => { if (!wrap.contains(ev.relatedTarget)) setHot(null); });
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { setHot(null); ev.target.blur(); } });
}

/* 반응형 판 배율 — 컬럼 폭에서 라벨 컬럼 193 을 뺀 만큼만 판이 차지한다 */
function fitPlates() {
  for (const wrap of $$('.plates')) {
    const s = Math.min(1, Math.max(.55, (wrap.clientWidth - 193) / 411));
    wrap.style.setProperty('--ps', s.toFixed(3));
  }
}
fitPlates();
new ResizeObserver(fitPlates).observe($('#split'));

/* 결과 지오메트리 — GeoJSON 을 크롭의 z19 격자로 투영해 판에 얹는다(좌 스택만, 청록) */
async function drape() {
  const jobs = LEFT.filter((p) => p.geo && p.crop);
  let ok = 0;
  await Promise.all(jobs.map(async (p) => {
    const pl = $(`#plates-l .pl[data-no="${p.no}"]`); const on = $('.callout .c3.on', pl);
    try {
      const fc = await (await fetch(p.geo)).json();
      const d = drapeSvg(fc, p.crop);
      $('.geo', pl).innerHTML = d.svg;
      pl.dataset.geo = String(d.n);
      on.textContent = `판 위 ${nf.format(d.n)}${p.unit}${d.emd ? ` · ${d.emd}${RES[p.id] && RES[p.id].emd && RES[p.id].emd[d.emd] ? ` ${nf.format(RES[p.id].emd[d.emd])}` : ''}` : ''}`;
      ok++;
    } catch (e) { on.textContent = '지오메트리 결측'; pl.dataset.geo = 'x'; }
  }));
  document.documentElement.dataset.geo = ok === jobs.length ? 'ready' : 'partial';
}

/* ══ 띠 — B4 · B6 · B7 · B8 KPI 텍스트 4 ═══════════════════════════════ */
const KPI4 = KPI.filter((k) => k.label !== '발행 분석 카드');
const kpiSub = (k) => k.sub.replace('가입 승인 대기', '대기').replace('답변 필요', '').replace(/ · $/, '');
$('#b-kpi').innerHTML = KPI4.map((k) => {
  const inner = `<span class="kl">${esc(k.label)}</span><span class="kv"><b class="big cu" data-n="${k.value}">0</b><span>${esc(k.unit)}</span></span>
    <span class="ks n">${esc(kpiSub(k))}${k.to ? ' · <span class="dim">?status=대기</span>' : ''}</span>`;
  return k.to ? `<a class="k" role="listitem" href="dashboard.html?status=대기" title="원본 ${esc(k.href)}">${inner}</a>`
    : `<div class="k" role="listitem" title="원본 ${esc(k.href)}">${inner}</div>`;
}).join('');

/* B11 — 최근 7일 방문, SVG 폴리라인 · 7값 전부, 양끝·최대만 잉크 */
{
  const W = 300, H = 32, n = VISITS.length, max = Math.max(...VISITS.map((v) => v.count)), min = Math.min(...VISITS.map((v) => v.count));
  const x = (i) => 3 + (i * (W - 6)) / (n - 1), y = (v) => 3 + ((max - v) / (max - min || 1)) * (H - 8);
  const imax = VISITS.findIndex((v) => v.count === max);
  const on = (i) => i === 0 || i === n - 1 || i === imax;
  $('#t-visit').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" y1="${H - .5}" x2="${W}" y2="${H - .5}" stroke="#DDDDDD"/>
    <polyline points="${VISITS.map((v, i) => `${x(i).toFixed(1)},${y(v.count).toFixed(1)}`).join(' ')}" fill="none" stroke="#010102" stroke-width="1" vector-effect="non-scaling-stroke"/>
    ${VISITS.map((v, i) => `<rect x="${(x(i) - 2.5).toFixed(1)}" y="${(y(v.count) - 2.5).toFixed(1)}" width="5" height="5" fill="${on(i) ? '#010102' : '#FFF'}" stroke="#010102"/>`).join('')}
  </svg><div class="ax n">${VISITS.map((v, i) => `<span class="${on(i) ? 'on' : ''}" style="left:${i === 0 ? 0 : i === n - 1 ? 'auto' : `calc(${(i / (n - 1)) * 100}% - 22px)`};${i === n - 1 ? 'right:0' : ''}">${v.day}${on(i) ? ` ${nf.format(v.count)}` : ''}</span>`).join('')}</div>`;
  $('#visit-sum').dataset.n = String(VISITS_TOTAL);
}

/* B12 — 전체 스토리지 사용량, SVG 스택 바 16px */
{
  const W = 290, tot = STORAGE.total; let x = 0;
  const tone = ['#010102', '#686868', '#686868', '#CCCCCC', '#CCCCCC', '#CCCCCC'];
  $('#t-store').innerHTML = `<svg viewBox="0 0 ${W} 16" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="${W - 1}" height="15" fill="none" stroke="#DDDDDD"/>
    ${STORAGE.parts.map((p, i) => { const w = (p.tb / tot) * W; const r = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="16" fill="${tone[i]}"><title>${esc(p.label)} ${p.tb} TB</title></rect>`; x += w; return r; }).join('')}</svg>
    <div class="lg n">${STORAGE.parts.map((p) => `<span>${esc(p.label)} ${p.tb}</span>`).join('')}<span class="dim">잔여 ${(tot - STORAGE.used).toFixed(1)}</span></div>`;
  $('#store-used').dataset.n = String(STORAGE.used);
  $('#store-tot').textContent = String(tot);
}

/* ══ B9 백본 한 줄 ══════════════════════════════════════════════════════ */
$('#bb-name').textContent = `${BACKBONE.name} ${BACKBONE.ver}`;
$('#bb-applied').textContent = `최종 적용 ${BACKBONE.applied}`;
$('#bb-tasks').innerHTML = `연결된 분석 과제 ${BACKBONE.tasks}개 <span class="dim">(측정 ${JOBS.length} · AOI 미지정 ${JOB_UNMAPPED})</span>`;

/* ══ B13 카드 발행 승인 대기 — 원본 CARD_APPROVALS 2건, 행 → ?open=<id> ═══ */
$('#ap-rows').innerHTML = APPROVALS.map((a, i) => {
  const m = a.title.match(/^(.*?)\s+(v[\d.]+)$/); const name = m ? m[1] : a.title, ver = m ? m[2] : '';
  const href = `dashboard.html?open=${a.id}`;
  const cell = (t, cls = '') => `<td class="${cls}"><a href="${href}" tabindex="-1">${t}</a></td>`;
  return `<tr class="ap" data-id="${a.id}" title="원본 admin-publish.html?open=${a.id}">
    ${cell(`<span class="i">${String(i + 1).padStart(2, '0')}</span>`)}${cell(esc(name))}${cell(esc(ver))}
    ${cell(`${esc(a.at)}<span class="tag">시연</span>`)}${cell(`남원시 ${esc(a.emd)}<span class="tag">추정</span>`)}${cell('<span class="st">승인 대기</span>')}
    <td class="r"><a class="go" href="${href}">검토 › <span class="dim">?open=${a.id}</span></a></td></tr>`;
}).join('');

/* ══ B14 관리 바로가기 — CHIP-RAIL 4 ═════════════════════════════════════ */
const AD_ICON = ['<path d="M8 4.5h4v4H8z"/><path d="M4.5 16v-3.5h11V16"/>', '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>', '<path d="M3 5h14v10H3z"/><path d="m3 5 7 5.5L17 5"/>', '<path d="M3 3h14v14H3z"/><path d="M6 7.5h8M8.5 12.5h5.5"/><path d="M5.5 11h2v3h-2z"/>'];
$('#ad-rows').insertAdjacentHTML('beforeend', ADMIN_TILES.map((t, i) => `<a class="ad" href="../${esc(t.href)}" title="원본 ${esc(t.href)}">
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${AD_ICON[i]}</svg>
  <span class="d">${esc(t.name)}</span><span class="mic n">${esc(t.desc)}</span><span class="mic">›</span></a>`).join(''));

/* ══ B15 푸터 ═══════════════════════════════════════════════════════════ */
$('#foot-l').textContent = 'LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부';

/* ══ B16 딥링크 — ?status=대기 → B13 블록, ?open=<id> → 그 행 ════════════ */
function deepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('status') === '대기') { $('#b-approve').setAttribute('aria-current', 'true'); document.documentElement.dataset.deep = 'status'; setTimeout(() => goTo('b-approve'), 300); }
  const open = q.get('open');
  if (open) {
    const tr = $(`#ap-rows tr[data-id="${CSS.escape(open)}"]`);
    if (tr) { tr.setAttribute('aria-current', 'true'); document.documentElement.dataset.deep = 'open:' + open; setTimeout(() => { tr.scrollIntoView({ block: 'center' }); $('.go', tr).focus({ preventScroll: true }); }, 300); }
    else { document.documentElement.dataset.deep = 'open:missing'; say(`?open=${open} — 승인 대기 목록에 없는 카드`); }
  }
}

/* ══ 도착 — 카운트업 900ms easeOutQuart · 유휴 1(앞 판 결과 스윕, 6 s) ═════ */
function countUp(el) {
  const to = parseFloat(el.dataset.n || el.textContent) || 0, dec = +(el.dataset.dec || 0);
  const fmt = (v) => (dec ? v.toFixed(dec) : nf.format(Math.round(v)));
  if (REDUCED()) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(to * EASE4(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function idle() {
  if (REDUCED()) return;
  setInterval(() => {
    const f = $('#plates-l .pl.is-front'); if (!f || hot) return;
    f.classList.add('is-sweep'); setTimeout(() => f.classList.remove('is-sweep'), 1100);
  }, 6000);
}

requestAnimationFrame(() => {
  document.documentElement.dataset.dash = 'ready';
  $$('.cu').forEach(countUp);
  deepLink();
  drape().then(idle);
});
