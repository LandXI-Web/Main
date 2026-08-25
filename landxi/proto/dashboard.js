// Land-XI Ops Atlas — 지휘층.
// 세 레지스터가 각각 "지도 레이어 한 벌 + 원장 한 벌"을 켠다. 대시보드 아래에 지도를
// 깔지 않는다 — 지도가 대시보드이고, 원장은 그 지도를 읽는 방식이다.
//   01 추론 현황  = 기존 [분석 실행] 기능. 어느 지역에서 어떤 모델이 돌고 있는가.
//   02 학습데이터 = 기존 [데이터 관리] 기능. 학습데이터가 어디에 어떻게 쌓였는가.
//   03 결과 누적  = 기존 [분석 결과 / XI맵] 기능. 결과가 지역별로 얼마나 쌓였는가.
// 기존 대시보드의 나머지 기능(처리 대기 큐·KPI·방문/스토리지·전국 커버리지)은
// 원장 꼬리에 시연 데이터 그대로 남는다. 기능을 새로 만들지 않았다.
import {
  nf, pct, ymd, REGISTERS, REG_IDS, DATA_ASOF,
  TOTAL_OBJECTS, TOTAL_AREA_HA, RUNS, DONE, doneById, IMG, IMG_CITY, IMG_AOI,
  CLASS_BALANCE, STACKS, STACK_MAX, KPI, BACKBONE, MODEL_LIST, EPOCHS, T1, COVERAGE,
  NAV, NAV_FOOT, NAV_MY, NOTICE, APPROVALS, ADMIN_TILES, imgById, imgForBBox, gsdText, ENGINE, CRS,
} from './db-data.js';
import { mountPlate, densify, gapCells, stackFC, STACK_SCALE, tile2lng, tile2lat } from './db-plate.js';
import { realTiles, indexDetections, makeSweep, fmtEta } from './db-sweep.js';
import { mountStrip } from './db-strip.js';
import { drawMinis } from './db-charts.js';
import { CROPS } from '../assets/data/crops.js';

const $ = (s, r = document) => r.querySelector(s);
const AOI_BOUNDS = [[tile2lng(13980, 14), tile2lat(6473, 14)], [tile2lng(14001, 14), tile2lat(6458, 14)]];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 프로비넌스 카드의 '생성시각' — 이 카드가 지금 만들어졌다는 사실만 적는다. */
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';

/* ── 마스트헤드 ───────────────────────────────────────────────────────── */
$('#mast-asof').textContent = DATA_ASOF;
$('#mast-title').textContent = 'LX 관리자 대시보드';
$('#mast-src').textContent = `결과 ${DONE.length} · 모델 ${MODEL_LIST.length} · 영상 ${IMG.length}`;

const TICK = 1000 / 120;                 // 스윕 틱 — 120ms 에 한 칸

/* ── 좌측 내비게이션 레일 ─────────────────────────────────────────────
   원본 include/header.html 의 메뉴 구조 그대로. 새 메뉴를 만들지 않는다.
   원본 페이지가 이 저장소에 없을 때는 같은 데이터가 있는 우리 자리로 보내고,
   대응 관계는 title 에 원본 파일명으로 남긴다(대조표 §A). */
const RAIL_ICON = {
  dash: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  data: '<rect x="10" y="10" width="4" height="4"/><path d="M10 10L6 6M14 10l4-4M10 14l-4 4M14 14l4 4"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  proj: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  run: '<polygon points="5 3 19 12 5 21 5 3"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  stack: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  my: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};
const railIcon = (k) => `<svg class="ri-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${RAIL_ICON[k] || ''}</svg>`;
const railItem = (n) => `
  <button type="button" class="rail-i" data-menu="${n.menu}" data-act='${JSON.stringify(n.act)}'
    title="원본 ${n.href}">${railIcon(n.icon)}<span class="rl">${esc(n.name)}</span></button>`;

$('#rail-top').innerHTML = NAV.map(railItem).join('');
$('#rail-foot').innerHTML = NAV_FOOT.map(railItem).join('')
  + `<div class="rail-i rail-my" data-menu="my">${railIcon('my')}<span class="rl">MY</span>
       <div class="rail-fly">${NAV_MY.map((m) => (m.action
         ? `<button type="button" data-action="${m.action}">${esc(m.name)}</button>`
         : `<a href="${esc(m.href)}">${esc(m.name)}</a>`)).join('')}</div>
     </div>`;

/** 레일 항목은 원본 페이지로 가지 않는다 — 그 내용이 우리 화면 어디에 있는지로 간다. */
function railGo(act) {
  if (act.here) { $('#ledger').scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }); return; }
  if (act.tab) { go(act.tab); return; }
  if (act.to) scrollLedgerTo(act.to);
}
function scrollLedgerTo(id) {
  const t = document.getElementById(id);
  if (!t) return;
  $('#ledger').scrollTo({ top: t.offsetTop - 4, behavior: REDUCED() ? 'auto' : 'smooth' });
  t.classList.remove('is-ping');
  requestAnimationFrame(() => t.classList.add('is-ping'));
}
$('#rail').addEventListener('click', (ev) => {
  const lo = ev.target.closest('[data-action="logout"]');
  if (lo) { try { localStorage.removeItem('lx_logged_in'); } catch (e) { /* 저장소 차단 */ } location.href = '../home.html'; return; }
  const b = ev.target.closest('.rail-i[data-act]');
  if (!b) return;
  document.querySelectorAll('.rail-i').forEach((x) => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'page');
  railGo(JSON.parse(b.dataset.act));
});

/* ── 레지스터 탭 ──────────────────────────────────────────────────────── */
const regsEl = $('#regs');
regsEl.setAttribute('role', 'tablist');
regsEl.innerHTML = REGISTERS.map((r) => `
  <button type="button" class="reg" role="tab" id="tab-${r.id}" data-reg="${r.id}" aria-selected="false">
    <span class="ri num">${r.idx}</span><span class="rn">${esc(r.name)}</span><span class="rt num">${esc(r.tally())}</span>
  </button>`).join('');

let REG = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
if (!REG_IDS.includes(REG)) REG = 'infer';

/* ── 큰 숫자 ──────────────────────────────────────────────────────────── */
const headStat = $('#head-stat');
/** 숫자만 갈아 끼운다 — 매 프레임 현상 애니메이션을 다시 돌리지 않게. */
function setHeadValue(n) {
  const s = nf.format(n);
  const chs = headStat.querySelectorAll('.ch');
  if (chs.length !== s.length) return false;
  [...s].forEach((c, i) => { if (chs[i].textContent !== c) chs[i].textContent = c; });
  return true;
}

function setTitle(reg) {
  const r = REGISTERS.find((x) => x.id === reg);
  $('#head-title').textContent = r.name;
  $('#head-kicker').textContent = `${r.idx} · ${r.sub}`;
}

function setHead(label, value, unit, sub) {
  $('#head-label').textContent = label;
  $('#head-sub').innerHTML = sub;
  const s = typeof value === 'number' ? nf.format(value) : value;
  headStat.innerHTML = [...s].map((c, i) => `<span class="ch" style="--i:${i}">${esc(c)}</span>`).join('')
    + (unit ? `<span class="u">${esc(unit)}</span>` : '');
  headStat.classList.remove('is-in');
  requestAnimationFrame(() => headStat.classList.add('is-in'));
}

/* ── 부유 카드 / 프로브 ───────────────────────────────────────────────── */
const cardEl = $('#card');
const probeEl = $('#probe');
function showCard({ kind, title, rows, img, prov }) {
  cardEl.hidden = false;
  cardEl.innerHTML = `
    <div class="ch"><span class="label">${esc(kind)}</span><button type="button" aria-label="닫기">×</button></div>
    ${img ? `<img src="${esc(img)}" alt="">` : ''}
    <div class="cb"><h3>${esc(title)}</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${prov ? `<p class="cf">출처 ${esc(prov)}</p>` : ''}`;
  cardEl.querySelector('button').addEventListener('click', () => { cardEl.hidden = true; });
}
function showProbe(x, y, html) {
  probeEl.hidden = false;
  probeEl.innerHTML = html;
  const r = probeEl.getBoundingClientRect();
  probeEl.style.left = `${Math.min(innerWidth - r.width - 10, x + 14)}px`;
  probeEl.style.top = `${Math.min(innerHeight - r.height - 84, y + 14)}px`;
}
const hideProbe = () => { probeEl.hidden = true; };

/* ── 지도 ─────────────────────────────────────────────────────────────── */
const PLATE = await mountPlate($('#plate'));
const map = PLATE.map;
// e2e/검수용 핸들 — 화면 동작에는 관여하지 않는다.
window.__atlas = { map, get reg() { return REG; }, get tiles() { return INFER.tiles; }, get runs() { return INFER.runs; }, get scrub() { return SCRUB_DATE; }, seek: (p) => STRIP.seek(p) };
// 원장이 가린 만큼 카메라 중심을 오른쪽으로 민다 — 클릭한 것이 원장 뒤로 숨지 않게.
const cssPx = (n, d) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || d;
const padded = () => ({ left: cssPx('--rail', 54) + cssPx('--led', 380), top: 56, bottom: 72, right: 20 });
map.setPadding(padded());
addEventListener('resize', () => map.setPadding(padded()));

/** 타일 관문 — 카메라가 멈추고 목적지 타일이 다 올 때까지 기다렸다가 알린다.
 *  'idle' 은 쓸 수 없다: 스윕이 매 프레임 소스를 갱신하는 동안 지도는 결코 idle 이 아니다. */
function whenSettled(done, timeout = 4000) {
  const t0 = performance.now();
  const poll = () => {
    if (map.areTilesLoaded() || performance.now() - t0 > timeout) { done(); return; }
    setTimeout(poll, 120);
  };
  map.once('moveend', poll);
}
function flyGated(opts, done) {
  map.flyTo({ duration: REDUCED() ? 0 : 1400, essential: true, ...opts });
  if (done) whenSettled(done);
}

/* ══ 레지스터 01 · 추론 현황 ═════════════════════════════════════════════ */
const INFER = { tiles: null, runs: [], raf: 0, last: 0, sel: null };

async function buildInfer() {
  if (INFER.tiles) return;
  $('#reg-body').innerHTML = `<p class="fg__h"><b>FIG. 01</b> 실타일 목록 확인 중…</p>`;
  const tiles = await realTiles();
  INFER.tiles = tiles;
  // 실행 3건 — 각자 다른 모델·다른 탐지셋·다른 속도. 진행률은 전부 측정값.
  // 초당 타일 수. 스윕 틱 120ms — 칸이 하나씩 넘어가는 것이 눈에 읽히는 속도.
  const rates = [TICK, TICK / 1.5, TICK * 1.35];   // 기준 = 120ms 에 한 칸
  const offs = [0.35, 0.12, 0.58];
  INFER.runs = await Promise.all(RUNS.map(async (r, i) => {
    const index = await indexDetections(r.detections);
    return { ...r, index, sweep: makeSweep({ tiles, index, rate: rates[i], offset: offs[i] }) };
  }));
}

function inferLedger() {
  const runs = INFER.runs;
  const el = $('#reg-body');
  el.innerHTML = `
  <section class="fg">
    <p class="fg__h"><b>FIG. 01</b> 실행 중 · <span class="num">${runs.length}</span>건 <i class="tag tag--sim">모의 실행</i><span class="rt">tiles / s</span></p>
    <div class="colh"><span></span><span>모델 · 지역 · 진행</span><span>속도</span><span>ETA</span></div>
    <div class="rows" id="run-rows" role="list">
      ${runs.map((r) => `
        <button type="button" class="row is-run" role="listitem" data-run="${r.id}">
          <i class="dot"></i>
          <span class="t">${esc(r.task)} · ${esc(r.region)}</span>
          <span class="v num" data-tps>—</span>
          <span class="s num" data-sub>—</span>
          <span class="p num" data-eta>—</span>
          <span class="bar"><i style="width:0%"></i></span>
        </button>`).join('')}
    </div>
    <p class="fg__h"><b>FIG. 02</b> 완료 · <span class="num">${DONE.length}</span>건 <i class="tag tag--meas">측정</i><span class="rt">객체 수</span></p>
    <div class="colh"><span></span><span>결과 · 지역 · 분석일</span><span>객체</span><span>진행</span></div>
    <div class="rows" id="done-rows" role="list">
      ${DONE.map((r) => `
        <button type="button" class="row is-done" role="listitem" data-done="${r.id}">
          <i class="dot"></i>
          <span class="t">${esc(r.title)}</span>
          <span class="v num">${nf.format(r.count)}<em>${esc(r.unit)}</em></span>
          <span class="s num">${esc(r.region)} · ${esc(r.sensor)} · ${ymd(r.date)}</span>
          <span class="p num">100%</span>
        </button>`).join('')}
    </div>
    <p class="fg__h"><b>FIG. 03</b> 모델 카드 · <span class="num">${MODEL_LIST.length}</span>종<span class="rt">백본 ${esc(BACKBONE.name)} ${esc(BACKBONE.ver)}</span></p>
    <div class="chips" id="model-chips">
      ${MODEL_LIST.map((m) => `<span class="chip" data-model="${m.id}"><b>${esc(m.file)}</b> ${m.sizeMB}MB · ${esc(m.task)}</span>`).join('')}
    </div>
  </section>`;

  el.querySelectorAll('[data-run]').forEach((b) => {
    b.addEventListener('click', () => selectRun(b.dataset.run));
    b.addEventListener('mouseenter', (ev) => {
      const r = runs.find((x) => x.id === b.dataset.run);
      showProbe(ev.clientX, ev.clientY, `<p class="pt">${esc(r.model.name)}</p><p class="ps">${esc(r.model.file)} · ${r.model.sizeMB}MB · 클래스 ${r.model.classes.length}<br>영상 ${esc(r.imagery)} · z14 실타일 ${INFER.tiles.length}</p>`);
    });
    b.addEventListener('mouseleave', hideProbe);
  });
  el.querySelectorAll('[data-done]').forEach((b) => {
    b.addEventListener('click', () => selectDone(b.dataset.done));
  });
  el.querySelectorAll('[data-model]').forEach((c) => {
    c.addEventListener('mouseenter', (ev) => {
      const m = MODEL_LIST.find((x) => x.id === c.dataset.model);
      showProbe(ev.clientX, ev.clientY, `<p class="pt">${esc(m.name)}</p><p class="ps">클래스 ${m.classes.map(esc).join(' · ')}<br>학습 ${esc(m.trainedAt)} · ${esc(m.task)}${m.inferred ? ' · 클래스 추정' : ''}</p>`);
    });
    c.addEventListener('mouseleave', hideProbe);
  });
}

function selectRun(id) {
  const r = INFER.runs.find((x) => x.id === id);
  if (!r) return;
  INFER.sel = id;
  document.querySelectorAll('#run-rows .row').forEach((b) => b.classList.toggle('is-sel', b.dataset.run === id));
  flyGated({ center: r.center, zoom: r.zoom, pitch: 0 }, () => {
    const s = r.sweep;
    const im = imgById(r.imagery);
    showCard({
      kind: '실행 · 모의 실행',
      title: `${r.task} · ${r.region}`,
      rows: [
        ['모델', `${esc(r.model.file)} · ${r.model.sizeMB} MB`],
        ['엔진', esc(ENGINE(r.model))],
        ['GSD', esc(gsdText(im))],
        ['좌표계', CRS],
        ['촬영일', esc(im ? im.captured.replace('-', '.') : '—')],
        ['생성시각', stamp()],
        ['클래스', r.model.classes.map(esc).join(', ')],
        ['타일', `<span class="num">${nf.format(s.i)}</span> / ${nf.format(s.total)} · z14`],
        ['처리 속도', `<span class="num">${s.tps.toFixed(0)}</span> tiles/s`],
        ['탐지 누적', `<span class="num">${nf.format(s.det)}</span>건`],
        ['ETA', fmtEta(s.eta)],
      ],
      prov: `assets/tiles/${r.imagery}/14/** (실타일 ${INFER.tiles.length}) · ${r.detections.replace('../', '')}`,
    });
  });
}

function selectDone(id) {
  const r = doneById(id);
  if (!r) return;
  document.querySelectorAll('#done-rows .row').forEach((b) => b.classList.toggle('is-sel', b.dataset.done === id));
  const crop = (CROPS[id] || [])[0];
  fetch(r.geojson).then((x) => x.json()).then((j) => {
    PLATE.setDet(j);
    PLATE.show(['det-dot'], true);
  });
  const b = r.bbox;
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 44, duration: REDUCED() ? 0 : 1400 });
  whenSettled(() => {
    showCard({
      kind: '완료 · 측정',
      title: r.title,
      img: crop ? '../' + crop.file : null,
      rows: [
        ['모델', esc(r.service)],
        ['엔진', `GPKG → GeoJSON · ${esc(r.sensor)} 정사영상`],
        ['GSD', esc(gsdText(imgForBBox(r.bbox)))],
        ['좌표계', CRS],
        ['촬영일', ymd(r.date)],
        ['생성시각', stamp()],
        ['지역', esc(r.region)],
        ['센서', esc(r.sensor)],
        ['객체', `<span class="num">${nf.format(r.count)}</span>${esc(r.unit)}`],
        ...Object.entries(r.classes).slice(0, 4).map(([k, v]) => [k, `<span class="num">${nf.format(v)}</span>`]),
        ['평균 신뢰도', `<span class="num">${r.conf.toFixed(3)}</span>`],
        ...(r.areaHa ? [['면적', `<span class="num">${nf.format(Math.round(r.areaHa))}</span> ha`]] : []),
        ['분석일', ymd(r.date)],
      ],
      prov: `${r.geojson.replace('../', '')} · EPSG:5186 → 4326${crop ? ` · 크롭 ${crop.source}` : ''}`,
    });
  });
}

/* 현재 칸 안의 작은 수 — 화면에서 지도 위에 떠 있는 유일한 숫자.
   심볼 레이어(글리프)를 쓰지 않는다: 폰트를 외부에서 받아 오지 않기 위해서다. */
const cellNum = $('#cellnum');
function paintCellNum(sw) {
  const c = sw && !sw.done ? sw.liveCenter() : null;
  if (!c || REG !== 'infer') { cellNum.hidden = true; return; }
  const pt = map.project(c);
  if (pt.x < 0 || pt.y < 0 || pt.x > innerWidth || pt.y > innerHeight) { cellNum.hidden = true; return; }
  cellNum.hidden = false;
  cellNum.textContent = String(sw.liveCount);
  cellNum.classList.toggle('has-hit', sw.liveCount > 0);
  cellNum.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) translate(-50%,-50%)`;
}

/** 지도에 올릴 스윕 한 벌(선택된 실행). 세 겹이 겹치면 아무것도 안 보인다. */
function paintSweep(t) {
  const shown = INFER.runs.find((r) => r.id === INFER.sel) || INFER.runs[0];
  if (!shown) return;
  PLATE.setSweep(shown.sweep.features(t));
  PLATE.setSDet(shown.sweep.detFC());
  paintCellNum(shown.sweep);
}

function inferRows() {
  for (const r of INFER.runs) {
    const row = document.querySelector(`[data-run="${r.id}"]`);
    if (!row) continue;
    const s = r.sweep;
    row.querySelector('[data-tps]').innerHTML = `${s.tps.toFixed(0)}<em>t/s</em>`;
    row.querySelector('[data-sub]').textContent = `${esc(r.model.file)} · ${nf.format(s.i)}/${nf.format(s.total)} 타일 · 탐지 ${nf.format(s.det)}`;
    row.querySelector('[data-eta]').textContent = s.done ? '완료' : `ETA ${fmtEta(s.eta)}`;
    row.querySelector('.bar i').style.width = `${((s.i / s.total) * 100).toFixed(1)}%`;
  }
}

function inferHead() {
  const det = INFER.runs.reduce((a, r) => a + r.sweep.det, 0);
  if (REG === 'infer' && !setHeadValue(det)) {
    setHead('모의 실행 · 탐지 누적', det, '건',
      `z14 실타일 <span class="num">${INFER.tiles.length}</span>칸 · 모델 <span class="num">${INFER.runs.length}</span>종 동시 · 완료 <span class="num">${DONE.length}</span>건은 실측`);
  }
}

function inferFrame(t) {
  const dt = Math.min(400, t - (INFER.last || t));
  INFER.last = t;
  for (const r of INFER.runs) {
    if (r.sweep.done) r.sweep.reset();       // 다음 회차로 넘어간다
    r.sweep.advance(dt);
  }
  // 칸의 번쩍임이 500ms 에 걸쳐 가라앉으므로 매 프레임 다시 칠한다.
  paintSweep(t);
  inferHead();
  inferRows();
  INFER.raf = requestAnimationFrame(inferFrame);
}

async function enterInfer() {
  setHead('모의 실행 · 탐지 누적', 0, '건', '실타일 목록을 확인하는 중…');
  await buildInfer();
  if (REG !== 'infer') return;
  setHead('모의 실행 · 탐지 누적', 0, '건',
    `z14 실타일 <span class="num">${INFER.tiles.length}</span>칸 · 모델 <span class="num">${RUNS.length}</span>종 동시 · 완료 <span class="num">${DONE.length}</span>건은 실측`);
  inferLedger();
  PLATE.show(['aoi-under', 'aoi-line', 'aoi-tick', 'sweep-fill', 'sweep-line', 'sdet-dot'], true);
  // AOI 전체가 원장 오른쪽에 다 들어오게 — 스윕이 지역을 훑는 것으로 읽혀야 한다.
  map.fitBounds(AOI_BOUNDS, { padding: 36, duration: REDUCED() ? 0 : 1200 });
  cancelAnimationFrame(INFER.raf);
  INFER.last = 0;
  if (REDUCED()) {                       // 감소 모션 — 스스로 움직이지 않는 정지 프레임
    paintSweep(performance.now() + 1e6);  // 번쩍임이 이미 가라앉은 시각으로 그린다
    inferHead(); inferRows();
    return;
  }
  INFER.raf = requestAnimationFrame(inferFrame);
}
function leaveInfer() {
  cancelAnimationFrame(INFER.raf); INFER.raf = 0;
  cellNum.hidden = true;
  PLATE.show(['aoi-under', 'aoi-line', 'aoi-tick', 'sweep-fill', 'sweep-line', 'sdet-dot', 'det-dot'], false);
}

/* ══ 레지스터 02 · 학습데이터 ════════════════════════════════════════════ */
const TRAIN = { built: false, sel: null };

async function buildTrain() {
  if (TRAIN.built) return;
  const packs = {};
  for (const r of DONE) {
    const idx = await indexDetections(r.geojson);
    packs[r.id] = idx;
  }
  TRAIN.packs = packs;
  TRAIN.built = true;
}

function trainLedger() {
  const el = $('#reg-body');
  const totalCells = TRAIN.cells || 0;
  el.innerHTML = `
  <section class="fg">
    <p class="fg__h"><b>FIG. 01</b> 라벨 표본 밀도 · 100 m 격자 <i class="tag tag--meas">측정</i><span class="rt">칸 ${nf.format(totalCells)}</span></p>
    <div class="colh"><span></span><span>데이터셋 · 격자 · 밀도</span><span>표본</span><span>칸당</span></div>
    <div class="rows" id="dens-rows" role="list">
      ${DONE.map((r) => `
        <button type="button" class="row" role="listitem" data-dens="${r.id}">
          <i class="dot"></i>
          <span class="t">${esc(r.title)}</span>
          <span class="v num">${nf.format(r.count)}<em>${esc(r.unit)}</em></span>
          <span class="s num" data-cells>—</span>
          <span class="p num" data-per>—</span>
        </button>`).join('')}
    </div>

    <p class="fg__h"><b>FIG. 02</b> 클래스 균형 · 지역별 <i class="tag tag--meas">측정</i></p>
    <div class="bal">
      ${CLASS_BALANCE.map((b) => `
        <p class="bal__g">${esc(b.region)} · ${esc(b.title)} · ${nf.format(b.total)}</p>
        ${b.rows.map((c, i) => `
          <div class="bal__r${i % 2 ? ' alt' : ''}">
            <span class="bal__n">${esc(c.name)}</span>
            <span class="bal__t"><i style="width:${(c.share * 100).toFixed(1)}%"></i></span>
            <span class="bal__v">${nf.format(c.n)}</span>
          </div>`).join('')}`).join('')}
    </div>

    <p class="fg__h"><b>FIG. 03</b> 정사영상 인벤토리 · <span class="num">${IMG.length}</span>세트</p>
    <div class="chips" id="img-chips">
      ${IMG.map((i) => `<span class="chip" data-img="${i.id}"><b>${esc(i.label)}</b> ${i.gsdCm ? i.gsdCm + 'cm' : i.gsdM + 'm'} · ${esc(i.zSpan)}</span>`).join('')}
      <span class="chip chip--gap">결측 구간 = 점선 칸</span>
    </div>
  </section>`;

  el.querySelectorAll('[data-dens]').forEach((b) => {
    b.addEventListener('click', () => selectDensity(b.dataset.dens));
    b.addEventListener('mouseenter', (ev) => {
      const r = doneById(b.dataset.dens);
      const crop = (CROPS[r.id] || [])[0];
      showProbe(ev.clientX, ev.clientY,
        `<p class="pt">${esc(r.title)}</p><p class="ps">라벨 표본 ${nf.format(r.count)}${esc(r.unit)} · 평균 신뢰도 ${r.conf.toFixed(3)}</p>`
        + (crop ? `<img src="../${esc(crop.file)}" alt="">` : ''));
    });
    b.addEventListener('mouseleave', hideProbe);
  });
  el.querySelectorAll('[data-img]').forEach((c) => {
    const i = IMG.find((x) => x.id === c.dataset.img);
    c.addEventListener('mouseenter', (ev) => showProbe(ev.clientX, ev.clientY,
      `<p class="pt">${esc(i.label)}</p><p class="ps">${esc(i.kind)} · GSD ${i.gsdCm ? i.gsdCm + ' cm' : i.gsdM + ' m'} · 촬영 ${esc(i.captured)}<br>${esc(i.zSpan)} · ${esc(i.tiles)}</p>`));
    c.addEventListener('mouseleave', hideProbe);
    c.addEventListener('click', () => {
      document.querySelectorAll('[data-img]').forEach((x) => x.classList.toggle('is-sel', x === c));
      map.fitBounds([[i.bounds[0], i.bounds[1]], [i.bounds[2], i.bounds[3]]],
        { padding: 44, duration: REDUCED() ? 0 : 1200, maxZoom: 15.5 });
      showCard({
        kind: '영상 인벤토리',
        title: i.label,
        rows: [['유형', esc(i.kind)], ['GSD', i.gsdCm ? `${i.gsdCm} cm` : `${i.gsdM} m`],
          ['촬영', esc(i.captured)], ['줌', esc(i.zSpan)],
          ['범위', `${i.bounds.map((n) => n.toFixed(3)).join(', ')}`]],
        prov: i.tiles,
      });
    });
  });
  refreshDensityRows();
}

function refreshDensityRows() {
  for (const r of DONE) {
    const row = document.querySelector(`[data-dens="${r.id}"]`);
    if (!row || !TRAIN.packs) continue;
    const g = densify(TRAIN.packs[r.id].pts, 100);
    row.querySelector('[data-cells]').textContent = `100m 칸 ${nf.format(g.cells)} · 최대 ${nf.format(g.max)}건/칸`;
    row.querySelector('[data-per]').textContent = `${(r.count / Math.max(1, g.cells)).toFixed(1)}/칸`;
  }
}

function selectDensity(id) {
  const r = doneById(id);
  if (!r || !TRAIN.packs) return;
  TRAIN.sel = id;
  document.querySelectorAll('[data-dens]').forEach((b) => b.classList.toggle('is-sel', b.dataset.dens === id));
  const g = densify(TRAIN.packs[id].pts, 100);
  PLATE.setGrid(g.fc, gapCells(g.fc, 100));
  PLATE.show(['grid-fill', 'grid-line', 'gap-cells'], true);
  const b = r.bbox;
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 44, duration: REDUCED() ? 0 : 1400 });
  const crop = (CROPS[id] || [])[0];
  whenSettled(() => showCard({
    kind: '학습데이터 · Acquired',
    title: r.title,
    img: crop ? '../' + crop.file : null,
    rows: [
      ['라벨 표본', `<span class="num">${nf.format(r.count)}</span>${esc(r.unit)}`],
      ['100 m 칸', `<span class="num">${nf.format(g.cells)}</span>`],
      ['최대 밀도', `<span class="num">${nf.format(g.max)}</span> 건/칸`],
      ['평균 밀도', `<span class="num">${(r.count / Math.max(1, g.cells)).toFixed(1)}</span> 건/칸`],
      ...(crop ? [['크롭 GSD', `<span class="num">${crop.gsd.toFixed(3)}</span> m`], ['크롭 신뢰도', `<span class="num">${crop.conf.toFixed(3)}</span>`]] : []),
    ],
    prov: `${r.geojson.replace('../', '')}${crop ? ` · ${crop.file}` : ''}`,
  }));
}

async function enterTrain() {
  setHead('라벨 표본', TOTAL_OBJECTS, '건', '집계 중…');
  await buildTrain();
  if (REG !== 'train') return;
  let cells = 0;
  for (const r of DONE) cells += densify(TRAIN.packs[r.id].pts, 100).cells;
  TRAIN.cells = cells;
  setHead('라벨 표본', TOTAL_OBJECTS, '건',
    `100 m 격자 <span class="num">${nf.format(cells)}</span>칸 · 정사영상 <span class="num">${IMG.length}</span>세트 · 전역 ${IMG_CITY.length} / AOI ${IMG_AOI.length}`);
  trainLedger();
  PLATE.show(['imgbox-line'], true);
  selectDensity(TRAIN.sel || DONE[0].id);
}
function leaveTrain() {
  PLATE.show(['grid-fill', 'grid-line', 'gap-cells', 'imgbox-line'], false);
}

/* ══ 레지스터 03 · 결과 누적 ═════════════════════════════════════════════ */
let SCRUB_DATE = T1;

function resultsLedger() {
  const el = $('#reg-body');
  const est = COVERAGE.filter((c) => !c.measured);
  el.innerHTML = `
  <section class="fg">
    <p class="fg__h"><b>FIG. 01</b> 시군구별 결과 적층 <i class="tag tag--meas">측정</i><span class="rt">epoch 스택</span></p>
    <div class="colh"><span></span><span>시군구 · epoch</span><span>누적</span><span>층</span></div>
    <div class="rows" id="stack-rows" role="list">
      ${STACKS.map((s) => `
        <button type="button" class="row is-done" role="listitem" data-stack="${s.code}">
          <i class="dot"></i>
          <span class="t">${esc(s.region)}</span>
          <span class="v num" data-tot>${nf.format(s.total)}</span>
          <span class="s num" data-lay>${s.layers.map((l) => ymd(l.date).slice(5)).join(' → ')}</span>
          <span class="p num">${s.layers.length}층</span>
          <span class="bar"><i style="width:${((s.total / STACK_MAX) * 100).toFixed(0)}%"></i>${s.layers.map((l) => `<b style="left:${((l.top / STACK_MAX) * 100).toFixed(1)}%"></b>`).join('')}</span>
        </button>`).join('')}
    </div>

    <p class="fg__h"><b>FIG. 02</b> 층 · epoch <span class="num">${EPOCHS.length}</span>개 <i class="tag tag--meas">측정</i></p>
    <div class="rows" role="list">
      ${STACKS.flatMap((s) => s.layers.map((l) => `
        <button type="button" class="row" role="listitem" data-layer="${l.id}">
          <i class="dot"></i>
          <span class="t">${esc(l.title)}</span>
          <span class="v num">${nf.format(l.count)}<em>${esc(l.unit)}</em></span>
          <span class="s num">${ymd(l.date)} · 누적 ${nf.format(l.top)}</span>
          <span class="p num">${pct(l.count / STACK_MAX)}</span>
        </button>`)).join('')}
    </div>

    <p class="fg__h"><b>FIG. 03</b> 미실측 시군구 · <span class="num">${est.length}</span>곳 <i class="tag tag--demo">추정</i><span class="rt">커버리지 시연값</span></p>
    <div class="rows" role="list">
      ${est.slice(0, 6).map((c) => `
        <div class="row" role="listitem">
          <i class="dot"></i>
          <span class="t">${esc(c.name)}</span>
          <span class="v num">—</span>
          <span class="s num">조사 항목 ${c.done.length} · 커버리지 ${pct(c.coverage)}</span>
          <span class="p num">추정</span>
        </div>`).join('')}
    </div>
    <p class="caption" style="padding:0 22px 14px">기둥 높이는 실측 객체 수에만 세운다. 추정 시군구는 높이를 갖지 않고 경계 농도로만 남는다 —
      <span class="num">${nf.format(STACK_SCALE.per)}</span>건 = 1 km.</p>
  </section>`;

  el.querySelectorAll('[data-stack]').forEach((b) => b.addEventListener('click', () => {
    const s = STACKS.find((x) => x.code === b.dataset.stack);
    document.querySelectorAll('[data-stack]').forEach((x) => x.classList.toggle('is-sel', x === b));
    flyGated({ center: s.center, zoom: 9.4, pitch: 50, bearing: -14 }, () => showCard({
      kind: '결과 누적 · 측정',
      title: s.region,
      rows: [
        ['누적 객체', `<span class="num">${nf.format(s.total)}</span>건`],
        ...s.layers.map((l) => [ymd(l.date), `<span class="num">${nf.format(l.count)}</span> ${esc(l.unit)}`]),
        ['기둥 축척', `<span class="num">${nf.format(STACK_SCALE.per)}</span>건 = 1 km`],
      ],
      prov: s.layers.map((l) => `assets/data/geo/results/${l.id}.geojson`).join(' · '),
    }));
  }));
  el.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => selectDone(b.dataset.layer)));
}

function paintStacks() {
  PLATE.setStack(stackFC(SCRUB_DATE));
  const rows = document.querySelectorAll('[data-stack]');
  if (!rows.length) return;
  for (const s of STACKS) {
    const row = document.querySelector(`[data-stack="${s.code}"]`);
    if (!row) continue;
    const grown = s.layers.filter((l) => l.date <= SCRUB_DATE);
    const tot = grown.reduce((a, l) => a + l.count, 0);
    row.querySelector('[data-tot]').textContent = nf.format(tot);
    row.querySelector('[data-lay]').textContent = grown.length
      ? `${grown.map((l) => ymd(l.date).slice(5)).join(' → ')} · ${grown.length}/${s.layers.length}층`
      : `${ymd(SCRUB_DATE)} 시점 · 아직 없음`;
    row.querySelector('.bar i').style.width = `${((tot / STACK_MAX) * 100).toFixed(1)}%`;
  }
  const total = STACKS.reduce((a, s) => a + s.layers.filter((l) => l.date <= SCRUB_DATE).reduce((b, l) => b + l.count, 0), 0);
  if (REG !== 'results') return;
  // 자릿수가 그대로면 숫자만 갈아 끼운다 — 매 프레임 현상 애니메이션을 다시 돌리면 글자가 안 보인다.
  $('#head-sub').innerHTML = `<span class="num">${ymd(SCRUB_DATE)}</span> 시점 · 시군구 <span class="num">${STACKS.length}</span>곳 실측 · 스트립을 끌면 기둥이 자란다`;
  if (!setHeadValue(total)) setHead('누적 결과', total, '건', $('#head-sub').innerHTML);
}

function enterResults() {
  resultsLedger();
  PLATE.show(['stack-3d', 'sig-cov'], true);
  paintStacks();
  flyGated({ center: [127.45, 35.05], zoom: 7.7, pitch: 46, bearing: -14 });
}
function leaveResults() {
  PLATE.show(['stack-3d', 'sig-cov'], false);
  map.easeTo({ pitch: 0, bearing: 0, duration: REDUCED() ? 0 : 700 });
}

/* ══ 원장 꼬리 — 원본 대시보드 위젯 1:1 ═════════════════════════════════
   대조표: docs/superpowers/proto/2026-08-26-dashboard-parity.md §B
   여기에 있는 것은 전부 원본 dashboard.html 에 있는 것이고, 없는 것은 만들지 않았다. */
function opsTail() {
  /* B3 공지 */
  $('#ops-notice').innerHTML = `
    <a class="row is-link" href="../notice.html?notice=${NOTICE.id}">
      <i class="dot dot--warn"></i>
      <span class="t">${esc(NOTICE.title)}</span>
      <span class="v num">${ymd(NOTICE.date)}</span>
    </a>`;

  /* B9 백본 */
  $('#ops-bb').innerHTML = `
    <div class="bb">
      <p class="bb__n"><b>${esc(BACKBONE.name)}</b> <span class="num">${esc(BACKBONE.ver)}</span></p>
      <dl class="bb__m">
        <dt>최종 적용</dt><dd class="num">${esc(BACKBONE.applied)}</dd>
        <dt>연결된 분석 과제</dt><dd class="num">${BACKBONE.tasks}<em>개</em></dd>
      </dl>
    </div>`;

  /* B4–B8 KPI 5 */
  $('#ops-kpi').innerHTML = `<div class="kpis">${KPI.map((k, i) => `
    <button type="button" class="k" data-kpi="${i}" title="원본 ${esc(k.href)}">
      <p class="k__l">${esc(k.label)}</p>
      <p class="k__v num">${nf.format(k.value)}<em>${esc(k.unit)}</em></p>
      <p class="k__s">${esc(k.sub)}</p></button>`).join('')}</div>`;
  $('#ops-kpi').querySelectorAll('[data-kpi]').forEach((b) => {
    const k = KPI[+b.dataset.kpi];
    b.addEventListener('click', () => { if (k.to) scrollLedgerTo(k.to); });
  });

  /* B10–B12 차트 3 */
  drawMinis($('#ops-chart'));

  /* B13 카드 발행 승인 대기 */
  $('#ops-n').textContent = APPROVALS.length;
  $('#ops-rows').innerHTML = APPROVALS.length ? APPROVALS.map((a) => `
    <button type="button" class="row" role="listitem" data-ap="${a.i}">
      <i class="dot"></i>
      <span class="t">${esc(a.title)}</span>
      <span class="v num">검토</span>
      <span class="s num">${esc(a.requester)} · ${esc(a.at)}</span>
    </button>`).join('') : '<p class="caption" style="padding:2px 22px 12px">승인 대기 중인 카드가 없습니다.</p>';
  $('#ops-rows').querySelectorAll('[data-ap]').forEach((b) => {
    const a = APPROVALS[+b.dataset.ap];
    b.addEventListener('click', () => {
      flyGated({ center: a.lnglat, zoom: 12.6 }, () => showCard({
        kind: '카드 발행 승인 대기 · 시연',
        title: a.title,
        rows: [['요청자', esc(a.requester)], ['요청 시각', esc(a.at)], ['내용', esc(a.sub)],
          ['좌표', a.lnglat.map((n) => n.toFixed(3)).join(', ')]],
        prov: `원본 admin-publish.html?open=${a.id} · assets/data/dashboard.js(시연)`,
      }));
    });
  });

  /* B14 사용자·콘텐츠 관리 4 */
  $('#ops-admin').innerHTML = ADMIN_TILES.map((t) => `
    <div class="row is-static" role="listitem" title="원본 ${esc(t.href)}">
      <i class="dot dot--o"></i>
      <span class="t">${esc(t.name)}</span>
      <span class="s num">${esc(t.desc)}</span>
    </div>`).join('');
}

/* ══ 전환 ════════════════════════════════════════════════════════════════ */
const ENTER = { infer: enterInfer, train: enterTrain, results: enterResults };
const LEAVE = { infer: leaveInfer, train: leaveTrain, results: leaveResults };

async function go(id, push = true) {
  if (!REG_IDS.includes(id)) id = 'infer';
  if (LEAVE[REG]) LEAVE[REG]();
  cardEl.hidden = true;
  REG = id;
  document.querySelectorAll('.reg').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.reg === id)));
  document.body.dataset.reg = id;
  setTitle(id);
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('tab', id);
    history.replaceState(null, '', u);
  }
  await ENTER[id]();
}
regsEl.addEventListener('click', (ev) => {
  const b = ev.target.closest('.reg');
  if (b) go(b.dataset.reg);
});
addEventListener('popstate', () => go(new URLSearchParams(location.search).get('tab') || 'infer', false));

/* ── 스캔 스트립 ──────────────────────────────────────────────────────── */
const STRIP = mountStrip($('#strip'), {
  onScrub: (p, date) => {
    SCRUB_DATE = date;
    if (REG === 'results') paintStacks();
  },
  onEvent: (e) => {
    if (REG === 'results') paintStacks();
  },
});

opsTail();
await go(REG, false);
document.documentElement.dataset.atlas = 'ready';

/* 지도 위 상호작용 — 탐지 점·기둥·핀 */
map.on('move', () => {
  if (REG !== 'infer' || !INFER.runs.length) return;
  paintCellNum((INFER.runs.find((r) => r.id === INFER.sel) || INFER.runs[0]).sweep);
});
map.on('mousemove', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot', 'stack-3d', 'grid-fill'].filter((l) => map.getLayer(l)) });
  map.getCanvas().style.cursor = feats.length ? 'pointer' : '';
  if (!feats.length) { hideProbe(); return; }
  const f = feats[0];
  const p = f.properties;
  const html = f.layer.id === 'pin-dot'
    ? `<p class="pt">${esc(p.title)}</p><p class="ps">카드 발행 승인 대기 · ${esc(p.requester)} · ${esc(p.at)}</p>`
    : f.layer.id === 'stack-3d'
      ? `<p class="pt">${esc(p.title)}</p><p class="ps">${esc(p.region)} · ${ymd(p.date)} · ${nf.format(p.count)}${esc(p.unit)}</p>`
      : `<p class="pt">100 m 칸</p><p class="ps">라벨 표본 ${nf.format(p.n)}건</p>`;
  showProbe(ev.originalEvent.clientX, ev.originalEvent.clientY, html);
});
map.on('click', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot', 'stack-3d'].filter((l) => map.getLayer(l)) });
  if (!feats.length) return;
  const p = feats[0].properties;
  if (feats[0].layer.id === 'stack-3d') selectDone(p.id);
  else showCard({ kind: '카드 발행 승인 대기 · 시연', title: p.title,
    rows: [['요청자', esc(p.requester)], ['요청 시각', esc(p.at)], ['내용', esc(p.sub)]],
    prov: `원본 admin-publish.html?open=${esc(p.id)} · assets/data/dashboard.js(시연)` });
});
