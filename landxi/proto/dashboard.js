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
  CLASS_BALANCE, STACKS, STACK_MAX, QUEUE, QUEUE_BY_TYPE, KPI, COVERAGE, COLS,
  DONE_CELLS, CELLS, BACKBONE, MODEL_LIST, EPOCHS, T1,
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

/* ── 마스트헤드 ───────────────────────────────────────────────────────── */
$('#mast-asof').textContent = DATA_ASOF;
$('#mast-src').textContent = `결과 ${DONE.length} · 모델 ${MODEL_LIST.length} · 영상 ${IMG.length}`;

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
const padded = () => ({ left: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--led')) || 380, top: 56, bottom: 72, right: 20 });
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

/* 핀 호흡 — 화면당 앰비언트 하나. 가장 오래된 큐 한 줄만 숨 쉰다. */
(function breathe() {
  if (REDUCED()) return;
  const src = PLATE.pins();
  const t0 = performance.now();
  (function loop(t) {
    const ph = ((t - t0) % 6400) / 6400;   // 앰비언트 주기 ≥6s(§5-11)
    const data = src._data;
    for (const f of data.features) f.properties.pulse = f.properties.hot ? ph : 0;
    src.setData(data);
    requestAnimationFrame(loop);
  })(t0);
})();

/* ══ 레지스터 01 · 추론 현황 ═════════════════════════════════════════════ */
const INFER = { tiles: null, runs: [], raf: 0, last: 0, sel: null };

async function buildInfer() {
  if (INFER.tiles) return;
  $('#reg-body').innerHTML = `<p class="fg__h"><b>FIG. 01</b> 실타일 목록 확인 중…</p>`;
  const tiles = await realTiles();
  INFER.tiles = tiles;
  // 실행 3건 — 각자 다른 모델·다른 탐지셋·다른 속도. 진행률은 전부 측정값.
  // 초당 타일 수. 남원 전역 z14 196칸을 1~2분에 훑는 속도 — 진행이 눈으로 읽히게.
  const rates = [3.4, 2.2, 5.1];
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
    showCard({
      kind: '실행 · 모의 실행',
      title: `${r.task} · ${r.region}`,
      rows: [
        ['모델', esc(r.model.file)],
        ['가중치', `${r.model.sizeMB} MB`],
        ['클래스', r.model.classes.map(esc).join(', ')],
        ['영상', esc(r.imagery)],
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

function inferFrame(t) {
  const dt = Math.min(400, t - (INFER.last || t));
  INFER.last = t;
  let any = false;
  for (const r of INFER.runs) {
    if (r.sweep.done) { r.sweep.reset(); any = true; }   // 다음 회차로 넘어간다
    if (r.sweep.advance(dt)) any = true;
  }
  // 지도에는 선택된(또는 첫) 실행의 스윕만 올린다 — 세 겹이 겹치면 아무것도 안 보인다.
  const shown = INFER.runs.find((r) => r.id === INFER.sel) || INFER.runs[0];
  if (shown && any) PLATE.setSweep(shown.sweep.features());
  const det = INFER.runs.reduce((a, r) => a + r.sweep.det, 0);
  if (REG === 'infer' && !setHeadValue(det)) {
    setHead('모의 실행 · 탐지 누적', det, '건',
      `z14 실타일 <span class="num">${INFER.tiles.length}</span>칸 · 모델 <span class="num">${INFER.runs.length}</span>종 동시 · 완료 <span class="num">${DONE.length}</span>건은 실측`);
  }
  for (const r of INFER.runs) {
    const row = document.querySelector(`[data-run="${r.id}"]`);
    if (!row) continue;
    const s = r.sweep;
    row.querySelector('[data-tps]').innerHTML = `${s.tps.toFixed(0)}<em>t/s</em>`;
    row.querySelector('[data-sub]').textContent = `${esc(r.model.file)} · ${nf.format(s.i)}/${nf.format(s.total)} 타일 · 탐지 ${nf.format(s.det)}`;
    row.querySelector('[data-eta]').textContent = s.done ? '완료' : `ETA ${fmtEta(s.eta)}`;
    row.querySelector('.bar i').style.width = `${((s.i / s.total) * 100).toFixed(1)}%`;
  }
  INFER.raf = requestAnimationFrame(inferFrame);
}

async function enterInfer() {
  setHead('모의 실행 · 탐지 누적', 0, '건', '실타일 목록을 확인하는 중…');
  await buildInfer();
  if (REG !== 'infer') return;
  setHead('모의 실행 · 탐지 누적', 0, '건',
    `z14 실타일 <span class="num">${INFER.tiles.length}</span>칸 · 모델 <span class="num">${RUNS.length}</span>종 동시 · 완료 <span class="num">${DONE.length}</span>건은 실측`);
  inferLedger();
  PLATE.show(['aoi-line', 'sweep-fill', 'sweep-line'], true);
  PLATE.setSweep(INFER.runs[0].sweep.features());
  // AOI 전체가 원장 오른쪽에 다 들어오게 — 스윕이 지역을 훑는 것으로 읽혀야 한다.
  map.fitBounds(AOI_BOUNDS, { padding: 36, duration: REDUCED() ? 0 : 1200 });
  cancelAnimationFrame(INFER.raf);
  INFER.last = 0;
  INFER.raf = requestAnimationFrame(inferFrame);
}
function leaveInfer() {
  cancelAnimationFrame(INFER.raf); INFER.raf = 0;
  PLATE.show(['aoi-line', 'sweep-fill', 'sweep-line', 'det-dot'], false);
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

/* ══ 원장 꼬리 — 기존 대시보드 기능(시연) ════════════════════════════════ */
function opsTail() {
  $('#ops-n').textContent = QUEUE.length;
  $('#cov-n').textContent = COVERAGE.length;
  $('#ops-rows').innerHTML = QUEUE.map((q) => `
    <button type="button" class="row${q.i === 0 ? ' is-hot' : ''}" role="listitem" data-q="${q.i}">
      <i class="dot"></i>
      <span class="t">${esc(q.title)}</span>
      <span class="v num">${esc(q.status)}</span>
      <span class="s num">${esc(q.typeName)} · ${esc(q.sub)}</span>
    </button>`).join('');
  $('#ops-rows').querySelectorAll('[data-q]').forEach((b) => {
    const q = QUEUE[+b.dataset.q];
    b.addEventListener('click', () => {
      flyGated({ center: q.lnglat, zoom: 12.6 }, () => showCard({
        kind: '처리 대기 · 시연',
        title: q.title,
        rows: [['유형', esc(q.typeName)], ['상태', esc(q.status)], ['내용', esc(q.sub)],
          ['좌표', q.lnglat.map((n) => n.toFixed(3)).join(', ')]],
        prov: 'assets/data/dashboard.js · 원형 프로토타입 목업(시연)',
      }));
    });
  });

  $('#ops-kpi').innerHTML = `<div class="kpis">${KPI.map((k) => `
    <div class="k"><p class="k__l">${esc(k.label)}</p>
      <p class="k__v num">${nf.format(k.value)}<em>${esc(k.unit)}</em></p>
      <p class="k__s">${esc(k.sub)}</p></div>`).join('')}</div>`;
  drawMinis($('#ops-chart'));

  $('#ops-cov').innerHTML = `<div class="mat"><table>
    <thead><tr><th></th>${COLS.map((c) => `<th><span>${esc(c.short)}</span></th>`).join('')}</tr></thead>
    <tbody>${COVERAGE.map((r) => `<tr class="${r.measured ? 'is-meas' : ''}" data-cov="${r.code}">
      <th>${esc(r.name)}</th>
      ${COLS.map((c) => `<td><i class="c${r.done.includes(c.id) ? ' on' : ''}" style="opacity:${r.done.includes(c.id) ? (0.35 + r.coverage * 0.65).toFixed(2) : 1}"></i></td>`).join('')}
    </tr>`).join('')}</tbody></table>
    <p class="caption" style="margin-top:8px">채워진 칸 <span class="num">${DONE_CELLS}</span>/${CELLS} · 실제 분석 결과가 붙은 시군구는 <span class="num">1</span>곳(남원) — 나머지는 시연값</p></div>`;
  $('#ops-cov').querySelectorAll('[data-cov]').forEach((tr) => {
    tr.addEventListener('mouseenter', () => {
      map.setPaintProperty('sig-cov', 'fill-opacity',
        ['case', ['==', ['get', 'code'], tr.dataset.cov], 0.55,
          ['interpolate', ['linear'], ['get', 'cov'], 0, 0.06, 1, 0.34]]);
      map.setLayoutProperty('sig-cov', 'visibility', 'visible');
    });
  });
  $('#ops-cov').addEventListener('mouseleave', () => {
    map.setPaintProperty('sig-cov', 'fill-opacity', ['interpolate', ['linear'], ['get', 'cov'], 0, 0.06, 1, 0.34]);
    if (REG !== 'results') map.setLayoutProperty('sig-cov', 'visibility', 'none');
  });
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
map.on('mousemove', (ev) => {
  const feats = map.queryRenderedFeatures(ev.point, { layers: ['pin-dot', 'stack-3d', 'grid-fill'].filter((l) => map.getLayer(l)) });
  map.getCanvas().style.cursor = feats.length ? 'pointer' : '';
  if (!feats.length) { hideProbe(); return; }
  const f = feats[0];
  const p = f.properties;
  const html = f.layer.id === 'pin-dot'
    ? `<p class="pt">${esc(p.title)}</p><p class="ps">${esc(p.status)} · 시연</p>`
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
  else showCard({ kind: '처리 대기 · 시연', title: p.title, rows: [['상태', esc(p.status)], ['내용', esc(p.sub)]], prov: 'assets/data/dashboard.js (시연)' });
});
