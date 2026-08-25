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
     5) 전체 비행 페이스 1개                    → tools/scrub/assemble.mjs 가 weight=0.218×초 로 굽는다
     6) 씸 프레임은 인코딩된 mp4 에서            → assemble.mjs 의 grayFrame(mp4,'last'|'first')
     7) 카피의 유일한 transform 은 translateY   → 엔진이 쓴다. 이 파일은 카피에 transform 을 쓰지 않는다
   ========================================================================= */

const MANIFEST = '/landxi/assets/proto/film/legs/manifest.json';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = x => x * x * (3 - 2 * x);
const nf = (v, d = 0) => v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

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
  pips: $('#sb-pips'),
  bearing: $('#sb-bearing'),
  alt: $('#sb-alt'),
  gsd: $('#sb-gsd'),
  coord: $('#sb-coord'),
  caption: $('#sb-caption'),
  route: $('#sb-route-list'),
  hint: $('#sb-hint'),
  plateN: $('#sb-plate-namwon'),
  plateY: $('#sb-plate-yeosu'),
  mapN: $('#sb-map-namwon'),
  mapY: $('#sb-map-yeosu'),
  plateCap: $('#sb-plate-cap'),
};

let M = null;            // manifest
let cum = [];            // leg 별 [c0, c1] (vh)
let total = 0;           // Σ weight (vh)
let SEAM = 0.16;
let linger = [];

/* ── 카메라 ────────────────────────────────────────────────────────────────
   레그마다 렌더러가 달라 카메라 트랙이 하나로 이어지지 않는다. 그래서 계기판은
   manifest.legs[i].startCamera → endCamera 를 레그 안에서 보간하고, 이음매에서는
   씸 밴드(0.16vh) 위에서 두 레그의 판독값을 섞는다 — 계기 바늘이 튀지 않게.
   고도만 로그 보간이다. 15,000 km → 460 km 를 선형으로 읽으면 첫 절반이 통째로
   "아직 15,000 km" 로 보인다. */
const K = 1.5 * 720;                       // MapLibre 기본 fov 36.87°, 필름 뷰포트 720px
const mppOf = a => a / K;
const zoomOf = (altM, lat) =>
  Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mppOf(altM));

// 좌표는 "먼 이동"에서 보간하지 않는다. 남원(35.43)과 여수(34.57) 사이를 섞으면
// 계기가 35.10 이라는, 필름 어디에도 없는 자리를 읽는다. 필름이 거기서 컷이면
// 계기도 컷이어야 한다 — 다만 고도·방위·피치는 계속 섞어서 바늘이 스냅하지 않게 둔다.
const JUMP = 0.15;    // 도(°)
function mixCam(A, B, t) {
  const far = Math.abs(A.lng - B.lng) > JUMP || Math.abs(A.lat - B.lat) > JUMP;
  const g = far ? (t < 0.5 ? 0 : 1) : t;
  return {
    lng: lerp(A.lng, B.lng, g),
    lat: lerp(A.lat, B.lat, g),
    alt: Math.exp(lerp(Math.log(A.alt), Math.log(B.alt), t)),
    pitch: lerp(A.pitch, B.pitch, t),
    bearing: lerp(A.bearing, B.bearing, t),
  };
}
const camPoint = c => ({
  lng: c.center[0], lat: c.center[1], alt: c.altitudeM, pitch: c.pitch, bearing: c.bearing,
});
// 레그 i 안에서의 카메라. local 은 0..1 로 잘라 쓴다(이음매 밖에서도 정의되도록).
function camOfLeg(i, t) {
  const L = M.legs[i];
  const local = clamp01((t - cum[i][0]) / Math.max(L.weightVh, 1e-6));
  const u = lingerEase(local, linger[i]);
  return mixCam(camPoint(L.startCamera), camPoint(L.endCamera), u);
}
function camAt(t) {
  const k = legAt(t);
  const A = camOfLeg(k, t);
  if (k + 1 < M.legs.length && t > cum[k][1] - SEAM / 2) {
    const w = smooth(clamp01((t - (cum[k][1] - SEAM / 2)) / SEAM));
    return mixCam(A, camOfLeg(k + 1, t), w);
  }
  if (k > 0 && t < cum[k][0] + SEAM / 2) {
    const w = smooth(clamp01((t - (cum[k][0] - SEAM / 2)) / SEAM));
    return mixCam(camOfLeg(k - 1, t), A, w);
  }
  return A;
}

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
// 트랙 위치 → 그 레그 안에서의 필름 시각(초).
function filmTimeAt(t) {
  const k = legAt(t);
  const L = M.legs[k];
  const local = clamp01((t - cum[k][0]) / Math.max(L.weightVh, 1e-6));
  return lingerEase(local, linger[k]) * L.seconds;
}

/* ── 계기판 ───────────────────────────────────────────────────────────────── */
const WAYPOINTS = [];    // 이름 붙은 5개 지점 — 궤도 · 성층운 · 한반도 · 남원 · 여수
function buildRail() {
  const seen = new Set();
  M.legs.forEach((L, i) => {
    const w = L.wp || L.label;
    if (seen.has(w)) return;
    seen.add(w);
    WAYPOINTS.push({ label: w, leg: i, frac: cum[i][0] / total });
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

  handoff(t);
  // 인계 판이 올라와 있으면 계기는 판의 카메라를 읽는다. "같은 카메라로 이어받았다"는
  // 주장을 계기가 그 순간에 반박하면 안 된다.
  const live = PLATES.find(r => r && r.on);
  const c = live ? {
    lng: live.spec.center[0], lat: live.spec.center[1],
    alt: live.spec.altitudeM, pitch: live.spec.pitch, bearing: live.spec.bearing,
  } : camAt(t);
  const mpp = mppOf(c.alt);
  const brg = ((c.bearing % 360) + 360) % 360;   // 항공 관례대로 0–360
  el.bearing.textContent = nf(brg, 1) + '°';
  el.alt.textContent = c.alt >= 1e6 ? nf(c.alt / 1000, 0) + ' km'
                     : c.alt >= 1e4 ? nf(c.alt / 1000, 0) + ' km'
                     : c.alt >= 1000 ? nf(c.alt / 1000, 2) + ' km'
                     : nf(c.alt, 0) + ' m';
  el.gsd.textContent = mpp >= 1000 ? nf(mpp / 1000, 1) + ' km/px'
                     : mpp >= 1 ? nf(mpp, 1) + ' m/px'
                     : nf(mpp * 100, 1) + ' cm/px';
  el.coord.textContent = c.lng.toFixed(4) + ', ' + c.lat.toFixed(4);

  const k = legAt(t);
  if (k !== lastLeg) {
    lastLeg = k;
    const wp = M.legs[k].wp || M.legs[k].label;
    const wpLeg = (WAYPOINTS.find(w => w.label === wp) || {}).leg;
    el.route.querySelectorAll('li').forEach(li =>
      li.setAttribute('aria-current', String(+li.dataset.leg === wpLeg)));
    el.pips.querySelectorAll('.sb-pip').forEach(r =>
      r.setAttribute('data-on', +r.dataset.leg === wpLeg ? '1' : '0'));
    // 실캡션 — 장소 · 날짜 · GSD 는 manifest 가 들고 있는 실제 출처 문자열이다.
    el.caption.textContent = M.legs[k].place + ' · ' + M.legs[k].caption;
  }
}

/* ── 인계 — 필름이 멈춘 그 카메라를 살아 있는 지도가 이어받는다 ──────────────
   레그가 아니라 무대의 마지막 두 층이다.
     #1 남원  레그 06(비닐하우스) 끝 — manifest.handoff, 온실 검출 9,664동
     #2 여수  필름 최종 프레임      — manifest.handoffFinal, 해양쓰레기 후보
   지도는 각자 자기 구간 1.2vh 앞에서만 만든다. 크로스페이드는 1프레임(≈40ms). */
const PLATES = [];
function makePlate(spec, container, host, style) {
  if (reduce || !window.maplibregl) return null;
  const map = new maplibregl.Map({
    container,
    center: spec.center, zoom: spec.zoom, pitch: spec.pitch, bearing: spec.bearing,
    attributionControl: { compact: true },
    style,
  });
  map.scrollZoom.disable();   // 페이지 스크롤을 지도가 삼키지 않게 — 인계 후에만 허용
  map.keyboard.disable();
  const rec = { map, host, ready: false, on: false, spec };
  map.on('load', () => { rec.ready = true; });
  return rec;
}
function satStyle(detUrl, color) {
  return {
    version: 8,
    sources: {
      vsat: {
        type: 'raster',
        tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'],
        tileSize: 256, minzoom: 5, maxzoom: 19, attribution: 'V-World 위성영상',
      },
      det: { type: 'geojson', data: detUrl },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#06080b' } },
      { id: 'sat', type: 'raster', source: 'vsat' },
      // 탐지는 후보다 — 신뢰도로 감쇠시키되 삭제하지 않는다(카피덱 §4 "감쇠").
      { id: 'det-f', type: 'fill', source: 'det',
        paint: { 'fill-color': color,
          'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'conf'], 0.6], 0.05, 0.12, 0.7, 0.5] } },
      { id: 'det-l', type: 'line', source: 'det',
        paint: { 'line-color': color, 'line-width': 1,
          'line-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'conf'], 0.6], 0.05, 0.25, 0.7, 0.95] } },
      // 광역 줌에서 폴리곤은 1px 이하로 사라진다. 그 구간에서는 점으로 읽힌다 —
      // 개수를 세는 화면이지 형상을 보는 화면이 아니기 때문이다.
      { id: 'det-p', type: 'circle', source: 'det',
        paint: {
          'circle-color': color,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 13, 3, 15, 0],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.85, 14, 0.5, 15, 0],
          'circle-stroke-width': 0,
        } },
    ],
  };
}

// 각 인계의 트랙 구간(vh). #1 은 레그 06 의 마지막 0.10vh + 씸 절반, #2 는 끝까지.
let BAND_N = [0, 0], BAND_Y = [0, 0];
function handoff(t) {
  if (reduce) return;
  // #1 남원 — 레그 06 끝
  if (!PLATES[0] && t > BAND_N[0] - 1.2) {
    PLATES[0] = makePlate(M.handoff, el.mapN, el.plateN,
      satStyle(M.handoff.detections, '#00D3A7'));
  }
  // #2 여수 — 필름 최종 프레임
  if (!PLATES[1] && t > BAND_Y[0] - 1.2) {
    PLATES[1] = makePlate(M.handoffFinal, el.mapY, el.plateY,
      satStyle(M.handoffFinal.detections, '#FF9A2E'));
  }
  gate(PLATES[0], t >= BAND_N[0] && t <= BAND_N[1]);
  gate(PLATES[1], t >= BAND_Y[0]);
}
function gate(rec, want) {
  if (!rec) return;
  const on = want && rec.ready;
  if (on === rec.on) return;
  rec.on = on;
  rec.host.classList.toggle('is-on', on);
  rec.host.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (on) rec.map.scrollZoom.enable(); else rec.map.scrollZoom.disable();
  if (on) rec.map.resize();
}

/* ── 재생 보증 — 프레임이 실제로 그려진 클립만 포스터를 덮게 한다 ─────────────
   엔진은 'seeked' 가 오지 않는 기기(iOS 무재생 클립)를 위해 2.5초 타이머로도
   클립을 드러낸다. 그 타이머가 디코드보다 먼저 오면 검은 프레임이 한 번 스친다.
   requestVideoFrameCallback 이 있는 브라우저에서는 "진짜 그려진 프레임"을 직접
   확인할 수 있으므로, 그때까지 포스터를 붙잡아 둔다. */
function guardPaint() {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
  document.documentElement.classList.add('sb-rvfc');
  el.root.querySelectorAll('[data-sc-segment] video').forEach(v => {
    const tick = () => {
      v.classList.add('sb-painted');
      v.requestVideoFrameCallback(tick);
    };
    v.requestVideoFrameCallback(tick);
  });
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
  SEAM = M.seam || 0.16;

  let run = 0;
  cum = M.legs.map(L => { const a = run; run += L.weightVh; return [a, run]; });
  total = run;
  linger = Array.from(el.root.querySelectorAll('[data-sc-segment]'),
    s => parseFloat(s.getAttribute('data-sc-linger')) || 0);

  // 인계 구간 — #1 은 레그 06 의 마지막 0.10vh 부터 다음 씸의 절반까지,
  //             #2 는 마지막 레그의 마지막 0.28vh 부터 끝까지.
  const hi = M.handoff.legIndex;
  BAND_N = [cum[hi][1] - 0.14, cum[hi][1] + SEAM / 4];
  const fi = M.handoffFinal.legIndex;
  BAND_Y = [cum[fi][1] - 0.28, total];

  buildRail();

  // 엔진 마운트. 이 한 줄 아래로는 재생헤드·크로스페이드·로딩이 전부 엔진 소관이다.
  window.ScrollCraft.mount(document);
  guardPaint();

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
    camera: () => {
      const live = PLATES.find(r => r && r.on);
      return live ? { lng: live.spec.center[0], lat: live.spec.center[1],
        alt: live.spec.altitudeM, pitch: live.spec.pitch, bearing: live.spec.bearing } : camAt(trackVh());
    },
    spacerVh: () => total + 1,
    bands: () => ({ namwon: BAND_N, yeosu: BAND_Y, total }),
    plate: i => {
      const r = PLATES[i];
      if (!r) return null;
      const c = r.map.getCenter();
      return { on: r.on, ready: r.ready, center: [c.lng, c.lat],
        zoom: r.map.getZoom(), pitch: r.map.getPitch(), bearing: r.map.getBearing() };
    },
    handoffActive: () => PLATES.some(r => r && r.on),
    ready: true,
  };
  document.documentElement.classList.add('sb-ready');
};

boot().catch(e => { console.error('[scrub] boot failed', e); });
