/* ============================================================================
   landxi/proto/scrub/scrub.js — 페이지 쪽 코드
   엔진은 ../vendor/scrollcraft/scrollcraft.js (MIT, Nate Herk / scroll-craft).
   엔진이 주는 것은 딱 셋이다: --sc-seg, --sc-segp, sc:waypoint 이벤트.
   레일도 다이얼도 인계도 전부 여기서 만든다(worldflight.md §5 "It renders no rail").

   지키고 있는 7가지 불변식(worldflight.md §8 Hard rules) — 어디서 지키는지 표시:
     1) 문서 흐름에 스페이서 하나만            → index.html (스테이지·카피층·계기판 전부 fixed)
     2) src 를 절대 교체하지 않는다             → 엔진 loadClip(): data-sc-src 를 1회 Blob 으로만 물린다
     3) 크로스페이드는 한쪽만                   → 엔진 readWorld(): 나가는 leg 가 밑에서 풀 강도 유지
     4) lerp 는 끄지 않는다(reduced-motion 제외) → data-sc-lerp="0.12", 엔진 tick()
     5) 전체 비행 페이스 1개                    → tools/scrub/legs.mjs 가 weight=0.218×초 로 굽는다
     6) 씸 프레임은 인코딩된 mp4 에서            → tools/scrub/legs.mjs seamDiff()
     7) 카피의 유일한 transform 은 translateY   → 엔진이 쓴다. 이 파일은 카피에 transform 을 쓰지 않는다
   ========================================================================= */

const MANIFEST = '/landxi/assets/proto/film/legs/manifest.json';
const YEOSU = '/landxi/assets/data/geo/results/yeosu-marine-2025-aerial.geojson';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const nf = (v, d = 0) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

const EASES = {
  easeLin: x => x,
  easeInOut: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  easeOut: x => 1 - Math.pow(1 - x, 3),
  easeOut4: x => 1 - Math.pow(1 - x, 4),
};

// 엔진의 lingerEase 와 동일한 곡선. 계기판이 읽는 필름 시각이 실제 재생헤드와
// 어긋나지 않게 하려면 같은 리맵을 써야 한다(f(0)=0, f(1)=1 고정).
function lingerEase(x, L) {
  if (!L) return x;
  L = clamp(L, 0, 0.6);
  const c = x - 0.5;
  return (1 - L) * x + L * (4 * c * c * c + 0.5);
}

const $ = s => document.querySelector(s);
const el = {
  root: $('[data-sc-mode="worldflight"]'),
  spacer: $('[data-sc-spacer]'),
  disc: $('#sb-disc'),
  pips: $('#sb-pips'),
  bearing: $('#sb-bearing'),
  alt: $('#sb-alt'),
  gsd: $('#sb-gsd'),
  coord: $('#sb-coord'),
  route: $('#sb-route-list'),
  hint: $('#sb-hint'),
  handoff: $('#sb-handoff'),
  map: $('#sb-map'),
};

let M = null;            // manifest
let cum = [];            // leg 별 [c0, c1] (vh)
let total = 0;           // Σ weight (vh)
let map = null, mapReady = false;

/* ── 카메라 트랙 — 필름을 실제로 구운 그 표를 그대로 읽는다 ───────────────── */
function camAt(t) {
  const T = M.cameraTrack;
  let s = T[0];
  for (const g of T) if (t >= g.t0) s = g;
  const k = (EASES[s.ease] || EASES.easeLin)(clamp01((t - s.t0) / (s.t1 - s.t0)));
  return {
    lng: lerp(s.a.c[0], s.b.c[0], k),
    lat: lerp(s.a.c[1], s.b.c[1], k),
    zoom: lerp(s.a.z, s.b.z, k),
    pitch: lerp(s.a.p, s.b.p, k),
    bearing: lerp(s.a.b, s.b.b, k),
    seg: s.id,
  };
}
const mppOf = (zoom, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
const altOf = (zoom, lat) => 1.5 * 720 * mppOf(zoom, lat);   // manifest.cameraNote 참조

/* ── 트랙 위치 ────────────────────────────────────────────────────────────── */
function trackVh() {
  const top = el.root.getBoundingClientRect().top + scrollY;
  return clamp((scrollY - top) / Math.max(innerHeight, 1), 0, total);
}
function legAt(t) {
  let k = 0;
  for (let i = 0; i < cum.length; i++) if (t >= cum[i][0]) k = i;
  return k;
}
// 트랙 위치 → 필름 절대 시각(초). 레그 안에서는 엔진과 같은 lingerEase 를 통과시킨다.
function filmTimeAt(t) {
  const k = legAt(t);
  const L = M.legs[k];
  const local = clamp01((t - cum[k][0]) / Math.max(L.weightVh, 1e-6));
  const linger = parseFloat(el.root.querySelectorAll('[data-sc-segment]')[k].getAttribute('data-sc-linger')) || 0;
  return L.frames[0] / M.fps + lingerEase(local, linger) * L.seconds;
}

/* ── 계기판 ───────────────────────────────────────────────────────────────── */
const WAYPOINTS = [];    // {label, frac} — 이름 붙은 5개 지점
function buildRail() {
  const seen = new Map();
  M.legs.forEach((L, i) => {
    if (seen.has(L.label)) return;
    seen.set(L.label, i);
    WAYPOINTS.push({ label: L.label, place: L.place, leg: i, frac: cum[i][0] / total });
  });

  // 항로 — 현재 지점은 액센트 사각 마커로만 표시한다. 글자색을 바꾸지 않는다.
  el.route.innerHTML = WAYPOINTS.map(w =>
    `<li data-leg="${w.leg}"><button type="button" data-goto="${w.leg}">` +
    `<span class="sb-route__m" aria-hidden="true"></span>` +
    `<span class="sb-route__t">${w.label}</span></button></li>`).join('');
  el.route.addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b) gotoLeg(+b.dataset.goto);
  });

  // 다이얼 핍 — 디스크가 페이지 전체에 정확히 1회전하므로,
  // 각 지점의 핍은 그 지점에 도착하는 순간 정확히 바늘(12시) 밑에 온다.
  el.pips.innerHTML = WAYPOINTS.map(w => {
    // 디스크는 +p×360 으로 돈다. 그러니 핍의 출발 각은 -frac×360 이어야
    // p == frac 인 순간 정확히 12시(바늘 밑)에 온다.
    const a = (-w.frac * 360 - 90) * Math.PI / 180;
    const x = 60 + 49 * Math.cos(a), y = 60 + 49 * Math.sin(a);
    return `<rect class="sb-pip" data-leg="${w.leg}" x="${(x - 3).toFixed(2)}" y="${(y - 3).toFixed(2)}" width="6" height="6"></rect>`;
  }).join('');
}

let lastLeg = -1;
function paint() {
  const t = trackVh();
  const p = clamp01(t / total);
  el.root.style.setProperty('--sb-p', p.toFixed(5));

  const ft = filmTimeAt(t);
  const c = camAt(ft);
  const alt = altOf(c.zoom, c.lat);
  const mpp = mppOf(c.zoom, c.lat);

  // 방위는 항공 관례대로 0–360 으로 읽는다(필름의 bearing 은 −25..+5).
  const brg = ((c.bearing % 360) + 360) % 360;
  el.bearing.textContent = nf(brg, 1) + '°';
  el.alt.textContent = alt >= 10000 ? nf(alt / 1000, 0) + ' km'
                     : alt >= 1000 ? nf(alt / 1000, 1) + ' km'
                     : nf(alt, 0) + ' m';
  el.gsd.textContent = mpp >= 1000 ? nf(mpp / 1000, 1) + ' km/px'
                     : mpp >= 1 ? nf(mpp, 1) + ' m/px'
                     : nf(mpp * 100, 1) + ' cm/px';
  el.coord.textContent = c.lng.toFixed(4) + ', ' + c.lat.toFixed(4);

  const k = legAt(t);
  if (k !== lastLeg) {
    lastLeg = k;
    const wpLeg = (WAYPOINTS.find(w => w.label === M.legs[k].label) || {}).leg;
    el.route.querySelectorAll('li').forEach(li =>
      li.setAttribute('aria-current', String(+li.dataset.leg === wpLeg)));
    el.pips.querySelectorAll('.sb-pip').forEach(r =>
      r.setAttribute('data-on', +r.dataset.leg === wpLeg ? '1' : '0'));
  }

  handoff(p, c);
}

/* ── 인계 — 필름이 끝난 그 카메라를 살아 있는 지도가 이어받는다 ──────────────
   레그가 아니라 무대의 마지막 층이다. 지도는 인계 구간 근처에서만 만든다. */
function makeMap(c) {
  if (map || reduce || !window.maplibregl) return;
  map = new maplibregl.Map({
    container: el.map,
    center: [c.lng, c.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing,
    attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        vsat: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'],
                tileSize: 256, minzoom: 5, maxzoom: 19, attribution: 'V-World 위성영상' },
        det: { type: 'geojson', data: YEOSU },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#06080b' } },
        { id: 'sat', type: 'raster', source: 'vsat' },
        // 탐지는 후보다 — 신뢰도로 감쇠시키되 삭제하지 않는다(카피덱 §4 "감쇠").
        { id: 'det-f', type: 'fill', source: 'det',
          paint: { 'fill-color': '#FF9A2E', 'fill-opacity': ['interpolate', ['linear'], ['get', 'conf'], 0.05, 0.12, 0.7, 0.5] } },
        { id: 'det-l', type: 'line', source: 'det',
          paint: { 'line-color': '#FF9A2E', 'line-width': 1,
                   'line-opacity': ['interpolate', ['linear'], ['get', 'conf'], 0.05, 0.25, 0.7, 0.95] } },
      ],
    },
  });
  map.on('load', () => { mapReady = true; });
  map.scrollZoom.disable();     // 페이지 스크롤을 지도가 삼키지 않게 — 인계 후 드래그/줌만 허용
  map.keyboard.disable();
}
const HANDOFF_FROM = 0.955;     // 마지막 레그의 마지막 프레임 부근에서만
function handoff(p, c) {
  if (reduce) return;
  if (p > 0.86) makeMap(c);
  const on = p >= HANDOFF_FROM && mapReady;
  el.handoff.classList.toggle('is-on', on);
  el.handoff.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (map && on) map.scrollZoom.enable();
  else if (map) map.scrollZoom.disable();
}

/* ── 이동 ─────────────────────────────────────────────────────────────────── */
function maxScroll() { return Math.max(document.documentElement.scrollHeight - innerHeight, 1); }
function trackTop() { return el.root.getBoundingClientRect().top + scrollY; }
function gotoLeg(i) {
  i = clamp(i, 0, M.legs.length - 1);
  // 레그의 0.12 지점 — 씸 밴드(0.16vh) 밖이라 그 레그가 확실히 풀 강도인 자리.
  const y = trackTop() + (cum[i][0] + M.legs[i].weightVh * 0.12) * innerHeight;
  scrollTo({ top: Math.round(y), behavior: reduce ? 'auto' : 'smooth' });
}
function seek(p) {
  scrollTo({ top: Math.round(clamp01(p) * maxScroll()), behavior: 'auto' });
}

/* ── 부팅 ─────────────────────────────────────────────────────────────────── */
const boot = async () => {
  M = await (await fetch(MANIFEST)).json();

  let run = 0;
  cum = M.legs.map(L => { const a = run; run += L.weightVh; return [a, run]; });
  total = run;

  buildRail();

  // 엔진 마운트. 이 한 줄 아래로는 재생헤드·크로스페이드·로딩이 전부 엔진 소관이다.
  window.ScrollCraft.mount(document);

  // §7b — innerHeight 가 0 으로 읽히는 순간에 마운트되면 스페이서가 0px 이 되고
  // 페이지는 조용히 스크롤 불가 정지 이미지가 된다. 창과 서체가 정착한 뒤 한 번 재측정시킨다.
  const relayout = () => { dispatchEvent(new Event('resize')); paint(); };
  addEventListener('load', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  addEventListener('scroll', () => {
    paint();
    if (scrollY > 40) el.hint.classList.add('is-off');
  }, { passive: true });
  addEventListener('resize', paint);

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); gotoLeg(legAt(trackVh()) + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); gotoLeg(legAt(trackVh()) - 1); }
  });

  paint();

  window.__scrub = {
    manifest: M,
    legs: M.legs,
    seek,                                   // 0..1 페이지 진행도
    gotoLeg,
    progress: () => clamp01(scrollY / maxScroll()),
    trackVh,
    leg: () => legAt(trackVh()),
    legLabel: () => M.legs[legAt(trackVh())].label,
    filmTime: () => filmTimeAt(trackVh()),
    camera: () => camAt(filmTimeAt(trackVh())),
    spacerVh: () => total + 1,
    handoffActive: () => el.handoff.classList.contains('is-on'),
    ready: true,
  };
  document.documentElement.classList.add('sb-ready');
};

boot().catch(e => { console.error('[scrub] boot failed', e); });
