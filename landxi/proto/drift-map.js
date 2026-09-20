/* 괭생이모자반 도착 예측 — 지도 서비스.
   판독(표준 산출) → 해류 시뮬레이션 → 지도. 계산은 drift-core.js 가, 속도장은 sim.js 가 한다.
   이 파일은 그리기만 맡는다. 실 해류 산출이 들어오면 이 파일은 한 줄도 고치지 않는다. */
import { mountShell, esc, nf } from './shell.js';
import { PATCHES, DENSITY, COAST, FIELD, RUN, SIMS, LX_ROLE, LX_LINE, VERIFY, DRIFT_SCHEMA, sample } from '../assets/data/sim.js';
import { run, probGrid, eta } from './drift-core.js';

mountShell({
  active: 'map', title: '괭생이모자반 도착 예측',
  subtitle: '위성 판독 → 표류체 패치 표준 → 해류 이류 계산 → 상륙 구간·도착 시각 · <b>2027년 전남 해양쓰레기 고도화</b>',
  crumbs: [{ label: '지도 서비스', href: 'ximap.html' }, { label: '표류 예측' }],
  notice: false, asOf: false, fit: true, demo: true,
});

const main = document.getElementById('main');
main.innerHTML = `
<div class="df">
  <div class="df-map">
    <div id="df-gl"></div>
    <canvas id="df-fx"></canvas>
    <div class="df-lay" role="group" aria-label="레이어">
      <button type="button" data-lay="flow" aria-pressed="true"><i style="background:#0FA9A0"></i>해류 유선</button>
      <button type="button" data-lay="part" aria-pressed="true"><i style="background:#006DF7"></i>표류 입자</button>
      <button type="button" data-lay="track" aria-pressed="false"><i style="background:#8AB6F6"></i>궤적</button>
      <button type="button" data-lay="prob" aria-pressed="false"><i style="background:#D1352B"></i>도착 확률</button>
      <button type="button" data-lay="patch" aria-pressed="true"><i style="background:#010102"></i>탐지 패치</button>
    </div>
    <p class="df-mock df-mock--warn"><b>모의 속도장 — 예측 아님</b>${esc(FIELD.warn)}.
      계수는 개발 중 손으로 맞춘 값이라 실제 유입 경향과 맞는다는 근거가 없다.
      <span>동작하는 것은 <b>고리</b>다 — 판독 표준이 들어오면 같은 코드가 실 해류 산출로 돈다.</span></p>
    <div class="df-bar">
      <button type="button" class="df-play" id="df-play" aria-label="재생"><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M1 1l12 7-12 7z" fill="currentColor"/></svg></button>
      <div class="df-time">
        <input type="range" id="df-range" min="0" max="80" value="0" aria-label="예보 시각">
        <p class="df-t"><span id="df-now"><b>—</b></span><span id="df-elapsed">+0 h</span><span>${RUN.horizonDays}일 예보 · ${RUN.stepHours}시간 간격</span></p>
      </div>
      <div class="df-speed" role="group" aria-label="재생 속도">
        <button type="button" data-sp="1" aria-pressed="true">1×</button>
        <button type="button" data-sp="3" aria-pressed="false">3×</button>
        <button type="button" data-sp="8" aria-pressed="false">8×</button>
      </div>
    </div>
  </div>
  <aside class="df-side" aria-label="예측 결과">
    <section class="df-s"><h2>상륙 구간 <span class="df-tag">모의</span></h2>
      <p class="k">실 해류 산출이 붙으면 <em>수거 선박과 인력을 붙일 자리</em>가 된다.
        지금 값은 모의 속도장에서 나온 것이라 <b>수거 계획의 근거로 쓰지 않는다.</b></p>
      <div class="df-eta" id="df-eta"></div></section>
    <section class="df-s"><h2>표준 산출 — 탐지 패치</h2>
      <p class="k">위성 판독 결과를 <b>표류체 패치 표준</b> 한 벌로 적은 것. 종류가 바뀌어도 이 틀은 같아서 시뮬레이션을 다시 만들지 않는다.</p>
      <table class="df-tb" id="df-patch"><thead><tr><th>패치</th><th>관측</th><th class="r">면적</th><th>밀도</th><th class="r">신뢰도</th></tr></thead><tbody></tbody></table></section>
    <section class="df-s"><h2>LX 의 자리</h2>
      <p class="k">${esc(LX_LINE)}</p>
      <div class="df-step" id="df-role"></div></section>
    <section class="df-s"><h2>밖에서 받을 것</h2>
      <p class="k">발주 목록에 <b>화면은 없다.</b> 물리 모델과 자료만 받는다.</p>
      <ul class="df-need" id="df-need"></ul></section>
    <section class="df-s"><h2>예측 검증</h2>
      <p class="k">${esc(VERIFY.gap)}<br>${esc(VERIFY.fix)}</p>
      <table class="df-tb"><tbody>${VERIFY.metric.map((m) => `<tr><td><b>${esc(m.name)}</b><br><span style="color:var(--grey)">${esc(m.what)}</span></td></tr>`).join('')}</tbody></table></section>
  </aside>
</div>`;

/* ── 계산 ─────────────────────────────────────────────────────────── */
const R = run(PATCHES);
const PROB = probGrid(R);
const ETA = eta(R);
const fmt = (ms) => { const d = new Date(ms); return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}시`; };

/* ── 지도 ─────────────────────────────────────────────────────────── */
const map = new maplibregl.Map({
  container: 'df-gl', attributionControl: false, dragRotate: false, pitchWithRotate: false, touchZoomRotate: false,
  center: [126.0, 33.6], zoom: 6.15, minZoom: 5, maxZoom: 10,
  style: 'https://tiles.openfreemap.org/styles/positron',
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

const fc = (feats) => ({ type: 'FeatureCollection', features: feats });
const pt = (lon, lat, props = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });

map.on('load', () => {
  // 해안 구간 — 도착 비율에 따라 굵기가 달라진다
  map.addSource('coast', { type: 'geojson', data: fc(COAST.map((c) => {
    const e = ETA.find((x) => x.coast.id === c.id);
    return pt(c.lon, c.lat, { name: c.name, ratio: e ? e.ratio : 0, span: c.span });
  })) });
  map.addLayer({ id: 'coast-halo', type: 'circle', source: 'coast',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'ratio'], 0, 5, 50, 30],
      'circle-color': '#D1352B', 'circle-opacity': 0.16,
      'circle-stroke-width': 1, 'circle-stroke-color': '#D1352B', 'circle-stroke-opacity': 0.55 } });
  map.addLayer({ id: 'coast-lb', type: 'symbol', source: 'coast',
    layout: { 'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'], 'text-size': 13, 'text-offset': [0, 1.9], 'text-anchor': 'top', 'text-allow-overlap': false },
    paint: { 'text-color': '#010102', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 } });

  // 도착 확률 격자
  map.addSource('prob', { type: 'geojson', data: fc(PROB.map((c) => ({ type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[c.lon - c.cell / 2, c.lat - c.cell / 2], [c.lon + c.cell / 2, c.lat - c.cell / 2],
      [c.lon + c.cell / 2, c.lat + c.cell / 2], [c.lon - c.cell / 2, c.lat + c.cell / 2], [c.lon - c.cell / 2, c.lat - c.cell / 2]]] },
    properties: { p: c.p } }))) });
  map.addLayer({ id: 'prob', type: 'fill', source: 'prob', layout: { visibility: 'none' },
    paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'p'], 0, '#E8F1FF', 0.35, '#8AB6F6', 0.7, '#D1352B', 1, '#8E1B14'],
      'fill-opacity': ['interpolate', ['linear'], ['get', 'p'], 0, 0.18, 1, 0.68] } });

  // 궤적
  map.addSource('track', { type: 'geojson', data: fc(R.tracks.filter((_, i) => i % 9 === 0).map((p) => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: p.path.filter((_, i) => i % 2 === 0) }, properties: { w: p.w } }))) });
  map.addLayer({ id: 'track', type: 'line', source: 'track', layout: { visibility: 'none', 'line-cap': 'round' },
    paint: { 'line-color': '#8AB6F6', 'line-width': 0.8, 'line-opacity': 0.42 } });

  // 탐지 패치
  map.addSource('patch', { type: 'geojson', data: fc(PATCHES.map((p) => pt(p.lon, p.lat, { id: p.id, area: p.areaKm2, d: p.density, conf: p.conf, at: p.at }))) });
  map.addLayer({ id: 'patch-f', type: 'circle', source: 'patch',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'area'], 5, 7, 25, 17],
      'circle-color': '#0FA9A0', 'circle-opacity': 0.34, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#0FA9A0' } });
  map.addLayer({ id: 'patch-lb', type: 'symbol', source: 'patch',
    layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, -1.7] },
    paint: { 'text-color': '#010102', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.8 } });

  map.on('click', 'patch-f', (e) => {
    const p = e.features[0].properties;
    new maplibregl.Popup({ closeButton: false, className: 'df-pop' }).setLngLat(e.lngLat)
      .setHTML(`<b>${esc(p.id)}</b><br>면적 ${p.area} km² · 밀도 ${esc(DENSITY[p.d]?.name || p.d)} · 신뢰도 ${p.conf}`).addTo(map);
  });
  map.on('mouseenter', 'patch-f', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'patch-f', () => { map.getCanvas().style.cursor = ''; });
  sizeCanvas(); tick();
});

/* ── 캔버스: 해류 유선 + 표류 입자 ────────────────────────────────── */
const cv = document.getElementById('df-fx'), cx = cv.getContext('2d');
let W = 0, H = 0, dpr = Math.min(2, devicePixelRatio || 1);
function sizeCanvas() {
  const r = cv.parentElement.getBoundingClientRect();
  W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = `${W}px`; cv.style.height = `${H}px`; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedFlow();
}
new ResizeObserver(() => sizeCanvas()).observe(document.querySelector('.df-map'));

// 북쪽 고정 지도 → 직접 메르카토르 투영이 map.project() 보다 훨씬 싸다
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
let bx = null;
function frameBox() {
  const b = map.getBounds();
  bx = { w: b.getWest(), e: b.getEast(), n: mercY(b.getNorth()), s: mercY(b.getSouth()) };
}
const px = (lon) => ((lon - bx.w) / (bx.e - bx.w)) * W;
const py = (lat) => ((bx.n - mercY(lat)) / (bx.n - bx.s)) * H;

// 해류 유선 — 화면 안에 씨를 뿌리고 속도장을 따라 흘린다
let flow = [];
const FLOW_N = 750, FLOW_LIFE = 120;
function seedFlow() {
  frameBox();
  flow = Array.from({ length: FLOW_N }, () => newStreak());
}
function newStreak() {
  const lon = bx.w + Math.random() * (bx.e - bx.w), lat = 31 + Math.random() * 4.6;
  return { lon, lat, age: Math.random() * FLOW_LIFE, trail: [[lon, lat]] };
}
const TAIL = 16;

const LAY = { flow: true, part: true, track: false, prob: false, patch: true };
let frame = 0, playing = false, speed = 1, acc = 0, hours = 0;

function drawFlow() {
  // 꼬리를 직접 그린다 — 반투명 덧칠을 쌓지 않으므로 지도가 가려지지 않는다
  cx.lineWidth = 1.35; cx.lineCap = 'round';
  for (const s of flow) {
    const [u, v] = sample(s.lon, s.lat, hours);
    s.lon += u * 0.0115; s.lat += v * 0.0115; s.age++;
    s.trail.push([s.lon, s.lat]); if (s.trail.length > TAIL) s.trail.shift();
    if (s.age > FLOW_LIFE || s.lon < bx.w - .3 || s.lon > bx.e + .3 || s.lat < 30.6 || s.lat > 35.9) { Object.assign(s, newStreak(), { age: 0 }); continue; }
    const t = s.trail;
    for (let i = 1; i < t.length; i++) {
      const a = (i / t.length) * 0.78 * Math.min(1, (FLOW_LIFE - s.age) / 14);
      if (a <= 0.02) continue;
      cx.strokeStyle = `rgba(15,169,160,${a.toFixed(3)})`;
      cx.beginPath(); cx.moveTo(px(t[i - 1][0]), py(t[i - 1][1])); cx.lineTo(px(t[i][0]), py(t[i][1])); cx.stroke();
    }
  }
}

function drawParticles() {
  const f = R.frames[Math.min(frame, R.frames.length - 1)];
  for (const [lo, la, w] of f.pts) {
    if (w < 0) continue;                                   // 아직 관측되지 않은 패치
    const x = px(lo), y = py(la);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    if (w > 0) { cx.fillStyle = w >= 1 ? 'rgba(0,80,200,.95)' : w >= .6 ? 'rgba(0,109,247,.85)' : 'rgba(90,150,245,.72)'; cx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    else { cx.fillStyle = 'rgba(209,53,43,.85)'; cx.fillRect(x - 1.8, y - 1.8, 3.6, 3.6); }   // 상륙한 입자
  }
}

function tick() {
  requestAnimationFrame(tick);
  if (!bx) frameBox();
  cx.clearRect(0, 0, W, H);
  if (LAY.flow) drawFlow();
  if (LAY.part) drawParticles();
  if (playing) {
    acc += speed;
    if (acc >= 6) { acc = 0; setFrame(frame + 1 >= R.frames.length ? 0 : frame + 1); }
  }
}
map.on('move', frameBox);
map.on('zoom', frameBox);

/* ── 조작 ─────────────────────────────────────────────────────────── */
const $ = (s) => document.querySelector(s);
const range = $('#df-range'); range.max = R.frames.length - 1;
function setFrame(i) {
  frame = Math.max(0, Math.min(R.frames.length - 1, i));
  const f = R.frames[frame];
  hours = f.h; range.value = frame;
  $('#df-now').innerHTML = `<b>${fmt(f.at)}</b>`;
  $('#df-elapsed').textContent = `+${f.h} h · ${Math.floor(f.h / 24)}일차`;
}
range.addEventListener('input', () => { setFrame(+range.value); });
$('#df-play').addEventListener('click', (e) => {
  playing = !playing;
  e.currentTarget.setAttribute('aria-label', playing ? '정지' : '재생');
  e.currentTarget.innerHTML = playing
    ? '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="1" y="1" width="4" height="14" fill="currentColor"/><rect x="9" y="1" width="4" height="14" fill="currentColor"/></svg>'
    : '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M1 1l12 7-12 7z" fill="currentColor"/></svg>';
});
document.querySelectorAll('.df-speed button').forEach((b) => b.addEventListener('click', () => {
  speed = +b.dataset.sp;
  document.querySelectorAll('.df-speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
document.querySelectorAll('.df-lay button').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.lay, on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on)); LAY[k] = on;
  const gl = { track: ['track'], prob: ['prob'], patch: ['patch-f', 'patch-lb'] }[k];
  if (gl && map.getLayer(gl[0])) gl.forEach((id) => map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
}));

/* ── 오른쪽 판 ────────────────────────────────────────────────────── */
$('#df-eta').innerHTML = (ETA.length ? ETA.map((e) => `
  <div class="df-eta-r">
    <span class="df-eta-n">${esc(e.coast.name)}</span>
    <span class="df-eta-v">${e.ratio}<i>%</i></span>
    <span class="df-eta-t">첫 도달 ${fmt(e.first)} · 절반 ${fmt(e.half)} · ${nf.format(e.n)}입자</span>
    <span class="df-eta-b"><u style="width:${Math.min(100, e.ratio * 2)}%"></u></span>
  </div>`).join('')
  : '<p class="k">예보 기간 안에 닿는 구간이 없다.</p>')
  + '<p class="df-warn">위 비율은 <b>모의 속도장</b>에서 계산된 값이다. 계수를 바꾸면 구간과 비율이 통째로 바뀐다 — 예측이 아니다.</p>';

$('#df-patch tbody').innerHTML = PATCHES.map((p) => `<tr>
  <td>${esc(p.id)}</td><td class="n">${esc(p.at.slice(5, 10).replace('-', '.'))}</td>
  <td class="n">${p.areaKm2}</td><td>${esc(DENSITY[p.density]?.name || p.density)}</td><td class="n">${p.conf}</td></tr>`).join('');

$('#df-role').innerHTML = LX_ROLE.map((r) => `<b>${r.step}</b><span>${esc(r.name)}
  <span class="who" data-w="${esc(r.who)}">${esc(r.who)}</span><br><em>${esc(r.what)}</em></span>`).join('');

const sim = SIMS[0];
$('#df-need').innerHTML = [...new Set(SIMS.flatMap((s) => s.needs))].map((n) => `<li>${esc(n)}</li>`).join('')
  + `<li style="border-top:1px solid var(--ink);color:var(--grey)">화면·표준·이류 계산·검증은 LX 가 한다 — 발주하지 않는다</li>`;

setFrame(0);
