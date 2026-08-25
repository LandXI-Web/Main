/* scrollcam.js — 스크롤 구동 카메라 레일 (SPIKE)
   ------------------------------------------------------------------
   목표: 스크롤 진행값 p(0–1) 하나가 카메라를 구동하되, "키프레임 사이를 선형으로 잇는
   목록"이 아니라 **한 대의 카메라가 관성을 갖고 움직이는 궤도**가 되게 한다.

   설계 원칙 (전부 이유가 있다):
   1. 스무딩은 **카메라 공간이 아니라 진행값 공간**에서 한다. 카메라를 lerp 하면
      코너가 잘려 레일에서 이탈한다. p 를 lerp 하면 카메라는 항상 레일 위에 있고
      다만 **시간상 뒤처질** 뿐이다. 되감기·게이트·자동재생이 전부 이 한 가지 규칙에서 나온다.
   2. 정지하면 정말 정지한다. |Δp| 가 임계 이하로 떨어지면 스냅하고 apply 자체를 건너뛴다.
      (매 프레임 jumpTo 를 계속 호출하면 부동소수 잔떨림이 화면에 남는다.)
   3. 줌은 이미 log2(scale) 이다. 선형 보간 = 로그 공간 보간 = 초당 일정 배율.
      대신 **중심 이동을 줌으로 재매개변수화**한다(screenSpace). 높이 있을 때 이동을
      끝내고 낮은 곳에서는 수직 강하 — van Wijk 플라이의 감각을 스크럽으로 옮긴 것.
   4. 글로브 스케일에서는 중심 보간이 대권(great-circle)이어야 한다. 줌으로
      구면 해와 평면 해를 섞는다(둘의 차이가 사라지는 구간에서 교차하므로 이음매가 없다).

   의존성: 없음(옵션으로 window.gsap.parseEase 사용). Lenis/ScrollTrigger 는 호스트가 소유한다.
*/

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => clamp(x, 0, 1);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };

/* ── 이징 ────────────────────────────────────────────────────────────
   camera.js 와 같은 이름을 쓴다(gsap 이 있으면 gsap.parseEase 로 완전 동일).
   gsap 없이도 동작해야 테스트가 가능하므로 내장 근사를 함께 둔다. */
const EASE_CACHE = new Map();
const BASE = {
  power1: (x) => x, power2: (x) => x * x, power3: (x) => x * x * x, power4: (x) => x * x * x * x,
  quad: (x) => x * x, cubic: (x) => x ** 3, quart: (x) => x ** 4, quint: (x) => x ** 5,
  expo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  sine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  circ: (x) => 1 - Math.sqrt(Math.max(0, 1 - x * x)),
  back: (x) => 2.70158 * x * x * x - 1.70158 * x * x,
};
// power1 은 gsap 에서 x^1 이 아니라 x^1(=linear)이 맞다. in/out/inOut 래핑만 다르다.
BASE.power1 = (x) => x;

function bezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const cx = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const dx = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {          // Newton
      const d = dx(t, x1, x2); if (Math.abs(d) < 1e-6) break;
      t -= (cx(t, x1, x2) - x) / d;
    }
    t = clamp01(t);
    let lo = 0, hi = 1;                     // 이분 보정
    for (let i = 0; i < 12 && Math.abs(cx(t, x1, x2) - x) > 1e-5; i++) {
      if (cx(t, x1, x2) < x) lo = t; else hi = t; t = (lo + hi) / 2;
    }
    return cx(t, y1, y2);
  };
}

export function parseEase(e) {
  if (typeof e === 'function') return e;
  if (Array.isArray(e) && e.length === 4) return bezier(e[0], e[1], e[2], e[3]);
  const name = e || 'none';
  if (name === 'none' || name === 'linear') return (x) => x;
  if (EASE_CACHE.has(name)) return EASE_CACHE.get(name);
  let fn = null;
  if (typeof window !== 'undefined' && window.gsap && window.gsap.parseEase) {
    try { fn = window.gsap.parseEase(name) || null; } catch { fn = null; }
  }
  if (!fn) {
    const m = /^([a-z0-9]+)(?:\.(in|out|inOut))?$/i.exec(name);
    const base = m && BASE[m[1]];
    if (!base) fn = (x) => x;
    else {
      const dir = (m[2] || 'out');
      fn = dir === 'in' ? base
        : dir === 'out' ? (x) => 1 - base(1 - x)
        : (x) => (x < 0.5 ? base(2 * x) / 2 : 1 - base(2 - 2 * x) / 2);
    }
  }
  EASE_CACHE.set(name, fn);
  return fn;
}

/* ── 구면 <-> 벡터 ──────────────────────────────────────────────── */
const toVec = (lng, lat) => {
  const a = lng * D2R, b = lat * D2R, c = Math.cos(b);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(b)];
};
const toLL = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [Math.atan2(v[1] / l, v[0] / l) * R2D, Math.asin(clamp(v[2] / l, -1, 1)) * R2D];
};

/* ── Catmull-Rom (구심 매개변수화, α=0.5) ────────────────────────────
   구심 CR 은 첨점·자기교차가 없다는 것이 증명되어 있다. 균일 CR 은 키프레임
   간격이 불규칙하면 홀드 직후 카메라가 밖으로 튀었다 돌아온다 — 실제로 그렇게 보인다. */
function spline(pts, dim) {
  const n = pts.length, kn = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    let d = 0; for (let j = 0; j < dim; j++) { const q = pts[i][j] - pts[i - 1][j]; d += q * q; }
    kn[i] = kn[i - 1] + Math.max(1e-6, Math.pow(Math.sqrt(d), 0.5));
  }
  return { pts, kn, dim, n };
}
const refl = (a, b, dim) => { const o = new Array(dim); for (let j = 0; j < dim; j++) o[j] = 2 * a[j] - b[j]; return o; };

function crEval(S, i, u, tension, out) {
  const { pts, kn, dim, n } = S;
  const p1 = pts[i], p2 = pts[i + 1], t1 = kn[i], t2 = kn[i + 1];
  const p0 = i > 0 ? pts[i - 1] : refl(p1, p2, dim);
  const t0 = i > 0 ? kn[i - 1] : t1 - (t2 - t1 || 1e-6);
  const p3 = i + 2 < n ? pts[i + 2] : refl(p2, p1, dim);
  const t3 = i + 2 < n ? kn[i + 2] : t2 + (t2 - t1 || 1e-6);
  const dt = t2 - t1;
  const uu = u * u, uuu = uu * u;
  const h00 = 2 * uuu - 3 * uu + 1, h10 = uuu - 2 * uu + u, h01 = -2 * uuu + 3 * uu, h11 = uuu - uu;
  let chord = 0; for (let j = 0; j < dim; j++) { const q = p2[j] - p1[j]; chord += q * q; }
  const live = tension > 0 && chord > 1e-18;
  for (let j = 0; j < dim; j++) {
    let m1 = 0, m2 = 0;
    if (live) {
      m1 = tension * ((p2[j] - p0[j]) / Math.max(1e-9, t2 - t0)) * dt;
      m2 = tension * ((p3[j] - p1[j]) / Math.max(1e-9, t3 - t1)) * dt;
    }
    out[j] = h00 * p1[j] + h10 * m1 + h01 * p2[j] + h11 * m2;
  }
  return out;
}

/* ── 레일 ────────────────────────────────────────────────────────── */
const DEF = {
  lerp: 0.10,          // 정지 상태의 기본 추종 계수 (0.08–0.12)
  lerpFast: 0.24,      // 빠른 스크롤일 때 — 지연을 줄인다
  velRef: 0.006,       // 프레임당 Δp 가 이 값이면 lerpFast 에 도달
  rest: 1.2e-5,        // 이 이하면 스냅하고 apply 를 건너뛴다 (정지 시 잔떨림 0)
  tension: 1,          // 0 = 완전 선형(camera.js 호환), 1 = Catmull-Rom
  screenSpace: true,   // 중심 이동을 2^-zoom 으로 재매개변수화
  globeZoom: [3.5, 6.5], // 이 구간에서 대권 해 → 평면 해로 교차
  maxPitch: 85,
  gatePenalty: 0.22,   // 게이트가 닫히면 추종 계수에 곱하는 값
  gateMaxMs: 1500,     // 이보다 오래 막히면 페널티를 되돌린다 (데드락 금지)
  gateReleaseMs: 800,
  magnet: { enabled: true, radius: 0.016, idleMs: 160, duration: 900 },
  reducedMotion: 'auto',
};

export function createRail(opts = {}) {
  const o = { ...DEF, ...opts, magnet: { ...DEF.magnet, ...(opts.magnet || {}) } };
  const KEYS = (opts.keyframes || []).map((k) => ({
    p: k.p,
    c: (k.center || k.c).slice(),
    z: k.zoom != null ? k.zoom : k.z,
    t: (k.pitch != null ? k.pitch : k.t) || 0,
    b: (k.bearing != null ? k.bearing : k.b) || 0,
    e: k.ease || k.e || 'none',
    hold: k.hold || 0,
    turn: k.turn || 0,   // ±1 이면 회전 방향을 강제한다(최단호 무시)
    label: k.label || '',
  })).sort((a, b) => a.p - b.p);
  if (KEYS.length < 2) throw new Error('scrollcam: 키프레임이 2개 이상 필요하다');

  const N = KEYS.length;
  const reduced = o.reducedMotion === true
    || (o.reducedMotion === 'auto' && typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 경도 언랩 — 연속 키프레임이 항상 최단호를 타게 한다(날짜변경선 안전). */
  const lngU = new Float64Array(N);
  lngU[0] = KEYS[0].c[0];
  for (let i = 1; i < N; i++) {
    let d = KEYS[i].c[0] - KEYS[i - 1].c[0];
    d = ((d % 360) + 540) % 360 - 180;
    lngU[i] = lngU[i - 1] + d;
  }
  const S_PLANE = spline(KEYS.map((k, i) => [lngU[i], k.c[1]]), 2);
  const S_SPHERE = spline(KEYS.map((k) => toVec(k.c[0], k.c[1])), 3);

  /* 베어링 누적 — 최단호(또는 turn 강제). */
  const bearU = new Float64Array(N);
  bearU[0] = KEYS[0].b;
  for (let i = 1; i < N; i++) {
    let d = KEYS[i].b - KEYS[i - 1].b;
    d = ((d % 360) + 540) % 360 - 180;
    if (KEYS[i].turn > 0 && d < 0) d += 360;
    if (KEYS[i].turn < 0 && d > 0) d -= 360;
    bearU[i] = bearU[i - 1] + d;
  }

  /* 화면 속도 재매개변수화 테이블.
     df/dk ∝ 2^-z(k) → 높은 곳에서 이동을 끝내고 낮은 곳에서는 수직으로 내려온다.
     Δz 가 작은 구간은 항등이므로 테이블을 만들지 않는다(계산·기억 낭비). */
  const M = 32;
  const WARP = new Array(N - 1).fill(null);
  if (o.screenSpace) {
    for (let i = 0; i < N - 1; i++) {
      const a = KEYS[i], b = KEYS[i + 1];
      const dz = Math.abs(b.z - a.z);
      const moves = Math.hypot(lngU[i + 1] - lngU[i], b.c[1] - a.c[1]) > 1e-6;
      if (dz < 1.5 || !moves) continue;
      const cum = new Float64Array(M + 1);
      for (let m = 1; m <= M; m++) {
        const k0 = (m - 1) / M, k1 = m / M;
        const z0 = a.z + (b.z - a.z) * k0, z1 = a.z + (b.z - a.z) * k1;
        cum[m] = cum[m - 1] + (Math.pow(2, -z0) + Math.pow(2, -z1)) * 0.5 / M;
      }
      const tot = cum[M] || 1;
      for (let m = 0; m <= M; m++) cum[m] /= tot;
      WARP[i] = cum;
    }
  }
  const warpAt = (i, k) => {
    const w = WARP[i]; if (!w) return k;
    const x = clamp01(k) * M, m = Math.min(M - 1, Math.floor(x)), f = x - m;
    return w[m] + (w[m + 1] - w[m]) * f;
  };

  const segOf = (p) => {
    let lo = 0, hi = N - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (KEYS[mid].p <= p) lo = mid; else hi = mid - 1; }
    return lo;
  };

  const tmp2 = [0, 0], tmp3 = [0, 0, 0];

  /* 순수 함수 — p → 카메라. 테스트/마이그레이션의 접점이다. */
  function at(p) {
    p = clamp01(p);
    const i = segOf(p), a = KEYS[i], b = KEYS[i + 1];
    const span = b.p - a.p || 1;
    const raw = clamp01((p - a.p - a.hold) / Math.max(1e-6, span - a.hold));
    const k = parseEase(a.e)(raw);
    const zoom = a.z + (b.z - a.z) * k;
    const kc = o.screenSpace ? warpAt(i, k) : k;
    crEval(S_PLANE, i, kc, o.tension, tmp2);
    const w = 1 - smoothstep(o.globeZoom[0], o.globeZoom[1], zoom);   // 1 = 구면
    let lng, lat;
    if (w > 0.001) {
      crEval(S_SPHERE, i, kc, o.tension, tmp3);
      const ll = toLL(tmp3);
      // 언랩된 평면 해와 각도를 맞춘다(구면 해는 항상 -180..180 으로 돌아온다).
      const turns = Math.round((tmp2[0] - ll[0]) / 360);
      lng = tmp2[0] + (ll[0] + turns * 360 - tmp2[0]) * w;
      lat = tmp2[1] + (ll[1] - tmp2[1]) * w;
    } else { lng = tmp2[0]; lat = tmp2[1]; }
    return {
      center: [((lng + 180) % 360 + 360) % 360 - 180, clamp(lat, -85.05, 85.05)],
      zoom,
      pitch: clamp(a.t + (b.t - a.t) * k, 0, o.maxPitch),
      bearing: bearU[i] + (bearU[i + 1] - bearU[i]) * k,
      seg: i, segT: k,
    };
  }

  /* ── 챕터 ── */
  const CH = (opts.chapters || []).slice().sort((a, b) => a.at - b.at);
  let chIdx = -1;
  const chapterFor = (p) => { let r = -1; for (let i = 0; i < CH.length; i++) if (p >= CH[i].at - 1e-9) r = i; return r; };

  /* ── 상태 ── */
  let pT = 0, pS = 0, pPrev = 0, vel = 0;
  let raf = 0, last = 0, running = false;
  let gated = false, gateSince = 0, gateRelease = 0;
  let lastInput = 0, inputPending = 0, driving = null, magnetArmed = -1, magnetFired = -1;
  const subs = new Set();
  if (typeof opts.apply === 'function') subs.add(opts.apply);

  /* ── 계측 ── */
  const met = {
    frames: 0, fps: 0, fpsEMA: 0, worst: 0, dropped: 0,
    lat: [], jitZ: 0, jitB: 0, jitC: 0, jitFrames: 0,
    gateMs: 0, gateFrames: 0, applies: 0, skipped: 0,
  };
  let restSince = 0, lastApplied = null;

  function fire(state) {
    met.applies++;
    for (const f of subs) { try { f(state); } catch (e) { console.error('scrollcam apply', e); } }
  }

  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    met.frames++;
    const fps = 1000 / dt;
    met.fpsEMA = met.fpsEMA ? met.fpsEMA * 0.92 + fps * 0.08 : fps;
    met.fps = met.fpsEMA;
    if (dt > 24) met.dropped++;
    if (dt > met.worst) met.worst = dt;

    // 자동재생
    if (driving) {
      const q = clamp01((now - driving.t0) / driving.ms);
      pT = driving.from + (driving.to - driving.from) * driving.ease(q);
      if (q >= 1) { const d = driving; driving = null; d.done && d.done(); }
    }

    // 속도 (진행값/프레임, 60fps 기준으로 정규화)
    const dv = Math.abs(pT - pPrev) * (16.7 / dt);
    vel = vel * 0.7 + dv * 0.3;
    pPrev = pT;

    // 게이트 — 타일이 아직이면 진행을 늦춘다(흐린 화면 대신 느린 화면).
    let pen = 1;
    if (o.gate) {
      let ok = true;
      try { ok = !!o.gate(); } catch { ok = true; }
      if (!ok) {
        if (!gated) { gated = true; gateSince = now; }
        met.gateMs += dt; met.gateFrames++;
        const held = now - gateSince;
        pen = held > o.gateMaxMs
          ? o.gatePenalty + (1 - o.gatePenalty) * clamp01((held - o.gateMaxMs) / o.gateReleaseMs)
          : o.gatePenalty;
      } else if (gated) { gated = false; gateRelease = now; }
      // 게이트가 열린 직후 급가속하지 않도록 200ms 완만히 회복
      if (!gated && gateRelease && now - gateRelease < 200) pen = o.gatePenalty + (1 - o.gatePenalty) * ((now - gateRelease) / 200);
    }

    // 진행값 추종 — 프레임률 독립, 속도 인지
    const base = o.lerp + (o.lerpFast - o.lerp) * clamp01(vel / o.velRef);
    const kk = reduced ? 1 : clamp01(1 - Math.pow(1 - base * pen, dt / 16.7));
    const dP = pT - pS;
    let moved = true;
    if (Math.abs(dP) < o.rest) {
      if (pS !== pT) { pS = pT; } else { moved = false; }
    } else pS += dP * kk;

    // 자석 — 정지했고 챕터 근처면 스크롤 자체를 부드럽게 끌어당긴다.
    const idle = now - lastInput;
    if (o.magnet.enabled && !reduced && !driving && o.scrollTo && idle > o.magnet.idleMs && vel < 0.0004) {
      let best = -1, bd = o.magnet.radius;
      for (let i = 0; i < CH.length; i++) { const d = Math.abs(pT - CH[i].at); if (d < bd) { bd = d; best = i; } }
      if (best >= 0 && best !== magnetFired && bd > 0.0006) {
        magnetFired = best; magnetArmed = best;
        try { o.scrollTo(CH[best].at, o.magnet.duration); } catch { /* 호스트 없음 */ }
      } else if (best < 0) magnetFired = -1;
    }
    if (o.magnet.enabled && magnetFired >= 0 && Math.abs(pT - CH[magnetFired].at) > o.magnet.radius * 1.6) magnetFired = -1;

    // 챕터 콜백
    const ci = chapterFor(pS);
    if (ci !== chIdx) { chIdx = ci; opts.onChapter && ci >= 0 && opts.onChapter(ci, CH[ci], pS); }

    if (moved || lastApplied === null) {
      const st = at(pS);
      st.p = pS; st.pTarget = pT; st.velocity = vel; st.gated = gated;
      st.instant = reduced; st.chapter = ci; st.dt = dt; st.atRest = !moved;
      // 잔떨림 계측 — 정지 상태에서 카메라 값이 흔들리는지
      if (vel < 1e-5 && lastApplied) {
        if (restSince && now - restSince > 400) {
          met.jitFrames++;
          met.jitZ = Math.max(met.jitZ, Math.abs(st.zoom - lastApplied.zoom));
          met.jitB = Math.max(met.jitB, Math.abs(st.bearing - lastApplied.bearing));
          met.jitC = Math.max(met.jitC, Math.abs(st.center[0] - lastApplied.center[0]) + Math.abs(st.center[1] - lastApplied.center[1]));
        }
        if (!restSince) restSince = now;
      } else restSince = 0;
      // 입력 → 카메라 지연
      if (inputPending) { met.lat.push(now - inputPending); if (met.lat.length > 400) met.lat.shift(); inputPending = 0; }
      lastApplied = st;
      fire(st);
    } else { met.skipped++; if (inputPending) { met.lat.push(now - inputPending); inputPending = 0; } }

    raf = requestAnimationFrame(frame);
  }

  /* ── 입력 (키보드/휠/터치 동등) ─────────────────────────────────
     실제 스크롤은 호스트(Lenis)가 소유한다. 레일은 (a) 입력 시각을 찍어 지연을 재고,
     (b) 자동재생과 자석을 취소하고, (c) 키보드를 같은 scrollTo 경로로 흘려보낸다. */
  function markInput(now) {
    lastInput = now == null ? performance.now() : now;
    if (!inputPending) inputPending = lastInput;
    if (driving) { driving = null; }
    magnetFired = -1;
  }

  const onWheel = () => markInput();
  const onTouch = () => markInput();
  const onKey = (ev) => {
    const step = o.keyStep || 0.055;
    let to = null, dur = 620;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      if (!CH.length) return;
      const eps = 0.006;
      if (ev.key === 'ArrowRight') { to = 1; for (const c of CH) if (c.at > pT + eps) { to = c.at; break; } }
      else { to = 0; for (let i = CH.length - 1; i >= 0; i--) if (CH[i].at < pT - eps) { to = CH[i].at; break; } }
      dur = 1100;
    } else if (ev.key === 'ArrowDown' || ev.key === 'PageDown' || ev.key === ' ') { to = pT + step * (ev.key === 'ArrowDown' ? 1 : 2.4); }
    else if (ev.key === 'ArrowUp' || ev.key === 'PageUp') { to = pT - step * (ev.key === 'ArrowUp' ? 1 : 2.4); }
    else if (ev.key === 'Home') { to = 0; dur = 1400; }
    else if (ev.key === 'End') { to = 1; dur = 1400; }
    else return;
    ev.preventDefault();
    markInput();
    to = clamp01(to);
    if (reduced) { const c = nearestChapter(to); o.scrollTo && o.scrollTo(c, 0); return; }
    o.scrollTo && o.scrollTo(to, dur);
  };
  const nearestChapter = (p) => {
    if (!CH.length) return p;
    let best = CH[0].at, bd = Infinity;
    for (const c of CH) { const d = Math.abs(p - c.at); if (d < bd) { bd = d; best = c.at; } }
    return best;
  };

  function bindInput(target) {
    const t = target || window;
    t.addEventListener('wheel', onWheel, { passive: true });
    t.addEventListener('touchstart', onTouch, { passive: true });
    t.addEventListener('touchmove', onTouch, { passive: true });
    t.addEventListener('pointerdown', onTouch, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      t.removeEventListener('wheel', onWheel);
      t.removeEventListener('touchstart', onTouch);
      t.removeEventListener('touchmove', onTouch);
      t.removeEventListener('pointerdown', onTouch);
      window.removeEventListener('keydown', onKey);
    };
  }
  const unbind = opts.bindInput === false ? () => {} : bindInput(opts.inputTarget);

  const api = {
    KEYS, CHAPTERS: CH, at, reduced,
    /* 호스트(ScrollTrigger)가 매 스크롤마다 호출한다. */
    setProgress(p) { pT = clamp01(p); },
    /* 즉시 이동 — 스무딩을 건너뛴다. */
    seek(p) { pT = pS = pPrev = clamp01(p); vel = 0; driving = null; lastApplied = null; },
    /* 자동재생. 입력이 들어오면 pause() 로 취소된다. */
    play(from, to, ms = 6000, ease = 'power2.inOut') {
      return new Promise((done) => {
        if (reduced) { api.seek(to); done(); return; }
        driving = { from: clamp01(from), to: clamp01(to), ms, t0: performance.now(), ease: parseEase(ease), done };
        pT = clamp01(from);
      });
    },
    pause() { driving = null; magnetFired = -1; },
    isPlaying: () => !!driving,
    markInput,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    start() { if (!running) { running = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    destroy() { api.stop(); unbind(); subs.clear(); },
    get progress() { return pS; },
    get target() { return pT; },
    get velocity() { return vel; },
    get gatedNow() { return gated; },
    metrics() {
      const l = met.lat.slice().sort((a, b) => a - b);
      const q = (f) => (l.length ? l[Math.min(l.length - 1, Math.floor(l.length * f))] : 0);
      return {
        fps: +met.fps.toFixed(1), frames: met.frames, dropped: met.dropped, worstFrameMs: +met.worst.toFixed(1),
        latency: { n: l.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(l[l.length - 1] || 0).toFixed(1) },
        jitter: { zoom: met.jitZ, bearing: met.jitB, center: met.jitC, frames: met.jitFrames },
        gate: { ms: Math.round(met.gateMs), frames: met.gateFrames },
        applies: met.applies, skipped: met.skipped,
      };
    },
    resetMetrics() {
      Object.assign(met, { frames: 0, fps: 0, fpsEMA: 0, worst: 0, dropped: 0, lat: [], jitZ: 0, jitB: 0, jitC: 0, jitFrames: 0, gateMs: 0, gateFrames: 0, applies: 0, skipped: 0 });
      restSince = 0;
    },
    setOption(k, v) { if (k === 'magnet') Object.assign(o.magnet, v); else o[k] = v; if (k === 'tension') lastApplied = null; },
    options: o,
  };
  return api;
}

/* ── MapLibre 어댑터 ──────────────────────────────────────────────
   jumpTo 는 easeTo/flyTo 와 달리 애니메이션 루프를 만들지 않는다 — 스크럽에서는 이것만 쓴다.
   값이 바뀌지 않았으면 호출조차 하지 않는다(정지 시 GPU 를 0 으로 만든다). */
export function mapApply(map, extra) {
  let last = null;
  return (s) => {
    const pad = extra && extra.padding ? extra.padding() : undefined;
    if (last && s.atRest
      && Math.abs(last.zoom - s.zoom) < 1e-4 && Math.abs(last.bearing - s.bearing) < 1e-3
      && Math.abs(last.center[0] - s.center[0]) < 1e-7 && Math.abs(last.center[1] - s.center[1]) < 1e-7
      && Math.abs(last.pitch - s.pitch) < 1e-3) return;
    last = { zoom: s.zoom, bearing: s.bearing, pitch: s.pitch, center: s.center.slice() };
    map.jumpTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing, padding: pad });
  };
}

/* ── Lenis 어댑터 — p(0–1) ↔ 스크롤 픽셀 ─────────────────────────── */
export function lenisScroller(lenis, scrollerEl) {
  const max = () => Math.max(1, (scrollerEl || document.documentElement).scrollHeight - innerHeight);
  return (p, ms) => {
    const y = clamp01(p) * max();
    if (!ms) { lenis.scrollTo(y, { immediate: true, force: true, lock: true }); return; }
    lenis.scrollTo(y, { duration: ms / 1000, easing: (t) => 1 - Math.pow(1 - t, 4), lock: false, force: true });
  };
}
