/* workflow.js — 국토 조사 보드
   구성은 셋이 아니라 하나다. 같은 state.t 와 state.selection 을 세 배율이 공유한다.
     · 진입(3~5초)  파이프라인이 남원 상공 활공 경로를 따라 내려앉는다 (3안 C)
     · 착지         지도가 곧 캔버스. 액자가 실제 지리 앵커 위에 선다 (3안 A)
     · 심층 검토    밝은 면과 어두운 면이 칼로 그은 경계로 만난다 (3안 B의 축약)
*/

import { loadPreset, loadSigungu, PRESETS, EPOCHS, C, imagery, ko } from './wf-data.js';
import { createMap } from './wf-map.js';
import { createGraph, STAGES } from './wf-graph.js';
import { createGlow, createTimeline, createConfLegend, createMinimap, developNumber } from './wf-charts.js';
import { createRunner } from './wf-run.js';
import {
  crop, drawDets, bracketRect, metersPerPx,
  lon2x, lat2y, x2lon, y2lat, tileImage,
} from './wf-thumb.js';

const $ = (s) => document.querySelector(s);
const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SKIP = new URLSearchParams(location.search).has('skip') || REDUCE;

const state = {
  presetId: 'namwon-greenhouse',
  t: 3,                       // 0..3 — 정사영상 시점 축
  thr: 0.5,
  classes: new Set(),
  selection: null,            // { bbox, ids, tiles }
  viewer: 'detect',
  hover: null,
  picked: null,
  entry: true,
};

let data, mapc, graph, glow, timeline, legend, mini, runner;
let renderTimer = 0;

/* ── 부트 ─────────────────────────────────────────────────────────────── */
const bootStep = (n, note) => {
  for (const li of document.querySelectorAll('#boot-steps li')) li.classList.toggle('on', +li.dataset.s <= n);
  if (note) $('#boot-note').textContent = note;
};

async function boot(presetId) {
  document.body.classList.add('is-entry');
  bootStep(1, '실자산 카탈로그 · imagery / models / results / change');
  data = await loadPreset(presetId, (n) => bootStep(2, n));
  state.classes = new Set(data.classes.map((c) => c.cls));
  state.thr = data.preset.conf0;
  bootStep(3, `${data.res.title} · ${fmt(data.count)} ${data.unit}`);

  mapc = await createMap($('#map'), data, {
    onLasso: (bbox) => setSelection(bbox),
    onPick: (id, lngLat) => pickDetection(id, lngLat),
    onMove: (lngLat) => onCursor(lngLat),
    onFilter: () => { glow?.mark(); },
  });

  glow = createGlow({ canvas: $('#glow'), map: mapc.map, data,
    getState: () => ({ thr: state.thr, classes: state.classes, cascade: mapc.state.cascade }) });

  graph = createGraph({
    host: $('#nodes'), edgesCanvas: $('#edges'), mapc, data, safeRight: 360,
    hooks: {
      onPickNode: (id) => setViewer(id),
      onHoverNode: (id) => { state.hover = id; },
      onBand: () => { /* 시맨틱 줌은 CSS 가 처리한다 */ },
      onThumbs: () => {},
    },
  });

  timeline = createTimeline({
    canvas: $('#tl'), host: $('#time'), data,
    onScrub: (t) => setT(t),
    onEpochJump: (i) => flyToAoi(i),
  });

  legend = createConfLegend({
    canvas: $('#conf'), valueEl: $('#thr'), data,
    onChange: (v) => setThreshold(v),
  });

  mini = createMinimap({ canvas: $('#minic'), data,
    getState: () => ({ thr: state.thr, view: viewBounds() }) });
  const region = data.preset.region || '남원시';
  document.querySelector('#mini .label').textContent = `${region} · 처리 현황`;
  loadSigungu(region).then((f) => f && mini.setBoundary(f)).catch(() => {});

  runner = createRunner({ data, mapc, graph, on: {
    tps: (v) => { $('#tps').textContent = v > 0 ? v.toFixed(0) + ' tiles/s' : '캐시 적중'; },
    log: (l) => { $('#runnote').textContent = `${l.stage.toUpperCase()} — ${l.text}${l.ms ? ` · ${l.ms} ms` : ''}`; },
    done: (r) => {
      $('#run').disabled = false;
      $('#run').textContent = '파이프라인 재실행';
      $('#runnote').textContent = r.fresh
        ? `실측 ${r.total} ms · 타일 ${r.tiles}장(신규 ${r.fresh} · 캐시 ${r.cached}) · ${r.tps.toFixed(0)} tiles/s — 로컬 타일 저장소 디코딩 실측`
        : `실측 ${r.total} ms · 타일 ${r.tiles}장 전부 캐시 적중 — 처리량은 측정하지 않았다`;
    },
  } });

  // 기본 선택 = 탐지가 가장 두꺼운 실제 셀 하나.
  const a = data.anchors[0].c;
  state.selection = boxAround(a, 0.0055);

  wire();
  setViewer('detect');
  paintPanel();
  paintClasses();
  $('#attrib').textContent = `정사영상 LX 국토정보공사 · 배경 V-World${mapc.keyed ? '(키)' : '(공개)'} · 탐지 ${data.res.src}`;
  $('#place').textContent = `${data.preset.place} · ${data.img ? '정사영상 ' + data.img.captured : '기준영상 V-World 위성'} · 분석 ${data.analyzedAt}`;
  if (!data.preset.epochs) { $('#play').disabled = true; $('#play').style.opacity = '.3'; }

  await render();
  $('#boot').classList.add('out');
  setTimeout(() => { $('#boot').hidden = true; }, 800);

  await entryFlight();
  window.__wf.ready = true;
}

/* ── 진입 활공 (3안 C) — 컷 없이 한 대의 카메라 ────────────────────────── */
function entryFlight() {
  // 착지점은 설계자가 고른 좌표가 아니라 6개 앵커(=실제 탐지 밀도 상위 셀)의 무게중심이다.
  const ax = data.anchors.reduce((a, x) => a + x.c[0], 0) / data.anchors.length;
  const ay = data.anchors.reduce((a, x) => a + x.c[1], 0) / data.anchors.length;
  const land = { center: [ax, ay], zoom: 14.45, pitch: 45, bearing: 0 };
  const revealAll = () => {
    for (const n of graph.nodes) n.el.classList.add('is-in');
    document.body.classList.remove('is-entry');
    state.entry = false;
  };
  if (SKIP) {
    mapc.map.jumpTo(land);
    revealAll();
    mapc.setCascade(1);
    afterLanding(true);
    return Promise.resolve();
  }
  return new Promise((res) => {
    mapc.map.flyTo({ ...land, duration: 4200, curve: 1.45, essential: true,
      easing: (t) => 1 - (1 - t) ** 4 });
    // 단계가 항로 위 웨이포인트처럼 순서대로 내려앉는다.
    graph.nodes.forEach((n, i) => setTimeout(() => n.el.classList.add('is-in'), 620 + i * 330));
    setTimeout(() => {
      document.body.classList.remove('is-entry');
      state.entry = false;
      afterLanding(false);
      res();
    }, 4300);
  });
}

/* 착지 직후: 탐지가 중심에서 바깥으로 물결친다 + 숫자가 현상된다 (장치 4) */
function afterLanding(instant) {
  if (instant) { paintPanel(); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 900);
    mapc.setCascade(p);
    glow?.mark();
    paintPanel();
    if (p < 1) requestAnimationFrame(step);
  };
  mapc.setCascade(0);
  requestAnimationFrame(step);
}

/* ── 상태 변경 ────────────────────────────────────────────────────────── */
function setThreshold(v, silent) {
  state.thr = v;
  mapc.setThreshold(v);
  glow?.mark();
  mini?.draw();
  if (!silent) legend.set(v);
  $('#conf').setAttribute('aria-valuenow', v.toFixed(2));
  paintPanel();
  paintClasses();
  scheduleRender();
}

function setT(t) {
  state.t = t;
  const near = mapc.setEpoch(t);
  const i = Math.max(0, Math.min(3, Math.round(t)));
  $('#tstamp').textContent = EPOCHS[i].label;
  $('#tnote').textContent = EPOCHS[i].city
    ? '전역 정사영상 있음 · 클릭하면 그 시점으로'
    : '전역 정사영상 결손 — 금지 AOI 도엽에만 존재. 눈금을 누르면 그 도엽으로 간다';
  scheduleRender();
  return near;
}

function setViewer(id) {
  state.viewer = id;
  graph.setViewer(id);
  mapc.setViewer(id);
  const s = STAGES.find((x) => x.id === id);
  const n = graph.node(id);
  $('#eyebrow').textContent = `${s.no} · ${s.kind} · ${n?.art?.textContent || ''}`;
  glow?.mark();
  paintPanel();
}

function boxAround(c, r) {
  return { bbox: [c[0] - r, c[1] - r * 0.78, c[0] + r, c[1] + r * 0.78], ids: [], tiles: [] };
}

function setSelection(bbox) {
  const sel = { bbox, ids: [], tiles: [] };
  state.selection = sel;
  mapc.showSelection(bbox);
  timeline.setSelection(bbox);
  paintStrip();
  paintPanel();
  scheduleRender();
}

function pickDetection(id, lngLat) {
  if (id == null) { state.picked = null; mapc.showBrackets(null); return; }
  const f = data.feats[id] || data.feats.find((x) => x.id === id);
  if (!f) return;
  state.picked = f;
  const b = f.properties.bb;
  mapc.showBrackets(b);
  // 락온 3비트 — 브래킷 수렴 180ms → 확정 80ms → 라벨 120ms
  graph.lockOn(() => {
    const p = mapc.map.project(f.properties.c);
    return [p.x, p.y];
  }, `정합도 ${(f.properties.conf * 100).toFixed(0)}% · ${f.properties.nobj}동`);
  setSelection([b[0] - 0.0016, b[1] - 0.0013, b[2] + 0.0016, b[3] + 0.0013]);
  // 선택은 카메라 이동이다 — 화면 전환이 아니라 같은 지도의 카메라가 간다(규칙 4).
  if (!mapc.map.getBounds().contains({ lng: f.properties.c[0], lat: f.properties.c[1] })) {
    mapc.map.easeTo({ center: f.properties.c, zoom: Math.max(mapc.map.getZoom(), 15.6), duration: 1000, essential: true });
  }
  if ($('#inspect').classList.contains('is-in')) paintInspect();
}

/* ── 렌더 (액자) ──────────────────────────────────────────────────────── */
function epochFor(t) {
  const i = Math.max(0, Math.min(3, Math.round(t)));
  const e = EPOCHS[i];
  const cityId = e.city || (t < 1.5 ? 'namwon_city_2504' : 'namwon_city_2510');
  return { i, label: e.label, exact: !!e.city, cityImg: data.img ? imagery(cityId) : null };
}

function selCenter() {
  const b = state.selection.bbox;
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function nearFeats(center, r = 0.006) {
  const out = [];
  for (const f of data.feats) {
    const c = f.properties.c;
    if (Math.abs(c[0] - center[0]) < r && Math.abs(c[1] - center[1]) < r) out.push(f);
  }
  return out;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 90);
}

async function render() {
  const center = selCenter();
  await graph.renderAll({
    center,
    feats: nearFeats(center),
    thr: state.thr,
    classes: state.classes,
    epoch: epochFor(state.t),
    counts: mapc.counts(),
    satUrl: mapc.satUrl,
  });
  const n = graph.node(state.viewer);
  const s = STAGES.find((x) => x.id === state.viewer);
  $('#eyebrow').textContent = `${s.no} · ${s.kind} · ${n?.art?.textContent || ''}`;
  paintStrip();
}

/* ── 우측 조판 ────────────────────────────────────────────────────────── */
function paintPanel() {
  const c = mapc.counts();
  developNumber($('#stat'), c.obj, data.unit === '필지' ? '동' : '건');
  const objUnit = data.unit === '필지' ? '동' : '건';
  $('#statsub').innerHTML =
    `${fmt(c.shown)} / ${fmt(c.total)} ${data.unit} 통과 · 원본 ${fmt(data.objTotal)}${objUnit}<br>` +
    `${data.res.title} · ${data.areaHa.toLocaleString()} ha · ${data.analyzedAt} 분석`;
  $('#confnote').textContent =
    `원본 신뢰도 평균 ${data.confMean} · 임계 미만 ${fmt(c.total - c.shown)}${data.unit}는 지우지 않고 감쇠한다`;
  $('#clsnote').textContent = `${data.classes.length}종 · 클릭하면 감쇠`;
  updateScaleBar();
  mini?.draw();
}

function paintClasses() {
  const c = mapc.counts();
  const host = $('#cls');
  host.innerHTML = '';
  const max = Math.max(...data.classes.map((x) => (c.per.get(x.cls)?.obj || 0)), 1);
  for (const cl of data.classes) {
    const e = c.per.get(cl.cls) || { on: 0, all: 0, obj: 0 };
    const li = document.createElement('li');
    li.className = state.classes.has(cl.cls) ? '' : 'off';
    li.innerHTML = `<span class="k">${cl.ko}</span><span class="v">${fmt(e.obj)}</span>
      <span class="bar"><i style="width:${(e.obj / max) * 100}%;background:${cl.color}"></i></span>`;
    li.title = `${cl.ko} — ${fmt(e.on)} / ${fmt(e.all)} ${data.unit}`;
    li.addEventListener('click', () => {
      if (state.classes.has(cl.cls)) state.classes.delete(cl.cls); else state.classes.add(cl.cls);
      if (!state.classes.size) state.classes.add(cl.cls);
      mapc.setClasses([...state.classes]);
      glow?.mark();
      paintPanel(); paintClasses(); scheduleRender();
    });
    host.appendChild(li);
  }
}

/* ── 타일 스트립 — 선택 영역의 실제 타일 (삼면 결속의 두 번째 면) ───────── */
async function paintStrip() {
  const host = $('#stripl');
  const b = state.selection?.bbox;
  if (!b) { host.innerHTML = '<p class="empty">선택 없음</p>'; return; }
  const z = data.img ? Math.min(data.img.maxzoom, 17) : 17;
  const x0 = Math.floor(lon2x(b[0], z)), x1 = Math.floor(lon2x(b[2], z));
  const y0 = Math.floor(lat2y(b[3], z)), y1 = Math.floor(lat2y(b[1], z));
  const tiles = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([z, x, y]);
  state.selection.tiles = tiles;
  const shown = tiles.slice(0, 6);
  $('#striph').textContent = `${shown.length}/${tiles.length}장 · z${z} · ${data.img ? data.img.id : 'V-World'}`;

  host.innerHTML = '';
  for (const [tz, tx, ty] of shown) {
    const el = document.createElement('div');
    el.className = 't';
    el.innerHTML = `<canvas width="152" height="152"></canvas><span>${tx}/${ty}</span>`;
    const box = { west: x2lon(tx, tz), north: y2lat(ty, tz), east: x2lon(tx + 1, tz), south: y2lat(ty + 1, tz) };
    el.addEventListener('pointerenter', () => { mapc.showBrackets([box.west, box.south, box.east, box.north]); el.classList.add('on'); });
    el.addEventListener('pointerleave', () => { mapc.showBrackets(state.picked ? state.picked.properties.bb : null); el.classList.remove('on'); });
    el.addEventListener('click', () => mapc.map.flyTo({
      center: [(box.west + box.east) / 2, (box.north + box.south) / 2], zoom: 16.6, duration: 1000, essential: true }));
    host.appendChild(el);
    const cv = el.querySelector('canvas');
    const cx = cv.getContext('2d');
    cx.__s = 2; cx.scale(2, 2);
    const src = data.img
      ? '../' + data.img.tiles.replace('{z}', tz).replace('{x}', tx).replace('{y}', ty)
      : mapc.satUrl.replace('{z}', tz).replace('{x}', tx).replace('{y}', ty);
    tileImage(src).then((im) => {
      cx.fillStyle = '#08090B'; cx.fillRect(0, 0, 76, 76);
      if (im) { cx.save(); cx.filter = 'saturate(.28) contrast(1.1) brightness(.92)'; cx.drawImage(im, 0, 0, 76, 76); cx.restore(); }
      drawDets(cx, box, nearFeats([(box.west + box.east) / 2, (box.north + box.south) / 2], 0.004),
        { test: (p) => p.conf >= state.thr && state.classes.has(p.cls), fill: 0.26, lw: 1 });
    });
  }
}

/* ── 심층 검토 — 하드 명암 경계 ───────────────────────────────────────── */
function toggleInspect(on) {
  const el = $('#inspect');
  const want = on ?? !el.classList.contains('is-in');
  el.hidden = false;
  el.classList.toggle('is-in', want);
  if (want) paintInspect();
}

async function paintInspect() {
  const f = state.picked;
  const b = state.selection?.bbox;
  const c = mapc.counts();
  const near = nearFeats(selCenter(), 0.005)
    .filter((x) => state.classes.has(x.properties.cls))
    .sort((a, z) => z.properties.conf - a.properties.conf);

  $('#ins-n').textContent = fmt(f ? f.properties.nobj : near.reduce((a, x) => a + x.properties.nobj, 0));
  $('#ins-sub').textContent = f
    ? `${ko(f.properties.cls)} · ${f.properties.emd || '—'} · PNU ${f.properties.pnu || '—'}`
    : `선택 영역 ${near.length} ${data.unit} · 전체 ${fmt(c.total)} 중`;

  const cv = $('#ins-c');
  const cx = cv.getContext('2d');
  cx.__s = 1;
  cx.setTransform(1, 0, 0, 1, 0, 0);
  const center = f ? f.properties.c : selCenter();
  const e = epochFor(state.t);
  const box = await crop(cx, e.cityImg, mapc.satUrl, center, 17, { filter: 'saturate(.34) contrast(1.12)' });
  drawDets(cx, box, nearFeats(center, 0.005),
    { test: (p) => p.conf >= state.thr && state.classes.has(p.cls), fill: 0.24, lw: 1.6 });
  if (f) {
    const px = (l) => ((l - box.west) / (box.east - box.west)) * cv.width;
    const py = (l) => ((l - box.north) / (box.south - box.north)) * cv.height;
    const bb = f.properties.bb;
    bracketRect(cx, px(bb[0]) - 6, py(bb[3]) - 6, px(bb[2]) - px(bb[0]) + 12, py(bb[1]) - py(bb[3]) + 12, C.amber, 14, 1.6);
  }
  $('#ins-cap').textContent =
    `${f?.properties.emd ? '전북 남원시 ' + f.properties.emd : data.preset.place} · ${box.src} · ${box.mpp.toFixed(2)} m/px · ${e.label}`;

  const meta = $('#ins-meta');
  meta.innerHTML = '';
  const rows = f
    ? [['신뢰도', f.properties.conf.toFixed(3)], ['면적', `${fmt(f.properties.area)} ㎡`],
       ['동수', `${f.properties.nobj}동`], ['읍면동', f.properties.emd || '—'],
       ['SAM', '—'], ['원본', data.res.src]]
    : [['선택 범위', b ? `${b[0].toFixed(4)}, ${b[1].toFixed(4)} → ${b[2].toFixed(4)}, ${b[3].toFixed(4)}` : '—'],
       ['통과', `${fmt(c.shown)} / ${fmt(c.total)}`], ['임계', state.thr.toFixed(2)],
       ['원본', data.res.src]];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    meta.append(dt, dd);
  }

  const list = $('#ins-rows');
  list.innerHTML = '';
  for (const x of near.slice(0, 14)) {
    const r = document.createElement('div');
    r.className = 'r';
    r.innerHTML = `<span>${ko(x.properties.cls)} · ${x.properties.emd || '—'}</span>
                   <span>${x.properties.conf.toFixed(3)} · ${x.properties.nobj}동</span>`;
    r.addEventListener('pointerenter', () => mapc.showBrackets(x.properties.bb));
    r.addEventListener('click', () => pickDetection(x.id));
    list.appendChild(r);
  }
}

/* ── 커서 좌표 · 사람 척도 스케일바 ───────────────────────────────────── */
let cursorRaf = 0;
function onCursor(lngLat) {
  if (cursorRaf) return;
  cursorRaf = requestAnimationFrame(() => {
    cursorRaf = 0;
    $('#xy').textContent =
      `${lngLat.lng.toFixed(5)}° E   ${lngLat.lat.toFixed(5)}° N   z${mapc.map.getZoom().toFixed(2)}`;
  });
}

/* 사람 척도 스케일바 — 막대 길이는 반드시 실제 길이여야 한다(장치 8).
   그래서 "화면에 들어오는 가장 큰 눈금"을 고르고, 그 눈금에 붙은 참조물을 함께 쓴다. */
const SCALE_STEPS = [
  [4.5, '승용차 1대'], [10, null], [25, null], [54, '비닐하우스 1동'], [105, '축구장'],
  [250, null], [500, null], [1000, null], [2000, null], [5000, null], [10000, null], [20000, null],
];
function updateScaleBar() {
  if (!mapc) return;
  const mpp = metersPerPx(mapc.map.getCenter().lat, mapc.map.getZoom());
  let best = SCALE_STEPS[0];
  for (const st of SCALE_STEPS) if (st[0] / mpp <= 185) best = st;
  const w = Math.max(28, best[0] / mpp);
  const len = best[0] >= 1000 ? `${best[0] / 1000} km` : `${best[0]} m`;
  $('#scale-bar').style.width = w.toFixed(0) + 'px';
  $('#scale-t').textContent = `${len}${best[1] ? ' · ' + best[1] : ''} · ${mpp.toFixed(2)} m/px`;
}

function viewBounds() {
  const b = mapc.map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

function flyToAoi(i) {
  const im = imagery(EPOCHS[i].aoi);
  if (!im) return;
  mapc.map.flyTo({ center: [(im.bounds[0] + im.bounds[2]) / 2, (im.bounds[1] + im.bounds[3]) / 2],
    zoom: 16.4, pitch: 40, duration: 2000, essential: true });
  setSelection([im.bounds[0], im.bounds[1], im.bounds[2], im.bounds[3]]);
}

/* ── 배선 ─────────────────────────────────────────────────────────────── */
function wire() {
  $('#play').addEventListener('click', () => {
    if (!data.preset.epochs) return;
    const on = !timeline.playing;
    timeline.play(on);
    $('#play').textContent = on ? '❚❚' : '▶';
  });
  $('#run').addEventListener('click', () => {
    $('#run').disabled = true;
    $('#run').textContent = '실행 중';
    runner.run(state.selection);
  });
  $('#ins-x').addEventListener('click', () => toggleInspect(false));
  for (const b of document.querySelectorAll('#presets button')) {
    b.addEventListener('click', async () => {
      if (b.dataset.preset === state.presetId) return;
      for (const o of document.querySelectorAll('#presets button')) o.setAttribute('aria-selected', String(o === b));
      state.presetId = b.dataset.preset;
      location.search = '?preset=' + state.presetId + (SKIP ? '&skip=1' : '');
    });
  }
  mapc.map.on('zoom', () => { updateScaleBar(); glow?.mark(); });
  mapc.map.on('moveend', () => { mini?.draw(); });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if (e.key === 'i' || e.key === 'I') { toggleInspect(); e.preventDefault(); }
    else if (e.key === 'Escape') { toggleInspect(false); state.picked = null; mapc.showBrackets(null); }
    else if (e.key === ' ') { $('#play').click(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && e.shiftKey) { timeline.t = state.t - 0.25; setT(timeline.t); }
    else if (e.key === 'ArrowRight' && e.shiftKey) { timeline.t = state.t + 0.25; setT(timeline.t); }
    else if (e.key === '[') setThreshold(Math.max(0.01, state.thr - 0.05));
    else if (e.key === ']') setThreshold(Math.min(1, state.thr + 0.05));
  });
  // 진입 활공 중 아무 조작이나 하면 즉시 착지한다 — 조작 불가능한 연출은 목업이다.
  const skip = () => {
    if (!state.entry) return;
    state.entry = false;
    mapc.map.stop();
    document.body.classList.remove('is-entry');
    for (const n of graph.nodes) n.el.classList.add('is-in');
    mapc.setCascade(1);
    paintPanel();
  };
  $('#stage').addEventListener('pointerdown', skip);
  window.addEventListener('wheel', skip, { passive: true });
}

/* ── 테스트·디버그 API ────────────────────────────────────────────────── */
window.__wf = {
  ready: false,
  get state() {
    return { thr: state.thr, t: state.t, viewer: state.viewer,
             classes: [...state.classes], selection: state.selection?.bbox || null, entry: state.entry };
  },
  counts: () => mapc.counts(),
  graph: () => ({ nodes: graph.nodes.length, edges: graph.nodes.length - 1, band: graph.band }),
  thumbs: () => graph.thumbs(),
  setThreshold: (v) => setThreshold(v),
  setT: (v) => { timeline.t = v; setT(v); },
  setViewer: (id) => setViewer(id),
  select: (bbox) => setSelection(bbox),
  pick: (id) => pickDetection(id),
  inspect: (on) => toggleInspect(on),
  land: () => { mapc.map.stop(); document.body.classList.remove('is-entry'); state.entry = false;
                for (const n of graph.nodes) n.el.classList.add('is-in'); mapc.setCascade(1); paintPanel(); },
  run: () => runner.run(state.selection),
  data: () => data,
};

const q = new URLSearchParams(location.search);
if (q.get('preset') && PRESETS.some((p) => p.id === q.get('preset'))) state.presetId = q.get('preset');
for (const b of document.querySelectorAll('#presets button')) {
  b.setAttribute('aria-selected', String(b.dataset.preset === state.presetId));
}
boot(state.presetId).catch((e) => {
  console.error(e);
  $('#boot-note').textContent = '로드 실패: ' + e.message;
});
