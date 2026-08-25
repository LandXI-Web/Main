// 워크플로우 캔버스 + 라이브 분석 — 세 구역(캔버스 · 지도 · 지표)이 하나의 시스템이다.
// 연결 고리 하나만 기억하면 된다: **후처리 블록의 신뢰도 임계 = 지도 슬라이더 = 히스토그램 커서.**
// 어디를 만져도 같은 값이 움직이고, 세 곳이 같은 프레임에 다시 그려진다.

import { IMAGERY } from '../assets/data/imagery.js';
import { MODELS } from '../assets/data/models.js';
import { loadDetections, loadGrid, loadSample, exampleCurve, classColor, ko, SAMPLES } from './wf-data.js';
import { createGraph, BLOCKS } from './wf-graph.js';
import { createMap } from './wf-map.js';
import { createRunner } from './wf-run.js';
import { mosaic, satCrop, drawDets, drawSlices, drawModelCard, drawGridMini, label } from './wf-thumb.js';
import * as CH from './wf-charts.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => n.toLocaleString('ko-KR');

/* ── 부팅 ────────────────────────────────────────────────────────────── */
const boot = $('#boot'), bootBar = $('#boot-bar i'), bootNote = $('#boot-note');
let bootP = 0;
const step = (t, p) => { bootNote.textContent = t; bootP = p; bootBar.style.width = p + '%'; };

let DATA, GRID, MAPI, GRAPH, RUN;
const S = { thr: 0.5, classes: new Set(), rep: 'poly', view: 'det' };

init().catch((e) => { console.error(e); bootNote.textContent = '로드 실패: ' + e.message; });

async function init() {
  step('실검출 카탈로그 로드', 12);
  DATA = await loadDetections((t) => step(t, Math.min(58, bootP + 14)));
  step('격자 집계 로드', 64);
  GRID = await loadGrid();
  S.thr = 0.5;
  S.classes = new Set(DATA.classes.map((c) => c.cls));

  step('지도 타일 소스 확인', 76);
  MAPI = await createMap($('#map'), DATA, {
    onHover: showTip, onHoverMove: moveTip, onPick: pickDet,
  });
  const srcList = DATA.sources.map((s) => `${s.src} (${fmt(s.n)})`).join(String.fromCharCode(10));
  $('#attrib').textContent = `배경 V-World ${MAPI.keyed ? 'WMTS' : 'xdworld'} · 검출 ${DATA.sources.length}종`;
  $('#attrib').title = srcList;
  $('#ctl-src').textContent = `${fmt(DATA.feats.length)}건 · ${DATA.sources.length}개 산출물`;
  $('#ctl-src').title = srcList;

  step('캔버스 구성', 88);
  buildGraph();
  buildFilterUI();
  buildTabs();
  applyAll('init');

  await new Promise((r) => MAPI.map.once('load', r));
  MAPI.apply({ thr: S.thr, classes: S.classes, rep: S.rep });
  // 실제 검출 bbox 로 맞추되, 좌측 유리 패널이 덮는 폭만큼 패딩을 준다.
  const bb = DATA.bbox;
  MAPI.map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]],
    { padding: { top: 78, left: 232, right: 16, bottom: 88 }, duration: 0 });

  step('준비 완료', 100);
  setTimeout(() => { boot.classList.add('gone'); GRAPH.fit(); redrawCharts(); }, 260);

  // 첫 인상은 정적 스크린샷이 아니라 "이미 한 번 돈 파이프라인"이어야 한다.
  setTimeout(() => doRun({ auto: true }), 520);
}

/* ── 그래프 ──────────────────────────────────────────────────────────── */
function defaults(type) {
  return ({
    input: { imagery: 'namwon_2508' },
    slice: { slice: 640, overlap: 0.2 },
    model: { model: 'best-vinylhouse' },
    post: { conf: 0.5, nms: 0.5, minArea: 10 },
  })[type] || {};
}

function buildGraph() {
  GRAPH = createGraph($('#canvas'), {
    defaults, paintBody, onSelect: onSelect, onChange: onGraphChange,
    onToast: toast,
  });
  const n1 = GRAPH.addNode('input', 40, 200);
  const n2 = GRAPH.addNode('slice', 308, 200);
  const n3 = GRAPH.addNode('model', 308, 400);
  const n4 = GRAPH.addNode('detect', 576, 280);
  const n5 = GRAPH.addNode('post', 844, 280);
  const n6 = GRAPH.addNode('mapout', 1112, 280);
  GRAPH.connect(n1.id, 'image', n2.id, 'image');
  GRAPH.connect(n2.id, 'tiles', n4.id, 'tiles');
  GRAPH.connect(n3.id, 'model', n4.id, 'model');
  GRAPH.connect(n4.id, 'det', n5.id, 'det');
  GRAPH.connect(n5.id, 'det', n6.id, 'det');
  GRAPH.layout(false);
  GRAPH.fit();

  RUN = createRunner({
    graph: GRAPH, IMAGERY, MODELS, grid: GRID,
    getCanvas: (id) => $(`.node[data-id="${id}"] canvas`),
    onNode: (n) => { GRAPH.render(); if (GRAPH.selected?.id === n.id) fillInspector(n); },
    onStep: onRunStep, toast,
    mapState: () => ({ thr: S.thr }),
    counts: () => MAPI.counts(),
    feats: () => DATA.feats,
    bbox: () => DATA.bbox,
    passes: (p) => p.conf >= S.thr && S.classes.has(p.cls),
    sink: () => $('#sink').checked,
  });
}

function onGraphChange() { redrawCharts(); }

/* ── 노드 본문 (파라미터 UI) ─────────────────────────────────────────── */
function paintBody(el, n, canvas, nodeEl) {
  const thumb = nodeEl.querySelector('.thumb');
  const empty = thumb.querySelector('.empty');
  const cap = thumb.querySelector('.cap');
  const has = n.state === 'done' || n.state === 'cache';
  empty.hidden = has;
  if (!has) empty.textContent = n.state === 'run' ? '계산 중…' : n.spec.desc;
  cap.textContent = has && n.t ? `${Math.round(n.t)} ms` : '';

  if (el.dataset.t !== n.type) { el.dataset.t = n.type; el.innerHTML = ctrlHTML(n); bindCtrls(el, n); }
  syncCtrls(el, n);

  const dl = el.querySelector('dl');
  if (dl) {
    const meta = n.out?.meta || {};
    const keys = Object.keys(meta).slice(0, 5);
    dl.innerHTML = keys.length
      ? keys.map((k) => `<dt>${k.replace(/_/g, ' ')}</dt><dd>${meta[k]}</dd>`).join('')
      : '<dt>상태</dt><dd>미실행</dd>';
  }
}

function ctrlHTML(n) {
  const p = n.params;
  switch (n.type) {
    case 'input': return `
      <div class="ctlrow"><label>도엽</label>
        <select data-p="imagery">${IMAGERY.map((i) => `<option value="${i.id}">${i.label}</option>`).join('')}</select></div>
      <dl></dl>`;
    case 'slice': return `
      <div class="ctlrow"><label>슬라이스</label>
        <input type="range" data-p="slice" min="320" max="1280" step="64"><span class="val" data-v="slice"></span></div>
      <div class="ctlrow"><label>중첩</label>
        <input type="range" data-p="overlap" min="0" max="0.4" step="0.05"><span class="val" data-v="overlap"></span></div>
      <dl></dl>`;
    case 'model': return `
      <div class="ctlrow"><label>가중치</label>
        <select data-p="model">${MODELS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select></div>
      <div class="sw"></div><p class="warnline" hidden></p><dl></dl>`;
    case 'post': return `
      <div class="ctlrow"><label>신뢰도</label>
        <input type="range" data-p="conf" min="0.05" max="1" step="0.01"><span class="val" data-v="conf"></span></div>
      <div class="ctlrow"><label>NMS IoU</label>
        <input type="range" data-p="nms" min="0.1" max="0.9" step="0.05"><span class="val" data-v="nms"></span></div>
      <div class="ctlrow"><label>최소면적</label>
        <input type="range" data-p="minArea" min="0" max="200" step="5"><span class="val" data-v="minArea"></span></div>
      <dl></dl>`;
    default: return '<dl></dl>';
  }
}

function bindCtrls(el, n) {
  for (const c of $$('[data-p]', el)) {
    c.addEventListener('input', () => {
      const k = c.dataset.p;
      n.params[k] = c.type === 'range' ? +c.value : c.value;
      syncCtrls(el, n);
      // 임계값은 지도·차트와 공유되는 하나의 값이다.
      if (n.type === 'post' && k === 'conf') setThreshold(+c.value, 'node');
      GRAPH.dirty(n.id);
      scheduleRerun(n);
    });
    c.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}

function syncCtrls(el, n) {
  for (const c of $$('[data-p]', el)) {
    const v = n.params[c.dataset.p];
    if (c.value != v) c.value = v;
  }
  const V = { slice: (v) => v + 'px', overlap: (v) => Math.round(v * 100) + '%',
              conf: (v) => (+v).toFixed(2), nms: (v) => (+v).toFixed(2), minArea: (v) => v + '㎡' };
  for (const s of $$('[data-v]', el)) s.textContent = (V[s.dataset.v] || String)(n.params[s.dataset.v]);
  if (n.type === 'model') {
    const m = MODELS.find((x) => x.id === n.params.model) || MODELS[0];
    const sw = el.querySelector('.sw');
    if (sw) sw.innerHTML = m.classes.slice(0, 12).map((c) => `<i style="background:${classColor(c)}" title="${c}"></i>`).join('');
    const w = el.querySelector('.warnline');
    if (w) { w.hidden = !m.inferred; w.textContent = m.inferred ? '⚠ data yaml 없음 — 클래스 추정값' : ''; }
  }
  if (n.type === 'input') {
    const has = !!SAMPLES[n.params.imagery];
    const dl = el.querySelector('dl');
    if (dl && !n.out) dl.innerHTML = `<dt>산출물</dt><dd>${has ? '있음' : '없음'}</dd>`;
  }
}

// 파라미터를 만지면 그 블록부터 아래로만 다시 돈다 — 상류는 캐시됨 배지를 유지한다.
let rerunT = 0;
function scheduleRerun() {
  clearTimeout(rerunT);
  rerunT = setTimeout(() => doRun({ quiet: true }), 220);
}

/* ── 실행 ────────────────────────────────────────────────────────────── */
async function doRun({ stepwise = false, quiet = false, auto = false } = {}) {
  if (RUN.busy) return;
  const btn = $('#run');
  btn.disabled = true;
  $('#run-stat').textContent = quiet ? '변경된 블록만 재계산 중…' : '실행 중 — 블록이 실제 타일을 읽는다';
  const r = await RUN.run({ useCache: $('#use-cache').checked, stepwise });
  btn.disabled = false;
  if (!r) return;
  const cached = r.steps.filter((s) => s.cached).length;
  $('#run-stat').innerHTML =
    `총 <b>${r.total.toFixed(0)} ms</b> · 블록 ${r.steps.length} · 캐시 ${cached} · ${new Date().toLocaleTimeString('ko-KR')}`;
  $('#run-prog i').style.width = '100%';
  setTimeout(() => ($('#run-prog i').style.width = '0'), 700);
  drawLatency();
  if (!quiet && !auto) toast(`실행 완료 — ${r.total.toFixed(0)} ms`);
}

function onRunStep(steps, n) {
  const done = steps.length, all = GRAPH.G.nodes.length;
  $('#run-prog i').style.width = `${(done / all) * 100}%`;
  $('#run-stat').textContent = `${n.spec.name} — ${n.state === 'cache' ? '캐시됨' : Math.round(n.t || 0) + ' ms'}`;
  GRAPH.drawMini();
}

function drawLatency() {
  if (!RUN) return;
  const steps = RUN.lastSteps;
  CH.drawLatency($('#c-lat'), RUN.runs, steps);
  const t = steps.reduce((s, x) => s + x.ms, 0);
  const slow = steps.filter((s) => !s.cached).sort((a, b) => b.ms - a.ms)[0];
  $('#lat-read').textContent = steps.length
    ? `총 ${t.toFixed(0)} ms · 최장 ${slow ? slow.name + ' ' + slow.ms.toFixed(0) + 'ms' : '—'} · ${steps.filter((s) => s.cached).length}개 캐시 적중`
    : '—';
}

/* ── 인스펙터 ────────────────────────────────────────────────────────── */
const insp = $('#insp');
let inspNode = null;
function onSelect(n, open) {
  inspNode = n;
  if (!n) { if (open !== true) insp.hidden = true; return; }
  if (open) insp.hidden = false;
  if (!insp.hidden) fillInspector(n);
}
$('#insp-x').addEventListener('click', () => { insp.hidden = true; });
$$('#insp-tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('#insp-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('.tabp', insp).forEach((p) => (p.hidden = p.dataset.tab !== b.dataset.tab));
}));

async function fillInspector(n) {
  $('#insp-kind').textContent = n.spec.kind;
  $('#insp-title').textContent = n.spec.name;
  const meta = n.out?.meta || {};
  $('#insp-meta').innerHTML = Object.entries(meta).map(([k, v]) => `<dt>${k.replace(/_/g, ' ')}</dt><dd>${v}</dd>`).join('')
    || '<dt>상태</dt><dd>미실행 — 실행하면 채워진다</dd>';
  $('#insp-json').textContent = JSON.stringify({
    id: n.id, type: n.type, kind: n.spec.kind, state: n.state,
    params: n.params, ms: n.t ? +n.t.toFixed(1) : null,
    cacheKey: RUN ? RUN.keyOf(n).slice(0, 96) + '…' : null,
    inputs: GRAPH.G.edges.filter((e) => e.t === n.id).map((e) => `${e.f}.${e.fp} → ${e.tp}`),
    output: meta,
  }, null, 2);
  $('#insp-log').textContent = n.log.length ? n.log.map((l, i) => `${String(i + 1).padStart(2, '0')}  ${l}`).join('\n')
                                            : '로그 없음 — 아직 실행되지 않았다';
  // 추론 체인 — 순차 스트리밍(각 줄이 0.06s 간격으로 들어온다)
  const chain = $('#insp-chain');
  chain.innerHTML = n.log.map((l, i) =>
    `<div class="chain-i" style="animation-delay:${i * 0.06}s"><i></i><b>${l}</b></div>`).join('');
  // 큰 썸네일 재렌더 — 노드의 336px 캔버스를 확대하는 게 아니라 768px 로 다시 그린다.
  const c = $('#insp-canvas'), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  $('#insp-cap').textContent = n.out ? (n.spec.name + ' · ' + (n.t ? Math.round(n.t) + ' ms' : '')) : '미실행';
  await renderBig(n, g);
}

async function renderBig(n, g) {
  const o = n.out; if (!o) { g.fillStyle = '#1C2127'; g.fillRect(0, 0, g.canvas.width, g.canvas.height); return; }
  if (n.type === 'model') { drawModelCard(g, o.model, o.curve); return; }
  if (n.type === 'mapout' || n.type === 'gridag') {
    drawGridMini(g, DATA.feats, DATA.bbox, (p) => p.conf >= S.thr && S.classes.has(p.cls)); return; }
  if (!o.imagery) { g.fillStyle = '#1C2127'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
                    label(g, n.spec.name); return; }
  const box = await mosaic(g, o.imagery, { span: 3 });
  if (n.type === 'slice') drawSlices(g, box, { slice: n.params.slice, overlap: n.params.overlap, gsd: o.imagery.gsd });
  else if (o.all) drawDets(g, box, o.all, { test: o.test, labels: 10, scale: 2 });
  else if (o.feats) drawDets(g, box, o.feats, { labels: 10, scale: 2 });
  $('#insp-cap').textContent =
    `${o.imagery.id} · z${box.zoom} · ${o.spec ? o.spec.label : n.spec.name}${n.t ? ' · ' + Math.round(n.t) + ' ms' : ''}`;
}

/* ── 지도 필터 UI ───────────────────────────────────────────────────── */
function buildFilterUI() {
  const lo = DATA.conf.lo;
  const slider = $('#conf');
  slider.min = lo; slider.value = S.thr;
  $('#conf-lo').textContent = lo.toFixed(2);

  slider.addEventListener('input', () => setThreshold(+slider.value, 'map'));

  $('#cls-list').innerHTML = DATA.classes.map((c) => `
    <li><button type="button" aria-pressed="true" data-cls="${c.cls}">
      <i class="box" style="background:${c.color}"></i>
      <span class="nm">${ko(c.cls)}</span><span class="n" data-n="${c.cls}">${fmt(c.n)}</span>
    </button></li>`).join('');
  $$('#cls-list button').forEach((b) => b.addEventListener('click', () => toggleClass(b.dataset.cls)));
  $('#cls-all').addEventListener('click', () => {
    const all = S.classes.size === DATA.classes.length;
    S.classes = new Set(all ? [DATA.classes[0].cls] : DATA.classes.map((c) => c.cls));
    applyAll('classes');
  });

  $$('#rep button').forEach((b) => b.addEventListener('click', () => {
    $$('#rep button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    S.rep = b.dataset.rep; applyAll('rep');
  }));
  $('#lbl-toggle').addEventListener('change', (e) => MAPI.setLabels(e.target.checked));

  // 차트가 곧 필터다.
  $('#c-hist').addEventListener('click', (e) => {
    const v = CH.histValueAt($('#c-hist'), e.clientX);
    if (v != null) setThreshold(v, 'chart');
  });
  $('#c-cls').addEventListener('click', (e) => {
    const cls = CH.classAt($('#c-cls'), e.clientY);
    if (cls) toggleClass(cls);
  });
}

function toggleClass(cls) {
  S.classes.has(cls) ? S.classes.delete(cls) : S.classes.add(cls);
  if (!S.classes.size) S.classes.add(cls);
  applyAll('classes');
}

function setThreshold(v, from) {
  S.thr = v;
  if (from !== 'map') $('#conf').value = v;
  // 후처리 블록의 파라미터도 같은 값이다 — 화면 세 곳이 하나의 상태를 본다.
  const post = GRAPH.G.nodes.find((n) => n.type === 'post');
  if (post && from !== 'node') {
    post.params.conf = v;
    GRAPH.render();
    clearTimeout(rerunT); rerunT = setTimeout(() => { GRAPH.dirty(post.id); doRun({ quiet: true }); }, 320);
  }
  applyAll('thr');
}

// 한 번의 호출로 지도·요약·칩·차트가 같은 프레임에 갱신된다.
function applyAll(reason) {
  if (MAPI) MAPI.apply({ thr: S.thr, classes: S.classes, rep: S.rep });
  $('#conf-val').textContent = S.thr.toFixed(2);
  const c = MAPI ? MAPI.counts() : { shown: 0, total: DATA.feats.length, area: 0, mean: 0, per: new Map() };
  $('#conf-count').textContent = `${fmt(c.shown)} / ${fmt(c.total)}`;
  $('#sum-shown').textContent = fmt(c.shown);
  $('#sum-total').textContent = fmt(c.total);
  $('#sum-area').textContent = (c.area / 10000).toFixed(2) + ' ha';
  $('#sum-conf').textContent = c.mean.toFixed(3);
  for (const cl of DATA.classes) {
    const el = $(`[data-n="${cl.cls}"]`);
    if (el) el.textContent = fmt(c.per.get(cl.cls)?.on ?? 0);
    const b = $(`#cls-list [data-cls="${cl.cls}"]`);
    if (b) b.setAttribute('aria-pressed', String(S.classes.has(cl.cls)));
  }
  drawChips();
  redrawCharts();
}

function drawChips() {
  const off = DATA.classes.filter((c) => !S.classes.has(c.cls));
  const chips = [];
  if (S.thr > DATA.conf.lo + 0.001) chips.push({ k: 'thr', t: `신뢰도 ≥ ${S.thr.toFixed(2)}` });
  for (const c of off) chips.push({ k: 'cls:' + c.cls, t: `− ${ko(c.cls)}` });
  $('#chips').innerHTML = chips.length
    ? chips.map((c) => `<li>${c.t}<button type="button" data-k="${c.k}" aria-label="필터 제거">×</button></li>`).join('')
    : '<li style="background:transparent;border-color:transparent;color:var(--ink-3)">없음 — 전체 표시</li>';
  $$('#chips button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'thr') setThreshold(DATA.conf.lo, 'chip');
    else { S.classes.add(k.slice(4)); applyAll('chip'); }
  }));
}

function redrawCharts() {
  const lo = DATA.conf.lo, hi = 1;
  const bins = CH.histBins(DATA.feats, S.classes, lo, hi, 24);
  CH.drawHist($('#c-hist'), bins, S.thr, lo, hi, { note: '신뢰도' });
  CH.drawSpark($('#conf-spark'), bins, S.thr, lo, hi);
  const c = MAPI ? MAPI.counts() : { per: new Map() };
  CH.drawClassBars($('#c-cls'), DATA.classes.map((x) => ({
    cls: x.cls, n: c.per.get(x.cls)?.on ?? 0, all: x.n, on: S.classes.has(x.cls),
  })));
  const mn = GRAPH?.G.nodes.find((n) => n.type === 'model');
  const m = MODELS.find((x) => x.id === mn?.params.model) || MODELS[0];
  CH.drawCurve($('#c-curve'), exampleCurve(m.id), `${m.name} · 예시`);
  $('#curve-warn').textContent = '예시 · 실 로그 없음';
  $('#mx-curve h3').title = `${m.file} 의 학습 로그(results.csv)가 저장소에 없어 예시 곡선을 그린다`;
  drawLatency();
}

/* ── 호버 툴팁 (실제 위성 타일 크롭) ────────────────────────────────── */
const tip = $('#tip');
let tipJob = 0;
function showTip(p, pt) {
  if (!p) { tip.hidden = true; return; }
  tip.hidden = false;
  if (p.cell) {                                   // 광역 줌 — 격자 셀 요약
    $('#tip-cls').textContent = '격자 셀 · 약 500 m';
    $('#tip-conf').textContent = (+p.conf).toFixed(3);
    $('#tip-bar').style.width = `${p.conf * 100}%`;
    $('#tip-bar').style.background = 'var(--lx)';
    $('#tip-area').textContent = fmt(p.n) + ' 건';
    $('#tip-src').textContent = '클릭하면 이 셀로 내려간다';
    moveTip(pt);
    const job = ++tipJob;
    satCrop($('#tip-c').getContext('2d'), MAPI.satUrl, p.c[0], p.c[1], 14).then(() => {
      if (job === tipJob) cropFrame($('#tip-c').getContext('2d'));
    });
    return;
  }
  $('#tip-cls').textContent = ko(p.cls);
  $('#tip-conf').textContent = (+p.conf).toFixed(3);
  $('#tip-bar').style.width = `${p.conf * 100}%`;
  $('#tip-bar').style.background = classColor(p.cls);
  $('#tip-area').textContent = (+p.area).toFixed(1) + ' ㎡';
  $('#tip-src').textContent = p.src || '';
  moveTip(pt);
  const job = ++tipJob;
  const f = DATA.feats.find((x) => x.id === p.id);
  if (f) satCrop($('#tip-c').getContext('2d'), MAPI.satUrl, f.properties.c[0], f.properties.c[1], 17)
    .then(() => { if (job === tipJob) drawTipPoly(f); });
}
// 크롭임을 알리는 프레임 — 배경 지도와 같은 위성영상이라 테두리가 없으면 지도와 섞인다.
function cropFrame(g) {
  const W = g.canvas.width;
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, W - 2);
  g.font = '500 11px "IBM Plex Mono",monospace';
  g.fillStyle = 'rgba(10,16,26,.7)'; g.fillRect(0, W - 17, 74, 17);
  g.fillStyle = 'rgba(255,255,255,.8)'; g.fillText('256px 크롭', 5, W - 5);
}

function drawTipPoly(f) {
  const c = $('#tip-c'), g = c.getContext('2d');
  const [lng, lat] = f.properties.c;
  const zoom = 17;
  const span = 128 / 256 / 2 ** zoom * 360;                      // satCrop 이 그린 폭(경도)
  const box = { west: lng - span / 2, east: lng + span / 2,
                north: lat + (span / 2) * 0.82, south: lat - (span / 2) * 0.82 };
  drawDets(g, box, [{ geometry: f.geometry, cls: f.properties.cls, conf: f.properties.conf }], { scale: 1 });
  cropFrame(g);
}
function moveTip(pt) {
  if (!pt) return;
  const r = $('#map-zone').getBoundingClientRect();
  const x = Math.min(pt.x + 16, r.width - 300), y = Math.min(pt.y + 14, r.height - 120);
  tip.style.transform = `translate(${Math.max(6, x)}px,${Math.max(6, y)}px)`;
}
function pickDet(f) {
  if (!f) return;
  toast(`${ko(f.properties.cls)} · 신뢰도 ${f.properties.conf.toFixed(3)} · ${f.properties.area.toFixed(1)} ㎡ · ${f.properties.src}`);
}

/* ── 탭: 결과 지도 ↔ 시점 비교 ─────────────────────────────────────── */
const EPOCHS = ['namwon_2504', 'namwon_2506', 'namwon_2508', 'namwon_2510'];
let swA = 0, swB = 3, swReady = false;

function buildTabs() {
  $$('#map-tabs button').forEach((b) => b.addEventListener('click', async () => {
    $$('#map-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    S.view = b.dataset.view;
    const on = S.view === 'swipe';
    $('#swipe').hidden = !on;
    $('#ctl').style.display = on ? 'none' : '';
    $('#sum').style.display = on ? 'none' : '';
    if (on && !swReady) { swReady = true; await renderSwipe(); }
  }));

  $('#sw-steps').innerHTML = EPOCHS.map((id, i) => {
    const im = IMAGERY.find((x) => x.id === id);
    return `<button type="button" data-i="${i}" aria-pressed="false">${im.captured}</button>`;
  }).join('');
  $$('#sw-steps button').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if (i === swA || i === swB) return;
    // 가까운 쪽을 교체한다 — 사용자가 "어느 쪽이 바뀌는지" 예측할 수 있어야 한다.
    (Math.abs(i - swA) <= Math.abs(i - swB)) ? (swA = i) : (swB = i);
    renderSwipe();
  }));

  const grip = $('#sw-grip'), line = $('#sw-line');
  const setX = (px) => {
    const r = $('#swipe').getBoundingClientRect();
    const p = Math.max(2, Math.min(98, ((px - r.left) / r.width) * 100));
    line.style.left = p + '%';
    $('#sw-b').style.clipPath = `inset(0 0 0 ${p}%)`;
  };
  grip.addEventListener('pointerdown', (e) => {
    grip.setPointerCapture(e.pointerId);
    const mv = (ev) => setX(ev.clientX);
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
}

async function renderSwipe() {
  const a = IMAGERY.find((x) => x.id === EPOCHS[swA]), b = IMAGERY.find((x) => x.id === EPOCHS[swB]);
  $('#sw-la').textContent = a.captured; $('#sw-lb').textContent = b.captured;
  $$('#sw-steps button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.i === swA || +x.dataset.i === swB)));
  const ga = $('#sw-a').getContext('2d'), gb = $('#sw-b').getContext('2d');
  const opt = { span: 4, z: 18 };
  const [, boxB] = await Promise.all([mosaic(ga, a, opt), mosaic(gb, b, opt)]);
  // 실제 변화지수 폴리곤을 B 위에 얹는다 — 스와이프가 "그림 두 장"이 아니라 판독이 된다.
  const { feats, spec } = await loadSample('namwon_2508');
  if (spec) drawDets(gb, boxB, feats.filter((f) => f.conf >= S.thr), { labels: 6, scale: 2 });
  $('#sw-la').textContent = `${a.captured} · GSD ${(a.gsd * 100).toFixed(2)}cm`;
  $('#sw-lb').textContent = spec
    ? `${b.captured} + ${spec.label.replace(' · score', '')} ≥${S.thr.toFixed(2)}`
    : `${b.captured} · GSD ${(b.gsd * 100).toFixed(2)}cm`;
}

/* ── 상단 바 · 기타 ─────────────────────────────────────────────────── */
$('#run').addEventListener('click', () => doRun({}));
$('#debug').addEventListener('click', () => doRun({ stepwise: true }));
$('#autolay').addEventListener('click', (e) => {
  const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  GRAPH.setAutoLayout(on);
  toast(on ? '자동정렬 켜짐 — 배치를 다시 계산했다' : '자동정렬 꺼짐');
});
$('#ops').addEventListener('click', (e) => {
  const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  document.documentElement.dataset.ops = on ? 'dark' : '';   // cssVar 는 documentElement 를 읽는다
  requestAnimationFrame(() => { redrawCharts(); GRAPH.render(); });
});
$('#ver').addEventListener('click', () => toast('버전 v3 · Live — 저장 시점마다 스냅샷이 남는다(프로토는 표시만)'));
$('#assist-mode').addEventListener('change', (e) => toast(`Builder Assist: ${e.target.selectedOptions[0].textContent}`));
$('#sink').addEventListener('change', (e) =>
  toast(e.target.checked ? '주의 — 결과가 국토조사 DB에 반영된다' : '안전한 시험 실행 (기본값)'));

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
}

let rsz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rsz);
  rsz = setTimeout(() => { redrawCharts(); GRAPH?.place(); }, 160);
});

// 실행 지연(ms)을 상단 러너 칩에 붙인다 — 실측값만 쓴다.
setInterval(() => {
  const last = RUN?.runs?.[RUN.runs.length - 1];
  if (last) $('#runner-ping').textContent = `${Math.round(last)} ms`;
}, 1500);

// 테스트 훅 — Playwright 가 내부 상태를 들여다볼 수 있게 최소한만 노출한다.
Object.defineProperty(window, '__wfgraph', { get: () => GRAPH });
Object.defineProperty(window, '__wfmap', { get: () => MAPI?.map });
// 부팅이 끝나기 전에 폴링당해도 던지지 않는다 — 던지면 waitForFunction 이 재시도 없이 죽는다.
window.__wf = {
  get ready() { return !!(GRAPH && MAPI && DATA); },
  get state() { return { ...S, classes: [...S.classes] }; },
  counts: () => (MAPI ? MAPI.counts() : { shown: 0, total: 0, area: 0, mean: 0, per: new Map() }),
  graph: () => (GRAPH ? { nodes: GRAPH.G.nodes.length, edges: GRAPH.G.edges.length } : { nodes: 0, edges: 0 }),
  run: (o) => doRun(o || {}),
  setThreshold,
  thumbs: () => (GRAPH ? GRAPH.G.nodes.filter((n) => n.state === 'done' || n.state === 'cache').length : 0),
};
