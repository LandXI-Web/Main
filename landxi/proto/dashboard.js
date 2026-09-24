// 대시보드 — LX 직원의 현황판(발주자 보드 B5-Dashboard-Data 의 판 + 토글 2 · 우 탭 패널).
// 2026-09-24 E0-6 — 공용 셸로 이관 · 직원 화면으로.
//  1) 레일 · MY 플라이아웃 · 로그아웃 · 마스트헤드(공지 띠 · 기준일) · 푸터 · 토스트는 shell.js 가 그린다(roles.js 선언).
//     이 파일에 레일 · 관문 · 로그아웃 코드를 두지 않는다 — 전에는 자체 NAV 가 직원에게 관리 메뉴를 보였다(D-1).
//  2) 이 화면의 주인은 **직원**이다(roles.js staff.menus). 승인 KPI · 승인 대기 증거 카드 · 관리 바로가기는
//     운영 현황(E1-6)으로 간다 — 데이터는 db-data.js 에 남아 있다. 행선지 표: wave0/E0-6-result.md.
//  3) 숫자는 results.js · imagery.js · change.js · services.js · db-data.js 에서만. 원본 시드 = 시연.
//     판 위 셀은 실좌표(db-cells.js)를 판에 투영한 것 — 손으로 놓은 셀이 아니다.
//  4) 모든 링크는 직원이 실제로 들어가는 화면으로 간다. 제자리(dashboard.html?…) 링크 0.
import { mountShell, AS_OF, esc, nf, ymd, REDUCED } from './shell.js';
import { BACKBONE, KPI_STAFF, PROJECTS, STORAGE, JOBS, JOB_UNMAPPED } from './db-data.js';
import { RESULTS } from '../assets/data/results.js';
import { CHANGE } from '../assets/data/change.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { SERVICES } from '../assets/data/services.js';
import { cardsOfService } from '../assets/data/cards.js';
import { ALL_LAYERS } from './map-data.js';
import { EOX } from './js/sources.js';
import { buildCells, gradeResult, gradeTrain, fitProjector, gridLines, cellRect, cellRange, PLATE_BOUNDS, STEP } from './db-cells.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE4 = (k) => 1 - (1 - k) ** 4;
const cm = (gsd) => (gsd < 1 ? `${+(gsd * 100).toFixed(2)} cm` : `${gsd} m`);

const shell = mountShell({
  active: 'dashboard', title: '대시보드', titleRule: 1,
  subtitle: 'AI 분석 결과와 학습데이터가 어디에 쌓였는지 한눈에',
  asOf: AS_OF, demo: true,
});
if (!shell) throw new Error('gate');                     // 관문이 돌려보내는 중 — 아무것도 그리지 않는다

/* ══ 큰 숫자 밴드 — 정보 3(파랑). 조치 필요(warn) 숫자는 이 화면에 없다. ══════ */
$('#b-kpi').innerHTML = KPI_STAFF.map((k) => `<a class="k" data-kpi="${k.key}" href="${esc(k.href)}">
  <span class="kl">${esc(k.label)}${k.demo ? '<em class="tag">시연</em>' : ''}</span>
  <span class="kv"><b class="big cu" data-n="${k.value}">0</b><span>${esc(k.unit)}</span></span>
  <span class="ks n">${esc(k.sub)}<span class="go" aria-hidden="true">›</span></span></a>`).join('');

/* ══ 백본 헤더 ═════════════════════════════════════════════════════════ */
$('#bb-name').textContent = `${BACKBONE.name} ${BACKBONE.ver}`;
$('#bb-sub').innerHTML = `최종 적용 ${esc(BACKBONE.applied)} · 연결된 분석 과제 ${BACKBONE.tasks}개 <span class="dim">(측정 ${JOBS.length} · AOI 미지정 ${JOB_UNMAPPED})</span>`;

/* ══ 판 — 대한민국 전도 · 0.25° 그리드 · 셀 = 실자산 위치 ═══════════════════ */
const CELLS = [...buildCells({ RESULTS, CHANGE, IMAGERY, SERVICES }).values()];
const wrap = $('#plate-wrap'), gridEl = $('#grid'), cellsEl = $('#cells'), callout = $('#callout'), legendEl = $('#legend');
let MODE = 'res', PROJ = null, map = null;
const grade = (c) => (MODE === 'res' ? gradeResult(c) : gradeTrain(c));

/* 셀 → 행선지. 결과가 있는 셀은 XI맵이 그 결과를 켜고 맞춰 보여 준다(`?result=` — E0-5 가 받는다).
   결과 id 는 results.js(변화지수는 XI맵 레이어 표)의 id 그대로다. 학습데이터 모드에서 영상이 있는 셀은
   데이터 관리 아카이브로, 조사 예정 셀은 그 모델의 분석 서비스 카드로 간다. 셀 좌표(`?cell=`)는 더 보내지 않는다. */
const CHANGE_LAYER = ALL_LAYERS.find((l) => l.kind === 'change') || null;
function resultIdOf(c) {
  const r = c.results.find((x) => ALL_LAYERS.some((l) => l.id === x.id));
  if (r) return r.id;
  if (c.change.length && CHANGE_LAYER) return CHANGE_LAYER.id;
  return null;
}
function targetOf(c) {
  const rid = resultIdOf(c);
  if (MODE === 'train' && c.imagery.length) return { href: 'dataset.html?tab=archive', to: '데이터 관리' };
  if (rid) return { href: `ximap.html?result=${encodeURIComponent(rid)}`, to: 'XI맵' };
  if (c.imagery.length) return { href: 'dataset.html?tab=archive', to: '데이터 관리' };
  const card = c.planned.map((p) => cardsOfService(p.id)[0]).find(Boolean);
  return { href: card ? `analysis-ai.html?card=${encodeURIComponent(card.id)}` : 'analysis-ai.html', to: '분석 서비스' };
}

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
  if (map) { map.resize(); map.jumpTo({ center: PROJ.center, zoom: PROJ.zoom }); }
}
function cellLabel(c) {
  const g = grade(c); const rg = cellRange(c);
  const n = c.results.length + c.change.length;
  const head = `${c.name || '셀'} ${rg.e} · ${rg.n}`;
  const to = ` · 클릭 → ${targetOf(c).to}`;
  if (MODE === 'res') return `${head} — ${n ? `AI 분석 결과 ${n}건` : g === 'train' ? '학습데이터만' : g === 'plan' ? '조사 예정' : ''}${to}`;
  return `${head} — 학습데이터 ${c.imagery.length}종${to}`;
}
cellsEl.innerHTML = CELLS.map((c) => `<a class="cell" data-key="${c.key}" data-x="${c.x0}" data-y="${c.y0}" href="#">
  <i class="bk bk-tl"></i><i class="bk bk-tr"></i><i class="bk bk-bl"></i><i class="bk bk-br"></i></a>`).join('');

function paintCells() {
  wrap.dataset.mode = MODE;
  const tally = {};
  for (const c of CELLS) {
    const g = grade(c); const el = $(`.cell[data-key="${c.key}"]`, cellsEl);
    if (g == null) el.removeAttribute('data-g'); else { el.dataset.g = String(g); tally[g] = (tally[g] || 0) + 1; }
    el.setAttribute('aria-label', cellLabel(c));
    el.setAttribute('href', targetOf(c).href);
    const rid = resultIdOf(c); if (rid) el.dataset.result = rid; else el.removeAttribute('data-result');
  }
  // 범례 = 히트 단계(건수)와 셀 수만. 학습데이터만·조사 예정·영상 미등록 셀은 헤어라인으로 그리되 설명은 호버 콜아웃에서만.
  const rows = MODE === 'res'
    ? [['4', '결과 4건 이상'], ['3', '결과 3건'], ['2', '결과 2건'], ['1', '결과 1건']]
    : [['4', '시점 4 이상'], ['3', '시점 3'], ['2', '시점 2'], ['1', '시점 1']];
  legendEl.innerHTML = rows.filter(([g]) => tally[g]).map(([g, t]) => `<div class="lg"><span class="sw" data-g="${g}"></span>${t} <span class="n">${tally[g]}셀</span></div>`).join('');
}
/* Q5(a) — 비닐하우스는 결과(필지)와 카드(동)를 병기한다. */
const fmtRes = (r) => (r.objTotal && r.name === '비닐하우스'
  ? `${r.name} ${nf.format(r.count)}${r.unit} · ${nf.format(r.objTotal)}동`
  : `${r.name} ${nf.format(r.count)}${r.unit}`);
function calloutHtml(c) {
  const rg = cellRange(c);
  const c1 = `<div class="c1">${esc(c.name || '셀')} <span class="i">${rg.e} · ${rg.n}</span></div>`;
  const go = `<div class="c4">${esc(targetOf(c).to)}에서 열기 ›</div>`;
  if (MODE === 'res') {
    const n = c.results.length + c.change.length;
    if (n) {
      const lines = c.results.map(fmtRes);
      const ch = c.change.map((x) => `${x.name} ${nf.format(x.count)}${x.unit} <em>· ${x.method}</em>`);
      return c1 + `<div class="c2">AI 분석 결과 <span class="n">${n}건</span></div>` + [...lines, ...ch].map((l) => `<div class="c3">${l}</div>`).join('') + go;
    }
    if (c.imagery.length) return c1 + `<div class="c2">학습데이터만 · 결과 없음</div>` + c.imagery.slice(0, 3).map((i) => `<div class="c3">${esc(i.label)} <em>${cm(i.gsd)}</em></div>`).join('') + go;
    return c1 + `<div class="c2">조사 예정</div>` + c.planned.map((p) => `<div class="c3">${esc(p.name)} <em>결과 파일 없음</em></div>`).join('') + go;
  }
  if (c.imagery.length) {
    return c1 + `<div class="c2">학습데이터 <span class="n">${c.imagery.length}종</span></div>`
      + c.imagery.slice(0, 4).map((i) => `<div class="c3">${esc(i.captured)} · GSD ${cm(i.gsd)}${i.city ? ' <em>전역</em>' : ''}${i.kind !== 'ortho' ? ' <em>' + esc(i.kind) + '</em>' : ''}</div>`).join('')
      + (c.imagery.length > 4 ? `<div class="c3"><em>+${c.imagery.length - 4}</em></div>` : '') + go;
  }
  return c1 + `<div class="c2">영상 미등록</div>` + c.results.map((r) => `<div class="c3">${fmtRes(r)} <em>결과만</em></div>`).join('') + go;
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
// 출처·기준은 화면 글줄이 아니라 title 로 — 판 아래 글줄 0.
wrap.title = `대한민국 전도 · EOX Sentinel-2 cloudless 2024 · 그리드 ${STEP}° · 결과 ${RESULTS.length} · 변화지수 ${CHANGE.length}쌍 · 정사영상 ${IMAGERY.length}종 · 기준 ${ymd(AS_OF)} · 셀 호버 = 내용 · 클릭 → XI맵`;

/* ══ 우 탭 패널 — 프로젝트 용량 | 스토리지 ══════════════════════════════════
   원본의 셋째 탭 '사용자 이용 현황(7일 방문)' 은 내렸다 — 접속 로그가 없는 지어낸 추세다(콘티 §5 · Q8).
   데이터(VISITS)는 db-data.js 에 남아 있고, 행선지 표에 사유를 적었다. */
const PROJ_SUM = PROJECTS.reduce((a, p) => a + p.gb, 0);
const YM = AS_OF.slice(0, 7).replace('-', '.');
const TAB_TITLE = {
  proj: `AI 개발 프로젝트 ${PROJECTS.length}건 · 용량 순(GB) · 출처 AI 개발 프로젝트 용량 집계(시연) · 기준 ${YM}`,
  store: `스토리지 ${STORAGE.parts.length}분류(TB) · 사용 ${STORAGE.used} TB = 측정 · 분류 배분 시연 · 기준 ${YM}`,
};
const TAB_MORE = { proj: { href: 'ai-project.html', label: '전체 보기 ›' }, store: { href: 'dataset.html?tab=archive', label: '데이터 관리 ›' } };
const TAB_LABEL = { proj: 'AI 개발 프로젝트 현황', store: '전체 스토리지 사용량' };
// 두 목록을 한 패널에 세울 때만 보이는 목록 머리(탭 조판에서는 탭이 그 이름이다).
const paneHead = (k) => `<div class="ph"><h3>${TAB_LABEL[k]}</h3><span class="sp"></span><a class="mic more" href="${TAB_MORE[k].href}">${TAB_MORE[k].label}</a></div>`;
{
  const max = Math.max(...PROJECTS.map((p) => p.gb));
  // 용량 비중 띠 — 5건이 합계에서 차지하는 몫(gb / 합계, 데이터 파일 값에서 계산). 탭 조판에서 행이 상한(ROW_MAX)에 닿아
  // 목록 위아래에 공기가 고일 때만 선다(fitPanel) — 빈 띠를 늘린 행이 아니라 실값으로 채운다.
  const PW = 600; let px = 0;
  const pTone = PROJECTS.map((_, i) => (i ? ['#010102', '#686868', '#CCCCCC', '#DDDDDD'][i - 1] : '#006DF7'));
  const share = PROJECTS.map((p) => p.gb / PROJ_SUM);
  const shareHtml = `<div class="p-share" hidden><svg class="p-bar" viewBox="0 0 ${PW} 24" preserveAspectRatio="none" aria-hidden="true">${PROJECTS.map((p, i) => {
    const w = share[i] * PW; const r = `<rect x="${px.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="24" fill="${pTone[i]}"><title>${esc(p.name)} ${p.gb} GB</title></rect>`; px += w; return r; }).join('')}</svg>
    <div class="p-pct n">${PROJECTS.map((p, i) => `<span style="width:${(share[i] * 100).toFixed(3)}%"${i ? '' : ' class="on"'} title="${esc(p.name)}">${String(i + 1).padStart(2, '0')} ${Math.round(share[i] * 100)}%</span>`).join('')}</div></div>`;
  $('#pane-proj').innerHTML = paneHead('proj') + shareHtml + PROJECTS.map((p, i) => `<div class="rk${i ? '' : ' on'}" data-proj="${esc(p.name)}">
    <span class="no n">${String(i + 1).padStart(2, '0')}</span><span class="nm">${esc(p.name)}</span>
    <span class="bar"><i style="width:${((p.gb / max) * 100).toFixed(1)}%"></i></span><span class="val"><b class="big cu" data-n="${p.gb}">0</b><span class="u">GB</span></span></div>`).join('')
    + `<div class="rk-sum n"><span class="no"></span><span class="nm">합계 ${PROJECTS.length}건<em class="tag">시연</em></span><span class="bar"></span><span class="val"><b class="big cu" data-n="${PROJ_SUM}">0</b><span class="u">GB</span></span></div>`;
}
{
  // 스토리지 = 총량 한 줄 + 쌓은 막대 + 6분류 랭크드 바 + 잔여 행 — 프로젝트 탭과 같은 행 밀도(빈 띠 대신 분류 값이 선다).
  const W = 600, tot = STORAGE.total; let x = 0;
  // 색 역할 — 정사영상 = 파랑(정보) · AI 분석 = 청록(AI 결과) · 나머지 무채. 행의 견본 = 쌓은 막대의 같은 칸.
  const tone = ['#006DF7', '#010102', '#686868', '#0FA9A0', '#CCCCCC', '#CCCCCC'];
  const max = Math.max(...STORAGE.parts.map((p) => p.tb));
  $('#pane-store').innerHTML = paneHead('store') + `<div class="pane-big"><b class="big cu" data-n="${STORAGE.used}" data-dec="1">0</b><span class="u">TB</span><span class="u">/ ${tot} TB</span><em class="tag">분류 배분 시연</em></div>
    <svg id="s-bar" viewBox="0 0 ${W} 40" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="${W - 1}" height="39" fill="none" stroke="#DDDDDD"/>
    ${STORAGE.parts.map((p, i) => { const w = (p.tb / tot) * W; const r = `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="40" fill="${tone[i]}"><title>${esc(p.label)} ${p.tb} TB</title></rect>`; x += w; return r; }).join('')}</svg>
    <div id="s-lg">${STORAGE.parts.map((p, i) => `<div class="rk li${i ? '' : ' on'}"><span class="no"><i class="sw" style="background:${tone[i]}"></i></span><span class="nm">${esc(p.label)}</span>
      <span class="bar"><i style="width:${((p.tb / max) * 100).toFixed(1)}%;background:${tone[i]}"></i></span><span class="val"><b class="big cu" data-n="${p.tb}" data-dec="1">0</b><span class="u">TB</span></span></div>`).join('')}<div class="rk-sum li rest n"><span class="no"><i class="sw"></i></span><span class="nm">잔여</span><span class="bar"></span><span class="val"><b class="big">${(tot - STORAGE.used).toFixed(1)}</b><span class="u">TB</span></span></div></div>`;
}
const TABS = ['proj', 'store'];
let TAB = 'proj';
let LAY = 'tabs';

/* ══ 패널 맞춤 — 빈 띠(법전 §6 · 80px 초과 금지)를 키우지 않고 콘텐츠로 채운다 ═══════════════
   판과 패널은 같은 격자 행이라 높이가 뷰포트를 따른다. 행 높이(--rh)를 패널 안쪽 높이에 맞춰 나눠
   목록 위아래에 공기가 고이지 않게 한다. 두 목록(6 + 7행)이 행 ≥ BOTH_MIN 으로 다 들어가면 탭을 내리고
   한 패널에 위아래로 세운다(1920×1200 등) — 탭 뒤에 숨기면 큰 모니터에서 패널이 절반 넘게 빈다.
   탭 조판에서 행이 상한에 닿으면(1920×1017 · 1440×1000 등, regate E0-6) 용량 목록 위에 비중 띠를 세우고,
   하한 밑이면(1101×640) 스토리지 쌓은 막대를 내린다. 낮은 행은 .dense(<34) · .tight(<26) 로 값 글자를 줄인다. */
const ROW_MIN = 24, ROW_MAX = 58, BOTH_MIN = 26, ROW_FLOOR = 21, DENSE = 34, TIGHT = 26;
function paneFit(pane, inner) {
  const rows = $$(':scope > .rk, :scope > .rk-sum, #s-lg > *', pane);
  const fixed = [...pane.children].filter((e) => !rows.includes(e) && e.id !== 's-lg')
    .reduce((a, e) => { const cs = getComputedStyle(e); return cs.display === 'none' ? a : a + e.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); }, 0);
  return { rows: rows.length, fixed };
}
function fitPanel() {
  const panel = $('#panel'); if (!panel) return;
  const setLay = (l) => { LAY = l; panel.dataset.lay = l; $('#right').dataset.lay = l; };
  const pad = (e) => { const cs = getComputedStyle(e); return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom); };
  const P = $('#pane-proj'), S = $('#pane-store'), share = $('.p-share', P), sbar = $('#s-bar', S);
  // 행이 낮으면(< DENSE) 1위 값 글자를 26 → 20px 로 — 28px 행에 26px 숫자가 끼어 답답하지 않게.
  const setRh = (p, v) => { p.style.setProperty('--rh', `${v}px`); p.classList.toggle('dense', v < DENSE); p.classList.toggle('tight', v < TIGHT); };
  share.hidden = true; sbar.style.display = '';
  // 1) 두 목록을 한 패널에 — 행이 BOTH_MIN 이상이면 채택
  const was = LAY; setLay('both'); P.hidden = false; S.hidden = false;
  const gap = parseFloat(getComputedStyle(panel).rowGap) || 0;
  const innerB = panel.clientHeight - pad(panel) - gap;
  const a = paneFit(P), b = paneFit(S);
  const rB = (innerB - a.fixed - b.fixed) / (a.rows + b.rows);
  if (rB >= BOTH_MIN && innerWidth > 1100) {
    const rh = Math.min(ROW_MAX, Math.floor(rB)); setRh(P, rh); setRh(S, rh);
    if (was !== 'both') { P.classList.add('is-in'); S.classList.add('is-in'); requestAnimationFrame(() => $$('#pane-store .cu').forEach(countUp)); }
    return;
  }
  // 2) 탭 — 목록마다 제 패널 높이에 맞춘다
  setLay('tabs');
  for (const k of TABS) { const p = $(`#pane-${k}`); p.hidden = k !== TAB; p.classList.toggle('is-in', k === TAB); }
  const rowOf = (p) => { const f = paneFit(p); return (p.clientHeight - pad(p) - f.fixed) / f.rows; };
  for (const p of [P, S]) {
    const was = p.hidden; p.hidden = false;                 // 숨은 목록도 머리 높이를 재야 한다 — 한 프레임 안이라 보이지 않는다
    let r = rowOf(p);
    // 행이 상한에 닿아 공기가 남으면 → 프로젝트 목록 위에 용량 비중 띠를 세운다(실값). 늘린 행으로 채우지 않는다.
    if (p === P && r > ROW_MAX) { share.hidden = false; r = rowOf(p); if (r < ROW_MIN + 10) { share.hidden = true; r = rowOf(p); } }
    // 행이 하한 밑이면(1101×640 등 낮은 화면) → 스토리지 쌓은 막대를 내린다(분류 값은 행의 막대가 그대로 말한다).
    if (p === S && r < ROW_MIN) { sbar.style.display = 'none'; r = rowOf(p); }
    setRh(p, Math.max(ROW_FLOOR, Math.min(ROW_MAX, Math.floor(r))));
    p.hidden = was;
  }
}
function setTab(t, { remember = true } = {}) {
  if (!TABS.includes(t)) t = 'proj';
  TAB = t;
  for (const b of $$('#tabs [role=tab]')) { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  const both = LAY === 'both';
  for (const k of TABS) { const p = $(`#pane-${k}`); p.hidden = !both && k !== t; p.classList.toggle('is-in', both || k === t); }
  $('#panel').title = TAB_TITLE[t];
  const more = $('#b10-more'); more.href = TAB_MORE[t].href; more.textContent = TAB_MORE[t].label;
  document.documentElement.dataset.tab = t;
  requestAnimationFrame(() => { $$(both ? '#panel .cu' : `#pane-${t} .cu`).forEach(countUp); fitPanel(); });
  if (remember) { try { localStorage.setItem('lx_dash_tab', t); } catch { /* 저장소 차단 */ } }
}
$('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
$('#tabs').addEventListener('keydown', (ev) => {
  const i = TABS.indexOf(TAB), n = TABS.length; let j = null;
  if (ev.key === 'ArrowRight') j = (i + 1) % n; else if (ev.key === 'ArrowLeft') j = (i + n - 1) % n; else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = n - 1;
  if (j == null) return; ev.preventDefault(); setTab(TABS[j]); $(`#tab-${TABS[j]}`).focus();
});

/* ══ 딥링크 — ?tab=proj|store 만. 승인 관련 ?status= · ?open= 은 운영 현황의 것이다(E1-6). ═ */
function deepLink() {
  const q = new URLSearchParams(location.search);
  if (q.get('tab')) setTab(q.get('tab'), { remember: false });
}

/* ══ 도착 — 카운트업 1000ms(법전 지속 4단 중 --d3) easeOutQuart ═══════════════ */
function countUp(el) {
  const to = parseFloat(el.dataset.n || el.textContent) || 0, dec = +(el.dataset.dec || 0);
  const fmt = (v) => (dec ? v.toFixed(dec) : nf.format(Math.round(v)));
  const unit = el.querySelector('i'); const put = (s) => { el.textContent = s; if (unit) el.append(unit); };
  if (REDUCED()) { put(fmt(to)); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 1000); put(fmt(to * EASE4(k))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ══ 기동 ═══════════════════════════════════════════════════════════════ */
layoutPlate();
paintCells();
mountMap();
new ResizeObserver(layoutPlate).observe(wrap);
new ResizeObserver(() => fitPanel()).observe($('#panel'));
let saved = null; try { saved = localStorage.getItem('lx_dash_tab'); } catch { /* 저장소 차단 */ }
setTab(TABS.includes(saved) ? saved : 'proj', { remember: false });
requestAnimationFrame(() => {
  document.documentElement.dataset.dash = 'ready';
  $$('#b-kpi .cu').forEach(countUp);
  deepLink();
});
