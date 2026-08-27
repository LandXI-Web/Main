// LX 관리자 대시보드 — 발주자 보드 B5-Dashboard-Data (1 판 + 토글 2 · 우 탭 패널 1).
// 규칙.
//  1) 기능은 원본과 1:1 — https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html
//     의 레일 A1–A11 · 위젯 B1–B16 이 전부. 대조표 docs/superpowers/proto/2026-08-26-dashboard-parity.md
//  2) 조판은 design-canvas/v2/B5-Dashboard-Data.dc.html. B10·B11·B12 는 우 패널의 탭 3 = 각 1회.
//  3) 숫자는 results.js · imagery.js · change.js · services.js · dashboard.js 에서만. 원본 시드 = 시연, 우리가 이은 값 = 추정.
//     판 위 셀은 실좌표(db-cells.js)를 판에 투영한 것 — 손으로 놓은 셀이 아니다.
//  4) 불필요한 글자 없음: 설명 문장 0. 자세한 값은 호버 콜아웃에.
import {
  nf, ymd, T1, BACKBONE, KPI, NAV, NAV_FOOT, NAV_MY, NOTICE, APPROVALS, ADMIN_TILES,
  PROJECTS, VISITS, VISITS_TOTAL, STORAGE, JOBS, JOB_UNMAPPED, IMG,
} from './db-data.js';
import { RESULTS } from '../assets/data/results.js';
import { CHANGE } from '../assets/data/change.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { SERVICES } from '../assets/data/services.js';
import { EOX } from './js/sources.js';
import { buildCells, gradeResult, gradeTrain, fitProjector, gridLines, cellRect, cellRange, PLATE_BOUNDS, STEP } from './db-cells.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE4 = (k) => 1 - (1 - k) ** 4;
const cm = (gsd) => (gsd < 1 ? `${+(gsd * 100).toFixed(2)} cm` : `${gsd} m`);
const sayEl = $('#say'); let sayT = 0;
function say(t) { sayEl.textContent = t; clearTimeout(sayT); sayT = setTimeout(() => { sayEl.textContent = ''; }, 4200); }

/* ══ A1–A11 좌측 레일 ═══════════════════════════════════════════════════ */
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
// 원본 페이지가 저장소에 없는 항목은 같은 데이터가 있는 우리 자리로: 프로젝트 → 탭 1, 분석 → 판, 지도 → 판, 지원 → 공지 …
const RAIL_TO = { project: 'tab:proj', analysis: 'plate', map: 'plate', support: 'b-notice', 'publish-admin': 'b-approve', admin: 'ad-rows' };
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
  if (id.startsWith('tab:')) { setTab(id.slice(4)); $(`#tab-${id.slice(4)}`).focus(); return; }
  if (id === 'plate') { $('#plate-wrap').scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' }); const c = $('#cells .cell[data-g="3"], #cells .cell'); if (c) c.focus({ preventScroll: true }); return; }
  const el = document.getElementById(id); if (!el) return;
  el.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'center' });
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

/* ══ 마스트헤드 — B3 · B2(데이터 기준시점) ═══════════════════════════════ */
$('#notice-t').textContent = NOTICE.title;
$('#notice-d').textContent = ymd(NOTICE.date);
$('#b-notice').href = `${NOTICE.more}?notice=${NOTICE.id}`;
$('#b2-d').textContent = ymd(T1);

/* ══ B4–B8 KPI 5 ═══════════════════════════════════════════════════════ */
$('#b-kpi').innerHTML = KPI.map((k) => {
  const inner = `<span class="kl">${esc(k.label)}</span><span class="kv"><b class="big cu" data-n="${k.value}">0</b><span>${esc(k.unit)}</span></span>
    <span class="ks n">${esc(k.sub)}${k.to ? ' · <span class="dim">?status=대기</span>' : ''}</span>`;
  return k.to ? `<a class="k" role="listitem" href="dashboard.html?status=대기" title="원본 ${esc(k.href)}">${inner}</a>`
    : `<div class="k" role="listitem" title="원본 ${esc(k.href)}">${inner}</div>`;
}).join('');

/* ══ B9 백본 헤더 ══════════════════════════════════════════════════════ */
$('#bb-name').textContent = `${BACKBONE.name} ${BACKBONE.ver}`;
$('#bb-sub').innerHTML = `최종 적용 ${BACKBONE.applied} · 연결된 분석 과제 ${BACKBONE.tasks}개 <span class="dim">(측정 ${JOBS.length} · AOI 미지정 ${JOB_UNMAPPED})</span>`;

/* ══ 판 — 대한민국 전도 · 0.25° 그리드 · 셀 = 실자산 위치 ═══════════════════ */
const CELLS = [...buildCells({ RESULTS, CHANGE, IMAGERY, SERVICES }).values()];
const wrap = $('#plate-wrap'), gridEl = $('#grid'), cellsEl = $('#cells'), callout = $('#callout'), legendEl = $('#legend');
let MODE = 'res', PROJ = null, map = null;
const grade = (c) => (MODE === 'res' ? gradeResult(c) : gradeTrain(c));

function layoutPlate() {
  const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
  PROJ = fitProjector(PLATE_BOUNDS, w, h, 6);
  gridEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  gridEl.innerHTML = gridLines(PROJ, w, h).map((l) => (l.d === 'v'
    ? `<line x1="${l.p.toFixed(2)}" y1="0" x2="${l.p.toFixed(2)}" y2="${h}"${l.major ? ' class="major"' : ''}/>`
    : `<line x1="0" y1="${l.p.toFixed(2)}" x2="${w}" y2="${l.p.toFixed(2)}"${l.major ? ' class="major"' : ''}/>`)).join('');
  for (const c of CELLS) {
    const el = $(`.cell[data-key="${c.key}"]`, cellsEl); if (!el) continue;
    const r = cellRect(c, PROJ);
    el.style.cssText = `left:${r.x.toFixed(2)}px;top:${r.y.toFixed(2)}px;width:${r.w.toFixed(2)}px;height:${r.h.toFixed(2)}px`;
  }
  if (map) map.jumpTo({ center: PROJ.center, zoom: PROJ.zoom });
}
function cellLabel(c) {
  const g = grade(c); const rg = cellRange(c);
  const n = c.results.length + c.change.length;
  const head = `${c.name || '셀'} ${rg.e} · ${rg.n}`;
  if (MODE === 'res') return `${head} — ${n ? `AI 분석 결과 ${n}건` : g === 'train' ? '학습데이터만' : g === 'plan' ? '조사 예정' : ''}`;
  return `${head} — 학습데이터 ${c.imagery.length}종`;
}
cellsEl.innerHTML = CELLS.map((c) => `<button type="button" class="cell" role="listitem" data-key="${c.key}" data-x="${c.x0}" data-y="${c.y0}" aria-label="${esc(cellLabel(c))}">
  <i class="bk bk-tl"></i><i class="bk bk-tr"></i><i class="bk bk-bl"></i><i class="bk bk-br"></i></button>`).join('');

function paintCells() {
  wrap.dataset.mode = MODE;
  const tally = {};
  for (const c of CELLS) {
    const g = grade(c); const el = $(`.cell[data-key="${c.key}"]`, cellsEl);
    if (g == null) el.removeAttribute('data-g'); else { el.dataset.g = String(g); tally[g] = (tally[g] || 0) + 1; }
    el.setAttribute('aria-label', cellLabel(c));
  }
  const rows = MODE === 'res'
    ? [['3', '결과 3건 이상'], ['2', '결과 2건'], ['1', '결과 1건'], ['train', '학습데이터만 · 결과 없음'], ['plan', '조사 예정']]
    : [['3', '시점 4 이상'], ['2', '시점 2–3'], ['1', '시점 1'], ['res', '결과만 · 영상 미등록']];
  legendEl.innerHTML = `<div class="lg-h">그리드 ${STEP}° · ${MODE === 'res' ? '청록 진하기 = 결과 건수' : '파랑 진하기 = 정사영상 시점 수'}</div>`
    + rows.filter(([g]) => tally[g]).map(([g, t]) => `<div class="lg"><span class="sw" data-g="${g}"></span>${t} <span class="n">${tally[g]}셀</span></div>`).join('');
}
const fmtRes = (r) => `${r.name} ${nf.format(r.objTotal && r.name === '비닐하우스' ? r.objTotal : r.count)}${r.objTotal && r.name === '비닐하우스' ? '동' : r.unit}`;
function calloutHtml(c) {
  const rg = cellRange(c);
  const c1 = `<div class="c1">${esc(c.name || '셀')} <span class="i">${rg.e} · ${rg.n}</span></div>`;
  if (MODE === 'res') {
    const n = c.results.length + c.change.length;
    if (n) {
      const rs = c.results.map(fmtRes);
      const lines = []; for (let i = 0; i < rs.length; i += 2) lines.push(rs.slice(i, i + 2).join(' · '));
      const ch = c.change.map((x) => `${x.name} ${nf.format(x.count)}${x.unit} <em>· ${x.method}</em>`);
      return c1 + `<div class="c2">AI 분석 결과 <span class="n">${n}건</span></div>` + [...lines, ...ch].map((l) => `<div class="c3">${l}</div>`).join('');
    }
    if (c.imagery.length) return c1 + `<div class="c2">학습데이터만 · 결과 없음</div>` + c.imagery.slice(0, 3).map((i) => `<div class="c3">${esc(i.label)} <em>${cm(i.gsd)}</em></div>`).join('');
    return c1 + `<div class="c2">조사 예정</div>` + c.planned.map((p) => `<div class="c3">${esc(p.name)} <em>결과 파일 없음</em></div>`).join('');
  }
  if (c.imagery.length) {
    return c1 + `<div class="c2">학습데이터 <span class="n">${c.imagery.length}종</span></div>`
      + c.imagery.slice(0, 4).map((i) => `<div class="c3">${esc(i.captured)} · GSD ${cm(i.gsd)}${i.city ? ' <em>전역</em>' : ''}${i.kind !== 'ortho' ? ' <em>' + esc(i.kind) + '</em>' : ''}</div>`).join('')
      + (c.imagery.length > 4 ? `<div class="c3"><em>+${c.imagery.length - 4}</em></div>` : '');
  }
  return c1 + `<div class="c2">영상 미등록</div>` + c.results.map((r) => `<div class="c3">${fmtRes(r)} <em>결과만</em></div>`).join('');
}
let hot = null;
function setHot(el) {
  if (hot === el) return;
  if (hot) hot.classList.remove('is-hot');
  hot = el;
  if (!el) { callout.hidden = true; document.documentElement.dataset.hot = ''; return; }
  el.classList.add('is-hot');
  const c = CELLS.find((x) => x.key === el.dataset.key);
  callout.innerHTML = calloutHtml(c); callout.hidden = false;
  document.documentElement.dataset.hot = c.key;
}
cellsEl.addEventListener('pointerover', (ev) => { const el = ev.target.closest('.cell'); if (el) setHot(el); });
cellsEl.addEventListener('pointerleave', () => { if (hot && !hot.matches(':focus-visible')) setHot(null); });
cellsEl.addEventListener('focusin', (ev) => { const el = ev.target.closest('.cell'); if (el) setHot(el); });
cellsEl.addEventListener('focusout', (ev) => { if (!cellsEl.contains(ev.relatedTarget)) setHot(null); });
cellsEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { setHot(null); ev.target.blur(); } });
cellsEl.addEventListener('click', (ev) => {
  const el = ev.target.closest('.cell'); if (!el) return;
  location.href = `ximap.html?cell=${el.dataset.x},${el.dataset.y}&mode=${MODE}`;      // 원본 ximap.html 의 자리
});
$('#seg').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) setMode(b.dataset.mode); });
$('#seg').addEventListener('keydown', (ev) => { if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { setMode(MODE === 'res' ? 'train' : 'res'); $(`#seg-${MODE}`).focus(); } });
function setMode(m) {
  MODE = m;
  for (const b of $$('#seg [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
  paintCells();
  if (hot) { const c = CELLS.find((x) => x.key === hot.dataset.key); callout.innerHTML = calloutHtml(c); }
}
function mountMap() {
  try {
    if (!window.maplibregl || !maplibregl.supported?.() && !window.WebGLRenderingContext) throw new Error('no webgl');
    map = new maplibregl.Map({
      container: 'plate', interactive: false, attributionControl: false,
      style: { version: 8, sources: { eox: { type: 'raster', tiles: [EOX], tileSize: 256, attribution: 'Sentinel-2 cloudless 2024 by EOX' } },
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#010102' } }, { id: 'eox', type: 'raster', source: 'eox' }] },
      center: PROJ.center, zoom: PROJ.zoom,
    });
    map.on('load', () => { document.documentElement.dataset.plate = 'ready'; });
    map.on('error', () => { document.documentElement.dataset.plate = document.documentElement.dataset.plate || 'error'; });
  } catch { wrap.classList.add('no-map'); document.documentElement.dataset.plate = 'off'; }
}
$('#l-src').innerHTML = `출처 · EOX Sentinel-2 cloudless 2024 · 결과 ${RESULTS.length} · 변화지수 ${CHANGE.length}쌍 · 정사영상 ${IMAGERY.length}종<i> | </i>기준 ${ymd(T1)}`;

/* ══ 우 탭 패널 — B10 | B11 | B12 (각 1회) ═════════════════════════════ */
const PROJ_SUM = PROJECTS.reduce((a, p) => a + p.gb, 0);
const TAB_META = {
  proj: `용량 Top5 · GB<i class="tag">시연</i>`,
  visit: `최근 7일 방문 · 회<i class="tag">시연</i>`,
  store: `6분류<i class="tag">시연</i>`,
};
const TAB_SUB = {
  proj: `상위 5개 합계 <b class="cu" data-n="${PROJ_SUM}">0</b> GB`,
  visit: `7일 합계 <b class="cu" data-n="${VISITS_TOTAL}">0</b>회 · 최대 ${VISITS.reduce((a, v) => (v.count > a.count ? v : a)).day} ${nf.format(Math.max(...VISITS.map((v) => v.count)))}`,
  store: `사용 <b class="cu" data-n="${STORAGE.used}" data-dec="1">0</b> / ${STORAGE.total} TB · 잔여 ${(STORAGE.total - STORAGE.used).toFixed(1)} TB`,
};
const TAB_CAP = { proj: `AI 개발 프로젝트 ${PROJECTS.length}건 · 용량 순`, visit: `최근 7일 · 요일 7값`, store: `스토리지 ${STORAGE.parts.length}분류 · 1 px ≒ ${(STORAGE.total / 600).toFixed(2)} TB` };
const TAB_SRC = { proj: `출처 · AI 개발 프로젝트 용량 집계<span class="tag">시연</span><i> | </i>기준 ${T1.slice(0, 7).replace('-', '.')}`, visit: `출처 · 서비스 접속 로그 7일<span class="tag">시연</span><i> | </i>기준 ${T1.slice(0, 7).replace('-', '.')}`, store: `출처 · 스토리지 사용량 집계 · 사용 44.5 TB = 측정 · 분류 배분<span class="tag">시연</span><i> | </i>기준 ${T1.slice(0, 7).replace('-', '.')}` };

// 탭 1 — 랭크드 바(1위 액센트)
{
  const max = Math.max(...PROJECTS.map((p) => p.gb));
  $('#pane-proj').innerHTML = PROJECTS.map((p, i) => `<div class="rk${i ? '' : ' on'}" data-proj="${esc(p.name)}">
    <span class="no n">${String(i + 1).padStart(2, '0')}</span><span class="nm">${esc(p.name)}</span>
    <span class="bar"><i style="width:${((p.gb / max) * 100).toFixed(1)}%"></i></span><b class="val big cu" data-n="${p.gb}">0</b></div>`).join('');
}
// 탭 2 — 7일 폴리라인, 직접 라벨 7값
{
  const W = 600, H = 150, n = VISITS.length, max = Math.max(...VISITS.map((v) => v.count)), min = Math.min(...VISITS.map((v) => v.count));
  const x = (i) => 10 + (i * (W - 20)) / (n - 1), y = (v) => 12 + ((max - v) / (max - min || 1)) * (H - 24);
  const imax = VISITS.findIndex((v) => v.count === max);
  $('#pane-visit').innerHTML = `<svg id="v-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="${H - .5}" x2="${W}" y2="${H - .5}" stroke="#DDDDDD"/>
      ${VISITS.map((v, i) => `<line x1="${x(i).toFixed(1)}" y1="${y(v.count).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${H}" stroke="#DDDDDD" stroke-dasharray="2 3"/>`).join('')}
      <polyline points="${VISITS.map((v, i) => `${x(i).toFixed(1)},${y(v.count).toFixed(1)}`).join(' ')}"/>
      ${VISITS.map((v, i) => `<rect x="${(x(i) - 3).toFixed(1)}" y="${(y(v.count) - 3).toFixed(1)}" width="6" height="6" fill="${i === imax ? '#006DF7' : '#FFF'}" stroke="${i === imax ? '#006DF7' : '#010102'}" vector-effect="non-scaling-stroke"/>`).join('')}
    </svg><div id="v-ax" class="n">${VISITS.map((v, i) => `<span class="${i === imax ? 'pk' : (i === 0 || i === n - 1) ? 'on' : ''}" style="left:${((x(i) / W) * 100).toFixed(2)}%"><b class="cu" data-n="${v.count}">0</b>${v.day}</span>`).join('')}</div>`;
}
// 탭 3 — 스토리지 스택 40px + 범례 6 + 잔여
{
  const W = 600, tot = STORAGE.total; let x = 0;
  const tone = ['#010102', '#686868', '#686868', '#CCCCCC', '#CCCCCC', '#CCCCCC'];
  $('#pane-store').innerHTML = `<div class="pane-big"><b class="big cu" data-n="${STORAGE.used}" data-dec="1">0</b><span class="u">/ ${tot} TB</span></div>
    <svg id="s-bar" viewBox="0 0 ${W} 40" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="${W - 1}" height="39" fill="none" stroke="#DDDDDD"/>
    ${STORAGE.parts.map((p, i) => { const w = (p.tb / tot) * W; const r = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="40" fill="${tone[i]}"><title>${esc(p.label)} ${p.tb} TB</title></rect>`; x += w; return r; }).join('')}</svg>
    <div id="s-lg" class="n">${STORAGE.parts.map((p, i) => `<span class="li"><i style="background:${tone[i]}"></i>${esc(p.label)} <b class="cu" data-n="${p.tb}" data-dec="1">0</b></span>`).join('')}<span class="li rest"><i style="border:1px solid #DDDDDD"></i>잔여 <b>${(tot - STORAGE.used).toFixed(1)}</b></span></div>`;
}
const TABS = ['proj', 'visit', 'store'];
let TAB = 'proj';
function setTab(t, { remember = true } = {}) {
  if (!TABS.includes(t)) t = 'proj';
  TAB = t;
  for (const b of $$('#tabs [role=tab]')) { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const k of TABS) { const p = $(`#pane-${k}`); p.hidden = k !== t; p.classList.toggle('is-in', k === t); }
  $('#tab-meta').innerHTML = TAB_META[t]; $('#r-sub').innerHTML = TAB_SUB[t]; $('#r-cap').textContent = TAB_CAP[t]; $('#r-src').innerHTML = TAB_SRC[t];
  $('#b10-more').hidden = t !== 'proj';
  document.documentElement.dataset.tab = t;
  requestAnimationFrame(() => { $$(`#pane-${t} .cu, #r-sub .cu`).forEach(countUp); });
  if (remember) { try { localStorage.setItem('lx_dash_tab', t); } catch { /* 저장소 차단 */ } }
}
$('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
$('#tabs').addEventListener('keydown', (ev) => {
  const i = TABS.indexOf(TAB); let j = null;
  if (ev.key === 'ArrowRight') j = (i + 1) % 3; else if (ev.key === 'ArrowLeft') j = (i + 2) % 3; else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = 2;
  if (j == null) return; ev.preventDefault(); setTab(TABS[j]); $(`#tab-${TABS[j]}`).focus();
});

/* ══ B13 · B14 · B15 ═════════════════════════════════════════════════════ */
$('#ap-rows').innerHTML = APPROVALS.map((a, i) => {
  const m = a.title.match(/^(.*?)\s+(v[\d.]+)$/); const name = m ? m[1] : a.title, ver = m ? m[2] : '';
  const href = `dashboard.html?open=${a.id}`;
  const cell = (t, cls = '') => `<td class="${cls}"><a href="${href}" tabindex="-1">${t}</a></td>`;
  return `<tr class="ap" data-id="${a.id}" title="원본 admin-publish.html?open=${a.id}">
    ${cell(`<span class="i">${String(i + 1).padStart(2, '0')}</span>`)}${cell(esc(name))}${cell(esc(ver))}
    ${cell(`${esc(a.at)}<span class="tag">시연</span>`)}${cell(`남원시 ${esc(a.emd)}<span class="tag">추정</span>`)}${cell('승인 대기')}
    <td class="r"><a class="go" href="${href}">검토 › <span class="dim">?open=${a.id}</span></a></td></tr>`;
}).join('');
const AD_ICON = ['<path d="M8 4.5h4v4H8z"/><path d="M4.5 16v-3.5h11V16"/>', '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>', '<path d="M3 5h14v10H3z"/><path d="m3 5 7 5.5L17 5"/>', '<path d="M3 3h14v14H3z"/><path d="M6 7.5h8M8.5 12.5h5.5"/><path d="M5.5 11h2v3h-2z"/>'];
$('#ad-rows').insertAdjacentHTML('beforeend', ADMIN_TILES.map((t, i) => `<a class="ad" href="../${esc(t.href)}" title="원본 ${esc(t.href)}">
  <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${AD_ICON[i]}</svg>
  <span class="d">${esc(t.name)}</span><span class="mic n">${esc(t.desc)}</span><span class="mic">›</span></a>`).join(''));
$('#foot-l').textContent = 'LX 한국국토정보공사 · 고객센터 063-713-1213 · 개인정보처리방침 · 이용약관 · 이메일주소무단수집거부';

/* ══ B16 딥링크 ═════════════════════════════════════════════════════════ */
function deepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('status') === '대기') { $('#b-approve').setAttribute('aria-current', 'true'); document.documentElement.dataset.deep = 'status'; setTimeout(() => goTo('b-approve'), 300); }
  const open = q.get('open');
  if (open) {
    const tr = $(`#ap-rows tr[data-id="${CSS.escape(open)}"]`);
    if (tr) { tr.setAttribute('aria-current', 'true'); document.documentElement.dataset.deep = 'open:' + open; setTimeout(() => { tr.scrollIntoView({ block: 'center' }); $('.go', tr).focus({ preventScroll: true }); }, 300); }
    else { document.documentElement.dataset.deep = 'open:missing'; say(`?open=${open} — 승인 대기 목록에 없는 카드`); }
  }
  if (q.get('tab')) setTab(q.get('tab'), { remember: false });
}

/* ══ 도착 — 카운트업 900ms easeOutQuart ══════════════════════════════════ */
function countUp(el) {
  const to = parseFloat(el.dataset.n || el.textContent) || 0, dec = +(el.dataset.dec || 0);
  const fmt = (v) => (dec ? v.toFixed(dec) : nf.format(Math.round(v)));
  if (REDUCED()) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = fmt(to * EASE4(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ══ 기동 ═══════════════════════════════════════════════════════════════ */
layoutPlate();
paintCells();
mountMap();
new ResizeObserver(layoutPlate).observe(wrap);
let saved = null; try { saved = localStorage.getItem('lx_dash_tab'); } catch { /* 저장소 차단 */ }
setTab(saved || 'proj', { remember: false });
requestAnimationFrame(() => {
  document.documentElement.dataset.dash = 'ready';
  $$('#b-kpi .cu').forEach(countUp);
  deepLink();
});
