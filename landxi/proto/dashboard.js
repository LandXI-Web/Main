// LX 관리자 대시보드 — B5 12.8.
// 규칙 둘만 지킨다.
//  1) 기능은 원본과 1:1 이다(레일 A1–A11 · 위젯 B1–B16, 새 위젯 0).
//     대조표 docs/superpowers/proto/2026-08-26-dashboard-parity.md
//  2) 조판은 design-canvas/v2/B5-Dashboard.dc.html / -Data.dc.html 의 좌표 그대로다.
//     밴드·폰트·헤어라인 근거 = design-canvas/v2/NOTES.md §12.4 · §12.8
// 콘티 원칙(§5): 지어낸 운영 서사 0 — 담당자명·대기 일수·추세 문구 없음.
// 판의 셀 등급·범례 셀 수·콜아웃 문구는 전부 db-data.js 의 집계값이다(손 값 0).
import {
  nf, ymd, T1, DATA_ASOF, IMG, BACKBONE, KPI, NAV, NAV_FOOT, NOTICE, APPROVALS,
  ADMIN_TILES, PROJECTS, VISITS, VISITS_TOTAL, STORAGE, JOBS, JOB_UNMAPPED,
  cellsFor, loadFootprints, calloutFor, legendFor,
} from './db-data.js';
import { mountPlate, toggleHTML, legendHTML, calloutHTML, cellsHTML, markHTML } from './db-plate.js';
import { rankedBars, barsTotal, polyline, stackBar, stackLegend, tbPerPx } from './db-charts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ 계측 글리프 — 마스터의 path 를 그대로 옮긴다(B4 공용 세트) ═══════ */
const G = {
  dash: '<path d="M3 3h14v14H3z"/><path d="M3 8.5h14M10.5 8.5V17"/>',
  data: '<path d="M3 3h10v10H3z"/><path d="M7 7h10v10H7z"/>',
  proj: '<path d="M2.5 2.5h5v5h-5z"/><path d="M12.5 2.5h5v5h-5z"/><path d="M7.5 12.5h5v5h-5z"/><path d="M7.5 5h5M15 7.5v4H10v1"/>',
  run: '<path d="M3 3h14v14H3z"/><path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 5.5h3v3H6z"/><path d="M11.5 11.5h3.5v3.5h-3.5z"/>',
  map: '<path d="M4.5 4.5h11v11h-11z"/><path d="M10 1v18M1 10h18"/>',
  help: '<path d="M3 3h14v9.5H8.5L4.5 17v-4.5H3z"/><path d="M6.5 7.5h7"/>',
  stack: '<path d="M3 6h10v11H3z"/><path d="M9 11 17 3M12 3h5v5"/>',
  gear: '<path d="M6 3v14M14 3v14"/><path d="M4 6.5h4v2.5H4z"/><path d="M12 11h4v2.5h-4z"/>',
  my: '<path d="M3 3h14v14H3z"/><path d="M8 6h4v4H8z"/><path d="M5.5 17v-3h9v3"/>',
  out: '<path d="M11 3H3.5v14H11"/><path d="M8.5 10H17M13.5 6.5 17 10l-3.5 3.5"/>',
  notice: '<path d="M3 3.5h14v9H3z"/><path d="M6 12.5V17"/><path d="M6 7h8M6 9.5h5"/>',
  backbone: '<path d="M3 3h14v14H3z"/><path d="M3 7.67h14M3 12.33h14M7.67 3v14M12.33 3v14"/><path d="M7.67 7.67h4.66v4.66H7.67z" fill="currentColor" stroke="none"/>',
  bars: '<path d="M2 13h16"/><path d="M4 13V8M7 13v-3M10 13V8M13 13v-3M16 13V8"/>',
  line: '<path d="m3 13 3.5-3.5 3 3L14 6l3 3.5"/><path d="M2 15h1.8M16.2 15H18"/>',
  disk: '<path d="M3 8h14v4H3z"/><path d="M7 8v4M10.5 8v4M13.5 8v4"/><path d="M3 5.5v9"/>',
  check: '<path d="M3 6V3h3M14 3h3v3M17 14v3h-3M6 17H3v-3"/><path d="M6.5 10 9 12.5 13.5 7"/>',
  user: '<path d="M8 4.5h4v4H8z"/><path d="M4.5 16v-3.5h11V16"/>',
  mail: '<path d="M3 5h14v10H3z"/><path d="m3 5 7 5.5L17 5"/>',
  faq: '<path d="M3 3h14v14H3z"/><path d="M6 7.5h8M8.5 12.5h5.5"/><path d="M5.5 11h2v3h-2z"/>',
};
const svg = (k, n = 20) => `<svg width="${n}" height="${n}" viewBox="0 0 20 20" fill="none" stroke="currentColor"`
  + ` stroke-width="1.5" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">${G[k] || ''}</svg>`;

/* ══ A1–A11 좌 레일 ═══════════════════════════════════════════════════
   원본 include/header.html 의 메뉴가 순서까지 그대로다. 원본 페이지는 이 저장소에
   없으므로 링크를 지어내지 않고, 같은 데이터가 있는 우리 자리로 보낸다. */
const RAIL_TOP = [72, 130, 188, 246, 304];
const RAIL_FOOT = [596, 654, 712, 770, 828];
const railItem = (n, top) => `<button type="button" class="rail-i" data-menu="${n.menu}" data-to="${n.to || ''}"`
  + ` style="top:${top}px" title="원본 ${esc(n.href)}"${n.menu === 'dashboard' ? ' aria-current="page"' : ''}>`
  + `${svg(n.icon)}<span class="rl">${esc(n.label || n.name)}</span></button>`;

const RAIL_ICON = { dashboard: 'dash', media: 'data', project: 'proj', analysis: 'run', map: 'map', support: 'help', 'publish-admin': 'stack', admin: 'gear' };
const RAIL_LABEL = { media: '데이터\n관리', 'publish-admin': '카드 발행\n관리' };
const withIcon = (n) => ({ ...n, icon: RAIL_ICON[n.menu] || n.icon, label: RAIL_LABEL[n.menu] || n.name });

$('#rail-top').innerHTML = NAV.map((n, i) => railItem(withIcon(n), RAIL_TOP[i])).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map((n, i) => railItem(withIcon(n), RAIL_FOOT[i])).join('')
  + railItem({ menu: 'my', name: 'MY', href: 'mypage.html', icon: 'my' }, RAIL_FOOT[3])
  + `<button type="button" class="rail-i" data-action="logout" style="top:${RAIL_FOOT[4]}px" title="원본 로그아웃">`
  + `${svg('out')}<span class="rl">로그아웃</span></button>`;

$('#rail').addEventListener('click', (ev) => {
  const lo = ev.target.closest('[data-action="logout"]');
  // A11 — 원본과 동작까지 1:1(lx_logged_in 삭제 → home).
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch { /* 저장소 차단 */ } location.href = '../home.html'; return; }
  const b = ev.target.closest('.rail-i[data-menu]');
  if (!b) return;
  $$('.rail-i').forEach((x) => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'page');
  if (b.dataset.menu === 'my') { location.href = '../mypage.html'; return; }
  if (b.dataset.to) focusBlock(b.dataset.to);
});
/** 원본 페이지가 없으므로 같은 데이터가 있는 블록으로 초점을 옮긴다. */
function focusBlock(id) {
  const t = document.getElementById(id);
  if (!t) return;
  t.scrollIntoView({ block: 'nearest', behavior: REDUCED() ? 'auto' : 'smooth' });
}

/* ══ B3 공지 + B2 기준일 ═════════════════════════════════════════════ */
$('#b-notice').innerHTML = `${svg('notice', 16)}<span class="chip">공지</span>`
  + `<span class="ti">${esc(NOTICE.title)}</span>`
  + `<span class="n dt">${ymd(NOTICE.date)}</span><span class="more">전체 보기 ›</span>`;
$('#b-notice').href = `../notice.html?notice=${NOTICE.id}`;
// B2 — 오늘을 지어내지 않는다. 시스템 날짜는 마스트헤드 우측 회색 한 줄뿐이다.
$('#b2').textContent = ymd(new Date().toISOString().slice(0, 10));

/* ══ B4–B8 KPI 띠 — 카드 0, `|` 헤어라인 4 (y 174–278) ═══════════════ */
const KPI_X = [128, 397.2, 648.4, 899.6, 1150.8];
const KPI_W = [243.2, 225.2, 225.2, 225.2, 225.2];
const KPI_L = [379.2, 630.4, 881.6, 1132.8];
$('#b-kpi').innerHTML = KPI.map((k, i) => {
  const q = k.href && k.href.includes('?') ? ` · ?${k.href.split('?')[1]}` : '';
  const tag = k.to ? 'button' : 'div';
  const attr = k.to ? ` type="button" data-to="${k.to}"` : '';
  return `<${tag} class="k"${attr} style="left:${KPI_X[i]}px;width:${KPI_W[i]}px" title="원본 ${esc(k.href)}">`
    + `<span class="lab">${esc(k.label)}</span>`
    + `<span class="kv n"><b>${k.value}</b><em>${esc(k.unit)}</em></span>`
    + `<span class="mic n ks">${esc(k.sub + q)}</span></${tag}>`;
}).join('') + KPI_L.map((x) => `<i class="kvl" style="left:${x}px"></i>`).join('');
$('#b-kpi').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-to]');
  if (b) focusBlock(b.dataset.to);
});

/* ══ B9 백본 ═════════════════════════════════════════════════════════ */
$('#b-bb').innerHTML = `${svg('backbone', 16)}<span class="d t">AI 기반 모델 (백본)</span>`
  + '<span class="mic">국토 관측 영상 파운데이션 모델</span><span class="sp"></span>'
  + `<span class="n" id="bb-ver">${esc(BACKBONE.name)} ${esc(BACKBONE.ver)}</span>`;
// 원본 B9 는 과제 14개라고 말하지만 실측 목록(A5)은 10건이다 — 그 차를 화면이 자백한다.
$('#bb-applied').innerHTML = `최종 적용 ${esc(BACKBONE.applied)} · 연결된 분석 과제 ${BACKBONE.tasks}개`
  + ` <i>(측정 ${JOBS.length} · AOI 미지정 ${JOB_UNMAPPED})</i>`;

/* ══ 판 12.8 ═════════════════════════════════════════════════════════ */
let MODE = 'ai';
const footprints = await loadFootprints();
const CELLS = cellsFor(footprints);
const PLATE = await mountPlate($('#plate'), { mode: MODE, footprints, cells: CELLS });

const pt = $('#pt');
const pl = $('#pl');
const pc = $('#pc');
const pmark = $('#pmark');
let hovered = -1;

pt.innerHTML = toggleHTML(MODE);
$('#pcells').innerHTML = cellsHTML(CELLS, PLATE.project);
paintLegend();

function paintLegend() { pl.innerHTML = legendHTML(CELLS, MODE); }
/** 콜아웃 높이는 마스터 고정값이다 — AI 96 / 데이터 82(줄 수 상한에 맞춘 값). */
const PC_H = () => (MODE === 'data' ? 82 : 96);
function showCell(i) {
  const cell = CELLS[i];
  if (!cell) return;
  hovered = i;
  pc.hidden = false;
  pc.style.height = `${PC_H()}px`;
  pc.innerHTML = calloutHTML(cell, MODE);
  pmark.innerHTML = markHTML(cell, PLATE.project, { top: 48, h: PC_H(), right: 256 });
}
function hideCell() {
  hovered = -1;
  pc.hidden = true;
  pc.innerHTML = '';
  pmark.innerHTML = '';
}
$('#pcells').addEventListener('mouseover', (ev) => {
  const a = ev.target.closest('.pcell');
  if (a) showCell(+a.dataset.cell);
});
$('#pcells').addEventListener('mouseleave', hideCell);
$('#pcells').addEventListener('focusin', (ev) => {
  const a = ev.target.closest('.pcell');
  if (a) showCell(+a.dataset.cell);
});
$('#pcells').addEventListener('focusout', hideCell);

function setMode(m) {
  if (m === MODE) return;
  MODE = PLATE.setMode(m);
  document.body.dataset.mode = MODE;
  $$('.pt-seg', pt).forEach((b) => {
    const on = b.dataset.mode === MODE;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  paintLegend();
  if (hovered >= 0) showCell(hovered);
}
pt.addEventListener('click', (ev) => {
  const b = ev.target.closest('.pt-seg');
  if (b) setMode(b.dataset.mode);
});
pt.addEventListener('keydown', (ev) => {
  if (!/^Arrow(Left|Right|Up|Down)$/.test(ev.key)) return;
  ev.preventDefault();
  const next = MODE === 'ai' ? 'data' : 'ai';
  setMode(next);
  $(`.pt-seg[data-mode="${next}"]`, pt).focus();
});

/* 판 캡션·출처 — 지역 이름은 결과가 실제로 선 셀에서 뽑는다. */
const REGIONS = [...new Set(CELLS.filter((c) => c.ai > 0).map((c) => calloutFor(c, 'ai').place).filter(Boolean))];
$('#plate-src').innerHTML = `Data source: EOX Sentinel-2 cloudless 2024 · ${esc(REGIONS.join('·'))} 분석 결과`
  + ` · 정사영상 타일 카탈로그 ${IMG.length}종<i> | </i>기준시점 ${ymd(T1)}`;

/* ══ ① B10 AI 개발 프로젝트 현황 ════════════════════════════════════ */
$('#b-proj').innerHTML = `${svg('bars', 16)}<span class="d t">AI 개발 프로젝트 현황</span>`
  + '<span class="mic">용량 Top5 · GB<i class="tag">시연</i></span><span class="sp"></span>'
  + '<a class="more" href="../ai-project.html">전체 보기 ›</a>';
$('#t-proj').innerHTML = rankedBars(PROJECTS);
$('#proj-src').innerHTML = `Data source: AI 개발 프로젝트 용량 집계(시연) · 상위 5개 합계 ${nf.format(barsTotal(PROJECTS))} GB`
  + `<i> | </i>기준시점 ${esc(DATA_ASOF.replace('-', '.'))}`;

/* ══ ② B11 사용자 이용 현황 ═════════════════════════════════════════ */
$('#b-visit').innerHTML = `${svg('line', 16)}<span class="d t">사용자 이용 현황</span>`
  + '<span class="mic">최근 7일 방문 · 회<i class="tag">시연</i></span><span class="sp"></span>'
  + `<span class="mic">7일 합계 <span class="n" style="color:#010102">${nf.format(VISITS_TOTAL)}</span></span>`;
$('#t-visit').innerHTML = polyline(VISITS);
$('#visit-src').innerHTML = 'Data source: 서비스 접속 로그 최근 7일(시연) · 요일 7값 전부 표기, 양끝·최대만 잉크'
  + `<i> | </i>기준시점 ${esc(DATA_ASOF.replace('-', '.'))}`;

/* ══ ③ B12 전체 스토리지 사용량 ═════════════════════════════════════ */
$('#b-store').innerHTML = `${svg('disk', 16)}<span class="d t">전체 스토리지 사용량</span>`
  + `<span class="mic">${STORAGE.parts.length}분류<i class="tag">시연</i></span><span class="sp"></span>`
  + `<span class="n" id="store-v">${STORAGE.used}</span><span class="mic">/ ${STORAGE.total} TB</span>`;
$('#t-store').innerHTML = stackBar(STORAGE);
$('#store-lg').innerHTML = stackLegend(STORAGE);
$('#store-src').innerHTML = `Data source: 스토리지 사용량 집계 · 사용 ${STORAGE.used} TB = 측정 · 분류 배분 = 시연`
  + ` · 1 px ≒ ${tbPerPx(STORAGE)} TB<i> | </i>기준시점 ${esc(DATA_ASOF.replace('-', '.'))}`;

/* ══ B13 카드 발행 승인 대기 ════════════════════════════════════════ */
$('#ap-h').innerHTML = `${svg('check', 16)}<span class="d t">카드 발행 승인 대기</span>`
  + '<span class="mic">검토 대상 · 요청 순</span><span class="sp"></span>'
  + '<span class="mic n go">카드 발행 관리 › <i>?status=대기</i></span>';

const COLS = [
  { x: 128, w: 28, h: '#', a: 'left' },
  { x: 164, w: 372, h: '카드명', a: 'left' },
  { x: 544, w: 92, h: '버전', a: 'left' },
  { x: 644, w: 212, h: '요청 일시', a: 'left' },
  { x: 864, w: 152, h: '요청 지역', a: 'left' },
  { x: 1024, w: 192, h: '상태', a: 'left' },
  { x: 1224, w: 152, h: '진입', a: 'right' },
];
$('#ap-head').innerHTML = COLS.map((c) => `<div class="tc th lab" style="left:${c.x}px;top:755px;width:${c.w}px;text-align:${c.a}">${esc(c.h)}</div>`).join('');

const ROW_TOP = [774, 802];
$('#ap-rows').innerHTML = APPROVALS.map((a, i) => {
  const m = /^(.*)\s(v[\d.]+)$/.exec(a.title) || [null, a.title, ''];
  const cells = [
    `<span class="n mut">${String(i + 1).padStart(2, '0')}</span>`,
    esc(m[1]),
    `<span class="n">${esc(m[2])}</span>`,
    `<span class="n">${esc(a.at)}</span><i class="tag">시연</i>`,
    `${esc(a.sgg)} ${esc(a.emd)}<i class="tag">추정</i>`,
    '승인 대기',
    `검토 › <span class="dim">?open=…</span>`,
  ];
  return `<a class="ap-row" role="listitem" href="../admin-publish.html?open=${esc(a.id)}"`
    + ` style="top:${ROW_TOP[i]}px" title="원본 admin-publish.html?open=${esc(a.id)}">`
    + COLS.map((c, j) => `<span class="tc td" style="left:${c.x - 128}px;top:7px;width:${c.w}px;text-align:${c.a}">${cells[j]}</span>`).join('')
    + '</a>';
}).join('') + ROW_TOP.map((t) => `<i class="hl" style="left:128px;top:${t + 28}px"></i>`).join('');

/* ══ B14 사용자·콘텐츠 관리 4 — Outage Center 규칙: 수치는 한 번만 ══ */
const AD_ICON = ['user', 'notice', 'mail', 'faq'];
$('#ad-rows').innerHTML = '<span class="lab">관리 바로가기</span>'
  + ADMIN_TILES.map((t, i) => '<i class="sep"></i>'
    + `<a class="ad" role="listitem" href="../${esc(t.href)}" title="원본 ${esc(t.href)}">${svg(AD_ICON[i], 15)}`
    + `<span class="d t">${esc(t.name)}</span><span class="n s">${esc(t.ref || t.desc)}</span>`
    + '<span class="go">›</span></a>').join('');

/* ══ 진입 — 이징 하나, 사다리 넷(§4). 유휴 운동 0. ═════════════════ */
requestAnimationFrame(() => { if (!REDUCED()) document.body.classList.add('in'); });
document.documentElement.dataset.dash = 'ready';

// 테스트·비교 촬영용 손잡이 — 판의 상태를 밖에서 읽을 수 있게 한다.
window.__dash = {
  get mode() { return MODE; },
  cells: CELLS,
  map: PLATE.map,
  setMode,
  showCell,
  hideCell,
  legend: (m) => legendFor(CELLS, m || MODE),
  callout: (i, m) => calloutFor(CELLS[i], m || MODE),
  indexOf: (lon, lat) => CELLS.findIndex((c) => Math.abs(c.lon - lon) < 1e-6 && Math.abs(c.lat - lat) < 1e-6),
};
