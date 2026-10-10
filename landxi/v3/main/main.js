/* 게스트 메인 — 토스식 7장 + 마감. 지도는 하나(K3)만 만들고, 챕터마다 '창'의 자리와 카메라만 스크롤에 묶는다.
   트랙 A(sticky 판 하나): ch0 히어로(지구) → ch1 전국 차오름 → ch2 필지 카드 → ch3 XI ChatGEO 세 물음(지도 → 읍면동 통계 → 보고서 초안 · 반전)
   ch4 서비스 카드(흐름 구간 · 지도 없음)
   트랙 B(sticky 판 하나): ch5 전국 배포 점 → ch6 키르기스스탄 → 마감(지구 귀환)
   규칙: 한 화면에 움직이는 것 1개 · 헤드라인 750 --e-cam 스태거 120 · 숫자는 봉투만 · 지역 이름은 데이터에서(하드코딩 0). */
import { createStage, bignum, numHtml, serviceGrid, joinCards, empty, mountCmdk, enter, bars } from '../kit/index.js';
import { E_CAM, RM, h, esc } from '../kit/util.js';
import { devlog } from '../kit/dev-drawer.js';
import * as D from './data.js';
import { loadSummary, itemFor, stageKey, scaleOf, userWords } from '../service-detail/summary.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (x, a, b) => clamp((x - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => E_CAM(clamp(t));
const NARROW = matchMedia('(max-width: 960px)').matches;
const LOW = !!((navigator.deviceMemory && navigator.deviceMemory < 4) || navigator.connection?.saveData);
const DEV = new URLSearchParams(location.search).has('dev');
const KOREA = [124.6, 33.1, 130.95, 38.62];

/* ── 트랙(화면 단위 길이) ─────────────────────────────── */
const T = {
  A: { el: $('#trackA'), frame: $('#frameA'), segs: [2.5, 4, 4, 4.5], x: 0, tx: 0 },
  B: { el: $('#trackB'), frame: $('#frameB'), segs: [3, 3.5, 2.5], x: 0, tx: 0 },
};
for (const k in T) { const t = T[k]; let acc = 0; t.at = t.segs.map((s) => { const a = acc; acc += s; return a; }); t.sum = acc; }
function sizeTracks() { for (const k in T) T[k].el.style.height = (T[k].sum + 1) * innerHeight + 'px'; }
sizeTracks();

/* ── 창 자리(뷰포트 좌표 · 판이 붙어 있을 때) ─────────────────── */
function L() {
  const W = innerWidth, H = innerHeight, m = W <= 640, M = m ? 20 : 48;
  const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--mast')) || 64;   // 마스트 높이(main.css .m --mast 한 곳)
  return {
    W, H, m,
    full: { x: 0, y: top, w: W, h: H - top, r: 0 },
    hero: m ? { x: M, y: Math.round(H * 0.47), w: W - 2 * M, h: Math.round(H * 0.53) - M, r: 24 } : { x: Math.round(W * 0.5), y: top + 32, w: Math.round(W * 0.5) - M, h: H - top - 32 - M, r: 24 },
    right: m ? { x: M, y: Math.round(H * 0.5), w: W - 2 * M, h: Math.round(H * 0.5) - M, r: 24 } : { x: Math.round(W * 0.46), y: top + 32, w: Math.round(W * 0.54) - M, h: H - top - 32 - M, r: 24 },
    fin: m ? { x: M, y: top + 16, w: W - 2 * M, h: Math.round(H * 0.5), r: 24 } : { x: M, y: top + 32, w: W - 2 * M, h: H - top - 32 - 250, r: 24 },
    // 흰 카드가 덮는 자리(지도 초점은 그 밖에)
    card: m ? { top: Math.round(H * 0.4), left: 24, right: 24, bottom: 40 } : { top: 72, left: 440 + 48 + 72, right: 72, bottom: 72 },
    none: { top: 40, left: 40, right: 40, bottom: 40 },
  };
}
let LY = L();
const lerpRect = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r, b.r, t) });
const lerpPad = (a, b, t) => ({ top: lerp(a.top, b.top, t), left: lerp(a.left, b.left, t), right: lerp(a.right, b.right, t), bottom: lerp(a.bottom, b.bottom, t) });

/* ── 메르카토르 도우미(맞춤 줌 · 중심 보간) ─────────────────── */
const mx = (lng) => (lng + 180) / 360;
const my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const ilng = (x) => x * 360 - 180;
const ilat = (y) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;
/** bounds 를 창(win) 안 여백(pad) 영역에 맞추는 줌 */
function fitZoom(b, win, pad, max = 18.5) {
  const aw = Math.max(40, win.w - pad.left - pad.right), ah = Math.max(40, win.h - pad.top - pad.bottom);
  const bw = (mx(b[2]) - mx(b[0])) * 512, bh = (my(b[1]) - my(b[3])) * 512;
  return Math.min(max, Math.log2(Math.min(aw / bw, ah / bh)));
}
const bcenter = (b) => [ilng((mx(b[0]) + mx(b[2])) / 2), ilat((my(b[1]) + my(b[3])) / 2)];
function lerpCam(a, b, t, dip = 0) {
  const x = lerp(mx(a.c[0]), mx(b.c[0]), t), y = lerp(my(a.c[1]), my(b.c[1]), t);
  return { c: [ilng(x), ilat(y)], z: lerp(a.z, b.z, t) - dip * Math.sin(Math.PI * t), p: lerp(a.p || 0, b.p || 0, t), b: lerp(a.b || 0, b.b || 0, t), pad: lerpPad(a.pad, b.pad, t) };
}
/** 목표로 파고드는 줌 — 줌이 높은 쪽 중심을 닻으로 삼고, 그 점의 화면 어긋남이 처음부터 줄어들기만 한다.
    (중심·줌을 따로 선형 보간하면 z10–16 에서 목표와 무관한 땅이 창을 채운다) · 되감기(줌아웃)도 같은 경로. */
const WS = (z) => 512 * Math.pow(2, z);
function zoomCam(a, b, t, k = 2.2) {
  const z = lerp(a.z, b.z, t), inward = b.z >= a.z;
  const lo = inward ? a : b, hi = inward ? b : a, u = inward ? t : 1 - t;
  const f = Math.pow(1 - u, k) * WS(lo.z) / WS(z);
  const x = mx(hi.c[0]) + (mx(lo.c[0]) - mx(hi.c[0])) * f, y = my(hi.c[1]) + (my(lo.c[1]) - my(hi.c[1])) * f;
  return { c: [ilng(x), ilat(y)], z, p: lerp(a.p || 0, b.p || 0, t), b: lerp(a.b || 0, b.b || 0, t), pad: lerpPad(a.pad, b.pad, t) };
}
/** 지구 한 장이 창에 들어오는 줌(위도 보정) */
const globeZoom = (win, lat) => Math.log2((0.86 * Math.min(win.w, win.h)) / ((512 / Math.PI) / Math.cos((lat * Math.PI) / 180)));

/* ── 상태 ─────────────────────────────────────────────── */
const S = { st: null, map: null, data: {}, bn: null, cams: null, t0: performance.now(), last: '', paint: {}, labels: [], noMap: false, veilO: 0, miss: 0, warm: 'no' };
const stageEl = $('#stage'), labelsEl = $('#labels'), bd = $('#bd');

/* 챕터 글 층: pre → in → out */
function chState(el, st) {
  if (!el || el.dataset.st === st) return;
  el.dataset.st = st;
  clearTimeout(el._t);
  if (st === 'in') { el.classList.add('is-on'); el.classList.remove('is-out'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in'))); el.dispatchEvent(new Event('ch:in')); }
  else if (st === 'out') { el.classList.add('is-out'); el.classList.remove('is-in'); el._t = setTimeout(() => el.classList.remove('is-on'), 760); }
  else { el.classList.remove('is-in', 'is-out', 'is-on'); }
}
const band = (p, a, b) => (p < a ? 'pre' : p > b ? 'out' : 'in');
/** 마감 글 상태 — 창(판 기준 좌표)이 LY.fin 에 닿았거나 거의 닿고 글 윗선을 비켜 있을 때만 'in' */
function finState(on, win) {
  const el = $('#fin');
  if (!on || !win || !el) return 'pre';
  const t = S.t7 || 0;
  // 글은 지구 카드 아래 띠에 따로 놓여 있다 — 카드가 다 줄었을 때(t ≥ 0.97)만 켜고, 한 번 켜지면 t < 0.9 까지 유지(떨림 0)
  if (t >= 0.97) return 'in';
  return el.dataset.st === 'in' && t >= 0.9 ? 'in' : 'pre';
}

/* ── 지도 무대(K3) ────────────────────────────────────── */
async function bootStage() {
  if (S.st || S.noMap) return;
  if (!window.maplibregl) { await new Promise((r) => addEventListener('load', r, { once: true })); }
  try {
    S.st = createStage(stageEl, { interactive: false, scale: false, bounds: KOREA });
  } catch (e) { S.noMap = true; devlog('stage', String(e)); missMap(); return; }
  S.map = S.st.map;
  await S.st.ready;
  S.ready = true;
  try { S.map.setProjection({ type: ['interpolate', ['linear'], ['zoom'], 3.6, 'vertical-perspective', 5.4, 'mercator'] }); } catch { /* 평면 유지 */ }
  S.map.on('error', (e) => devlog('map', String(e?.error?.message || e).slice(0, 120)));
  S.veil = h('div.m-veil'); stageEl.append(S.veil);
  addLayers();
  S.last = '';
}
function missMap() {
  for (const w of [$('#winA'), $('#winB')]) { w.style.background = 'var(--bg-0)'; w.style.borderRadius = '24px'; w.append(h('p.m-miss', { text: '지도를 불러오지 못했습니다' })); }
}

/* 데이터 층 — 도착하는 대로 얹는다 */
async function addLayers() {
  const st = S.st; if (!st) return;
  const d = S.data;
  if (d.stats && !st.map.getSource('k-river')) {
    await st.geo('sgg', d.stats.geojson, 'focus');
    await st.geo('river', d.stats.geojson, 'ai');
    await st.geo('sweep', null, 'focus');
    const m = st.map;
    m.setPaintProperty('k-sgg-f', 'fill-opacity', 0); m.setPaintProperty('k-sgg-l', 'line-width', 0.6);
    m.setPaintProperty('k-river-h', 'line-opacity', 0); m.setPaintProperty('k-river-l', 'line-width', 0.6);
    m.setPaintProperty('k-sweep-l', 'line-width', 2); m.setPaintProperty('k-sweep-f', 'fill-opacity', 0);
  }
  if (d.parcel && !st.map.getSource('k-parcel')) {
    const fc = d.parcel.ai_fc;
    await st.geo('ainear', { type: 'FeatureCollection', features: fc.features.filter((f) => !f.properties.in) }, 'ai');
    await st.geo('aiin', { type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.in) }, 'ai');
    await st.geo('parcel', d.parcel.parcel, 'focus');
    st.map.setPaintProperty('k-parcel-l', 'line-width', 2.4);
    st.map.setPaintProperty('k-aiin-f', 'fill-opacity', 0.38);
  }
  if (d.agent && !st.map.getSource('k-emd')) {
    await st.geo('emd', d.agent.emd, 'ai');
    st.map.setPaintProperty('k-emd-h', 'line-opacity', 0);
    st.map.setPaintProperty('k-emd-l', 'line-color', '#FFFFFF');
    st.map.setPaintProperty('k-emd-l', 'line-width', 0.8);
    // 비닐하우스는 동 면(원판 모델 결과)만 — 점 없음(10-09 사용자 "동그라미가 혼란") · 흰 테두리(확대할수록 굵게) · 번지는 테두리 없음
    await st.geo('ghp', d.agent.gh, 'ai');
    st.map.setPaintProperty('k-ghp-l', 'line-color', '#FFFFFF');
    st.map.setPaintProperty('k-ghp-l', 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 1.2]);
  }
  if (d.kgz && !st.map.getSource('k-kgz')) {
    await st.geo('kgz', d.kgz, 'focus');
    st.map.setPaintProperty('k-kgz-l', 'line-width', 1.6);
  }
  S.paint = {}; S.last = '';
}
/* 장면이 이번 프레임에 원하는 값만 켠다 — 나머지 층은 0(다른 장면 층이 새지 않게) */
const LAYERS = [['k-river-f', 'fill-opacity'], ['k-river-l', 'line-opacity'], ['k-river-h', 'line-opacity'], ['k-sweep-l', 'line-opacity'], ['k-sweep-f', 'fill-opacity'],
  ['k-sgg-l', 'line-opacity'], ['k-sgg-f', 'fill-opacity'], ['k-parcel-l', 'line-opacity'], ['k-parcel-f', 'fill-opacity'],
  ['k-aiin-f', 'fill-opacity'], ['k-aiin-l', 'line-opacity'], ['k-aiin-h', 'line-opacity'], ['k-ainear-f', 'fill-opacity'], ['k-ainear-l', 'line-opacity'], ['k-ainear-h', 'line-opacity'],
  ['k-emd-f', 'fill-opacity'], ['k-emd-l', 'line-opacity'], ['k-emd-h', 'line-opacity'], ['k-ghp-f', 'fill-opacity'], ['k-ghp-l', 'line-opacity'], ['k-ghp-h', 'line-opacity'],
  ['k-kgz-l', 'line-opacity'], ['k-kgz-f', 'fill-opacity']];
const want = (id, prop, v) => { S.want[id + '|' + prop] = v; };
function flushLayers() { for (const [id, prop] of LAYERS) op(id, prop, S.want[id + '|' + prop] ?? 0); }
/* 불투명도 — 같은 값이면 건드리지 않는다 */
function op(id, prop, v) {
  const m = S.map; if (!m || !m.getLayer(id)) return;
  const key = id + prop, val = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  const sv = JSON.stringify(val);
  if (S.paint[key] === sv) return;
  S.paint[key] = sv; m.setPaintProperty(id, prop, val);
}

/* ── 카메라 상태(창 · 여백 기준) ───────────────────────── */
function cams() {
  const d = S.data, ly = LY;
  const nat = (pad) => ({ c: bcenter(KOREA), z: fitZoom(KOREA, ly.full, pad, 8), pad });
  const C = {};
  C.nat1 = nat(ly.card);
  C.nat2 = nat(ly.card);
  const pb = d.parcel ? pad2(d.parcel.bbox, 0.9) : [127.215, 35.341, 127.217, 35.343];
  C.parcel = { c: bcenter(pb), z: fitZoom(pb, ly.right, ly.m ? { top: 24, left: 24, right: 24, bottom: 200 } : { top: 60, left: 60, right: 60, bottom: 230 }, 19), pad: ly.m ? { top: 24, left: 24, right: 24, bottom: 200 } : { top: 60, left: 60, right: 60, bottom: 230 } };
  // 넷째 장면 — 질문 카드(창 왼쪽 460)를 비켜 오른쪽에 · 모바일은 카드 아래
  const rb = d.agent ? bboxFC(d.agent.emd) : pb;
  const rpad = ly.m ? { top: Math.round(ly.right.h * 0.62), left: 16, right: 16, bottom: 16 } : { top: 60, left: 500, right: 48, bottom: 40 };
  C.region = { c: bcenter(rb), z: fitZoom(rb, ly.right, rpad, 12), pad: rpad };
  // 비닐하우스가 가장 모인 곳(약 1.5 × 1 km) — 면이 면으로 보이는 크기
  const gb = d.agent?.dense || rb;
  C.gh = { c: bcenter(gb), z: fitZoom(gb, ly.right, rpad, 17), pad: rpad };
  const kb = d.kgz ? bboxFC(d.kgz) : [69.2, 39.2, 80.3, 43.3];
  // 도착 줌은 타일 줌 경계(.5) 바로 아래로 — 도착 순간 타일 한 단계를 통째로 새로 받지 않게(0.2 줌 이내 차이)
  const kz = fitZoom(kb, ly.full, ly.card, 7);
  C.kgz = { c: bcenter(kb), z: kz % 1 >= 0.5 ? Math.floor(kz) + 0.47 : kz, pad: ly.card };
  S.cams = C;
  return C;
}
const pad2 = (b, k) => { const w = (b[2] - b[0]) * k, hh = (b[3] - b[1]) * k; return [b[0] - w, b[1] - hh, b[2] + w, b[3] + hh]; };
function bboxFC(fc) { let a = [180, 90, -180, -90]; const walk = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(walk); }; for (const f of fc.features) walk(f.geometry.coordinates); return a; }
/** 지구(자전) — 서쪽에서 돌아 들어와 한반도를 정면에 두고, 아주 느리게 흔들린다 */
function globe(win, now) {
  const s = (now - S.t0) / 1000;
  const spin = RM() || NARROW || LOW ? 5 * Math.sin(s * 0.26) * (RM() ? 0 : 1) : -58 * (1 - ease(s / 3.4)) + 5 * Math.sin(s * 0.26);
  const lat = 34;
  return { c: [127.8 + spin, lat], z: globeZoom(win, lat), p: 0, b: 0, pad: { top: 0, left: 0, right: 0, bottom: 0 } };
}

/* ── 한 프레임 ─────────────────────────────────────────── */
function frame(now) {
  requestAnimationFrame(frame);
  const H = innerHeight;
  for (const k in T) {
    const t = T[k], r = t.el.getBoundingClientRect();
    t.rect = r;
    t.tx = clamp(-r.top / (r.height - H)) * t.sum;
    t.x = RM() || S.snap ? t.tx : Math.abs(t.tx - t.x) < 0.002 ? t.tx : lerp(t.x, t.tx, 0.14);   // 메뉴로 바로 이동(S.snap) = 지나가는 장면 없이 목적지 상태로
    t.vis = r.top < H && r.bottom > 0;
    t.top = t.frame.getBoundingClientRect().top;   // 판이 붙기 전(+) · 떠난 뒤(−)
  }
  if (S.snap) S.snap--;                            // 바로 이동 뒤 몇 장(스크롤 값이 자리 잡을 때까지)만 목적지에 붙인다
  let win = null, cam = null, bg = '#fff', inv = false;
  S.want = {};
  const C = S.cams || cams();

  /* 트랙 A */
  if (T.A.vis) {
    const x = T.A.x, [a0, a1, a2, a3] = T.A.at;
    const s0 = seg(x, a0, a1), s1 = seg(x, a1, a2), s2 = seg(x, a2, a3), s3 = seg(x, a3, T.A.sum);
    // 글
    chState($('#ch0'), x < a0 + 2.5 * 0.42 ? 'in' : 'out');
    chState($('#ch1'), x < a1 ? 'pre' : band(s1, 0.04, 0.9));
    chState($('#ch2'), x < a2 ? 'pre' : band(s2, 0.2, 0.97));
    chState($('#ch2-card'), x < a2 ? 'pre' : band(s2, 0.44, 0.97));
    chState($('#ch3'), x < a3 ? 'pre' : band(s3, 0.06, 1.01));
    chState($('#ch3-ask'), x < a3 ? 'pre' : band(s3, 0.1, 1.01));
    inv = x >= a3 + 0.1;
    // 창 · 카메라
    if (x < a1) {
      const t = ease(seg(s0, 0.36, 1));
      win = lerpRect(LY.hero, LY.full, t);
      const g = globe(LY.hero, now);
      cam = lerpCam(g, C.nat1, t);
      bg = 'var(--bg-0)';   // 지구 뒤를 화면 바탕과 같은 색으로(흰 칸 없음 · 10-09)
      poster(s0 < 0.42 && !S.live, win);
    } else if (x < a2) {
      S.t2 = 0;
      win = LY.full; cam = C.nat1; bg = 'var(--bg-0)'; poster(false);
      sweep(s1);
    } else if (x < a3) {
      // 필지로 파고드는 동안 이번 줌 위성 타일이 덜 찼으면 잠깐 머문다(흐린 부모 타일이 창을 채우지 않게)
      S.gap = S.map && S.ready ? (S.map.getZoom() > 6.8 ? eoxGap('k-vw', 19) : eoxGap()) : 0;
      S.t2 = gated(S.t2, ease(seg(s2, 0, 0.32)));
      const tw = ease(seg(s2, 0, 0.24)), tc = S.t2;
      win = lerpRect(LY.full, LY.right, tw);
      const pr = { ...C.parcel, p: lerp(0, 38, ease(seg(s2, 0.36, 1))), b: lerp(-12, 14, ease(seg(s2, 0.36, 1))) };
      cam = zoomCam(C.nat1, pr, tc);
      bg = 'var(--bg-0)'; poster(false);
      sweep(1, 1 - seg(s2, 0, 0.12));
      parcelScene(s2);
    } else {
      S.t2 = 1;
      win = LY.right;
      const pr = { ...C.parcel, p: 38, b: 14 };
      // ① 필지 → 남원시 → 비닐하우스가 가장 모인 곳 · ② 다시 남원시(읍면동 통계)
      cam = s3 < 0.24 ? zoomCam(pr, C.region, ease(seg(s3, 0.02, 0.2)))
        : s3 < 0.44 ? zoomCam(C.region, C.gh, ease(seg(s3, 0.26, 0.4)))
          : zoomCam(C.gh, C.region, ease(seg(s3, 0.46, 0.58)));
      bg = 'var(--bg-0)'; poster(false);
      sweep(1, 0);
      parcelScene(1, 1 - seg(s3, 0.02, 0.12));
      askScene(s3);
    }
    placeOnWin('#ch2-card', win, T.A.top);
    placeOnWin('#ch3-ask', win, T.A.top);
    win = { ...win, y: win.y + T.A.top };
    if (!T.B.vis || T.A.rect.bottom > H * 0.5) S.active = 'A';
  }
  /* 트랙 B */
  if (T.B.vis && (!T.A.vis || T.A.rect.bottom <= H * 0.5)) {
    const x = T.B.x, [b0, b1, b2] = T.B.at;
    const s5 = seg(x, b0, b1), s6 = seg(x, b1, b2), s7 = seg(x, b2, T.B.sum);
    chState($('#ch5'), band(s5, 0.02, 0.9));
    chState($('#ch6'), x < b1 ? 'pre' : band(s6, 0.46, 0.96));
    let lab = 0;
    S.gap = eoxGap();
    if (x < b1) {
      S.t6 = 0; S.t7 = 0;
      win = LY.full; cam = C.nat2; bg = 'var(--bg-0)'; lab = seg(s5, 0.06, 0.2) * (1 - seg(s5, 0.92, 1));
      nationOutline(seg(s5, 0, 0.1) * (1 - seg(s5, 0.9, 1)));
    } else if (x < b2) {
      S.t6 = gated(S.t6, ease(seg(s6, 0, 0.5))); S.t7 = 0;
      win = LY.full; cam = lerpCam(C.nat2, C.kgz, S.t6, dipB(C)); bg = '#fff';
      nationOutline(0);
      kgzScene(seg(s6, 0.42, 0.6));
    } else {
      S.t6 = 1; S.t7 = gated(S.t7, ease(seg(s7, 0, 0.55)));
      const t = S.t7;
      win = lerpRect(LY.full, LY.fin, t);
      const g = globe(LY.fin, now);
      cam = lerpCam(C.kgz, g, t, 0);
      bg = '#fff';
      kgzScene(1 - seg(s7, 0, 0.3));
    }
    // 마감 글(모토·문장·로그인)은 스크롤이 아니라 '창 축소'에 묶는다 — 창이 거의 다 줄고(S.t7 ≥ 0.85) 창 아래 끝이 글 윗선보다 위일 때만 켠다.
    // 지도 카드가 큰 동안 글이 카드 위에 겹쳐 보이지 않게(1440 · 390 공통 · 한 번 켜지면 S.t7 < 0.8 까지 유지해 떨림 0)
    chState($('#fin'), finState(x >= b2, win));
    // 판이 아래서 올라오는 동안(위 28% 전)은 무대를 숨겨 두고 그 사이 이동 경로를 데운다 → 그 뒤 서서히 드러낸다
    S.bHide = T.B.top > H * 0.72;
    S.bFade = clamp((H * 0.72 - T.B.top) / (H * 0.3));
    labels(lab * S.bFade);
    fade(0);
    veil((x >= b1 && x < b2 && s6 < 0.56) || (x >= b2 && s7 < 0.6));
    win = { ...win, y: win.y + T.B.top };
    S.active = 'B';
    poster(false);
  } else { labels(0); fade(500); veil(false); }

  if (!T.A.vis && !T.B.vis) win = null;
  if (S.active === 'B' && T.B.vis && S.bHide && (!T.A.vis || T.A.rect.bottom <= H * 0.5)) win = null;
  const so = S.active === 'B' && win ? (S.bFade ?? 1) : 1;
  if (so !== S.so) { S.so = so; stageEl.style.opacity = so >= 1 ? '' : so.toFixed(3); }
  if (!win && S.warm === 'no' && S.ready && T.B.rect.top < 3 * H) warmPath();
  if (!S.live && S.ready) { try { if (S.map.isSourceLoaded('k-eox')) S.live = true; } catch { /* 층 없음 */ } }
  bd.classList.toggle('is-inv', !!(T.A.vis && inv && S.active === 'A'));
  applyWin(win, bg);
  applyCam(cam);
  if (S.map) flushLayers();
}

function applyWin(w, bg) {
  const on = !!w && !S.noMap;
  stageEl.classList.toggle('is-on', on);
  labelsEl.classList.toggle('is-on', on);
  if (!on) return;
  const W = innerWidth, H = innerHeight;
  const clip = `inset(${Math.max(0, w.y).toFixed(1)}px ${(W - w.x - w.w).toFixed(1)}px ${(H - w.y - w.h).toFixed(1)}px ${w.x.toFixed(1)}px round ${w.r.toFixed(1)}px)`;
  if (clip !== S.clip) { S.clip = clip; stageEl.style.clipPath = clip; labelsEl.style.clipPath = clip; }
  if (bg !== S.bg) { S.bg = bg; stageEl.style.background = bg; }
  S.win = w;
}
function camPad(c, w) {
  const W = innerWidth, H = innerHeight;
  const pad = { top: Math.max(0, w.y + c.pad.top), left: Math.max(0, w.x + c.pad.left), right: Math.max(0, W - w.x - w.w + c.pad.right), bottom: Math.max(0, H - w.y - w.h + c.pad.bottom) };
  // 여백이 화면을 다 먹지 않게(작은 창 · 전환 중)
  if (pad.left + pad.right > W - 40) { const k = (W - 40) / (pad.left + pad.right); pad.left *= k; pad.right *= k; }
  if (pad.top + pad.bottom > H - 40) { const k = (H - 40) / (pad.top + pad.bottom); pad.top *= k; pad.bottom *= k; }
  return pad;
}
function applyCam(c) {
  const m = S.map; if (!m || !c || !S.win || S.warming) return;
  const pad = camPad(c, S.win);
  const key = [c.c[0].toFixed(5), c.c[1].toFixed(5), c.z.toFixed(3), (c.p || 0).toFixed(1), (c.b || 0).toFixed(1), Math.round(pad.top), Math.round(pad.left), Math.round(pad.right), Math.round(pad.bottom)].join();
  if (key === S.last) return;
  S.last = key;
  m.jumpTo({ center: c.c, zoom: c.z, pitch: c.p || 0, bearing: c.b || 0, padding: pad });
}
function placeOnWin(sel, w, top) {
  const el = $(sel); if (!el || !el.classList.contains('is-on')) return;
  const s = el.style, v = [w.x, w.y, w.w, w.h].map((n) => Math.round(n) + 'px');
  if (s.left !== v[0]) s.left = v[0]; if (s.top !== v[1]) s.top = v[1]; if (s.width !== v[2]) s.width = v[2]; if (s.height !== v[3]) s.height = v[3];
}

/* ── ch5→ch6 · 마감 이동 경로 데우기 ─────────────────────────
   이동 경로(한반도 ↔ 키르기스 · 지구 곡면 z3–6)의 위성 타일을 미리 받아 둔다.
   ① 곧바로: 경로 타일 목록을 Worker 로 받아 브라우저 캐시에(콘솔 오류 0 · 지도 무관)
   ② 무대가 숨어 있을 때(ch4): 지도 자체로 경로를 한 번 훑어 타일 캐시에
   ③ 그래도 비면: 이동 중 미적재 구간은 바탕색 막으로 가린다(frame 의 veil) */
const EOX_T = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg';
function pathSteps() {
  const C = S.cams || cams(), out = [];
  if (!S.data.kgz) return out;
  for (let i = 0; i <= 10; i++) out.push({ cam: lerpCam(C.nat2, C.kgz, i / 10, dipB(C)), win: LY.full });
  const g = globe(LY.fin, S.t0 + 60000);
  for (let i = 1; i <= 3; i++) { const t = i / 3; out.push({ cam: lerpCam(C.kgz, g, t, 0), win: lerpRect(LY.full, LY.fin, t) }); }
  out.push({ cam: C.nat2, win: LY.full });
  return out;
}
const VW_T = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
/** 카메라 한 장면이 부를 위성 타일(래스터 256 → 줌+1) · 여백(padding)만큼 옮긴 실제 화면 중심 기준 */
function tilesAt(cam, win, zmin, zmax, parent) {
  const W = innerWidth, H = innerHeight, pad = camPad(cam, win), ws = WS(cam.z), out = [];
  const tz = Math.round(cam.z) + 1;
  if (tz < zmin) return out;
  const cx = mx(cam.c[0]) + (pad.right - pad.left) / 2 / ws, cy = my(cam.c[1]) + (pad.bottom - pad.top) / 2 / ws;
  const k = cam.z < 4.6 ? 3 : cam.z < 5.6 ? 2 : 1.12, sx = (W / 2) * k / ws, sy = (H / 2) * k / ws;
  for (const z of parent ? [tz, tz - 1] : [tz]) {
    if (z > zmax || z < zmin) continue;
    const m = 2 ** z;
    const x0 = Math.floor((cx - sx) * m), x1 = Math.floor((cx + sx) * m), y0 = Math.max(0, Math.floor((cy - sy) * m)), y1 = Math.min(m - 1, Math.floor((cy + sy) * m));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, ((x % m) + m) % m, y]);
  }
  return out;
}
/* 경로 타일 미리 받기 — 첫 화면(히어로 지구)에는 필요 없다. 두 구간으로 나눠 그 구간이 다가올 때만 받는다(첫 화면 네트워크 정지 ≤ 8s).
   'A' = ch1→ch2 필지로 파고드는 길(첫 스크롤 때) · 'B' = ch5→ch6 · 마감(서비스 카드 구간이 보일 때) */
function prefetchTiles(part) {
  S.pre ||= {};
  if (S.pre[part] || !S.data.parcel) return; S.pre[part] = 1;
  const C = S.cams || cams(), set = new Set(), urls = [];
  const add = (u) => { if (!set.has(u)) { set.add(u); urls.push(u); } };
  const eox = ([z, x, y]) => add(EOX_T.replace('{z}', z).replace('{y}', y).replace('{x}', x));
  const vw = ([z, x, y]) => add(VW_T.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  if (part === 'A') {
    // ① ch1→ch2 필지로 파고드는 길
    const pr = { ...C.parcel, p: 0, b: 0 };
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, cam = zoomCam(C.nat1, pr, t), win = lerpRect(LY.full, LY.right, clamp(t * 1.4));
      tilesAt(cam, win, 1, 13, false).forEach(eox); if (cam.z > 6.2) tilesAt(cam, win, 7, 19, false).forEach(vw);
    }
  } else {
    // ② ch5→ch6 · 마감(지구 곡면)
    for (const { cam, win } of pathSteps()) tilesAt(cam, win, 1, 13, cam.z < 4.5).forEach(eox);
  }
  S.preSet = new Set([...(S.preSet || []), ...urls.filter((u) => u.includes('eox')).map((u) => u.split('GoogleMapsCompatible/')[1].replace('.jpg', ''))]);
  const list = urls.slice(0, 1200); S.preN = part + ' run ' + list.length;
  try {
    const src = `onmessage=async(e)=>{const u=e.data;let i=0;const go=async()=>{while(i<u.length){const x=u[i++];try{const r=await fetch(x,{mode:'cors'});await r.arrayBuffer();}catch(_){}}};await Promise.all(Array.from({length:8},go));postMessage(u.length);}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = (e) => { S.preN = e.data; devlog('prefetch', String(e.data)); w.terminate(); };
    w.postMessage(list);
  } catch (e) { devlog('prefetch', String(e)); }
}
async function warmPath() {
  if (S.warm !== 'no' || !S.ready || !S.data.kgz) return;
  S.warm = 'run';
  const m = S.map;
  const steps = pathSteps(); S.warmN = 0; S.warmMs = performance.now();
  for (const { cam, win } of steps) {
    if (stageEl.classList.contains('is-on')) { S.warm = 'no'; S.last = ''; devlog('warm', `stop ${S.warmN}/${steps.length}`); return; }
    S.warmN++;
    m.jumpTo({ center: cam.c, zoom: cam.z, pitch: cam.p || 0, bearing: cam.b || 0, padding: camPad(cam, win) });
    const t0 = performance.now();
    await new Promise((r) => { const tick = () => { let ok = false; try { ok = m.isSourceLoaded('k-eox'); } catch { ok = true; } if ((ok && performance.now() - t0 > 60) || performance.now() - t0 > 1800) r(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  }
  S.warm = 'done'; S.last = '';
  S.warmMs = Math.round(performance.now() - S.warmMs);
  devlog('warm', `done ${S.warmMs}ms`);
}
/** ch5→ch6 곡면 이동의 깊이 — 가장 낮은 줌이 4.4 근처(타일 줌 단계를 적게 건너게) */
const dipB = (C) => Math.max(0.8, (C.nat2.z + C.kgz.z) / 2 - 4.4);
/** 스크롤이 이끄는 이동값을 타일이 따라올 때만 전진시킨다 — 이번 줌 타일이 덜 찼으면 잠깐 머문다(최대 ~0.6초) */
function gated(cur, tgt) {
  if (cur === undefined || RM()) return tgt;
  const d = tgt - cur; if (Math.abs(d) < 1e-4) { S.hold = 0; return tgt; }
  const wait = S.gap > 0.25 && (S.hold = (S.hold || 0) + 1) < 36;
  if (!wait && S.gap <= 0.25) S.hold = 0;
  const step = wait ? 0.003 : 0.045;
  return cur + clamp(d, -step, step);
}
/** 위성 층의 '이번 줌' 타일 중 아직 안 찬 비율(0–1) — 부모 타일로 흐리게 메워지는 칸 */
function eoxGap(id = 'k-eox', zmax = 13) {
  try {
    const sc = S.map.style.sourceCaches[id], tz = Math.min(zmax, Math.round(S.map.getZoom()) + 1);
    let n = 0, miss = 0;
    for (const t of Object.values(sc._tiles)) { if (t.tileID.canonical.z !== tz) continue; n++; if (t.state !== 'loaded') miss++; }
    return n ? miss / n : 0;
  } catch { return 0; }
}
/** 이동 중 막 — 위성 층이 덜 찼으면 바탕색으로 덮고, 차면 걷는다(짧은 캐시 적재는 무시) */
function veil(on) {
  if (!S.veil) return;
  let tgt = 0;
  if (on && S.ready) {
    S.miss = S.gap > 0.34 ? S.miss + 1 : 0;
    tgt = S.miss > 30 ? 1 : 0;
  } else S.miss = 0;
  S.veilO = lerp(S.veilO, tgt, tgt ? 0.16 : 0.1);
  if (S.veilO < 0.01) S.veilO = 0;
  const v = S.veilO.toFixed(2);
  if (S.veil.style.opacity !== v) S.veil.style.opacity = v;
}
/* 위성 층 페이드 — 이동 구간(B)에서는 0(캐시 타일이 흐린 부모 위로 0.5초 번지지 않게) */
function fade(ms) {
  if (!S.ready || S.fadeMs === ms) return;
  S.fadeMs = ms;
  for (const id of ['k-eox', 'k-vw']) if (S.map.getLayer(id)) S.map.setPaintProperty(id, 'raster-fade-duration', ms);
}

/* ── 장면별 ─────────────────────────────────────────── */
/** ch1 — 남에서 북으로 차오르는 전국 시군구(값이 클수록 짙게) */
function sweep(s1, keep = 1) {
  const d = S.data.stats; if (!d || !S.map) return;
  const thr = lerp(32.9, 38.9, ease(seg(s1, 0.08, 0.72)));
  const [b0, b1, b2, b3] = d.breaks;
  const k = Math.round(thr * 50) / 50;
  const val = ['interpolate', ['linear'], ['coalesce', ['get', 'value'], 0], 0, 0.04, b0, 0.14, b1, 0.26, b2, 0.42, b3, 0.62, b3 * 3.5, 0.86];
  const rev = ['interpolate', ['linear'], ['get', 'lat'], k - 0.45, 1, k, 0];
  want('k-river-f', 'fill-opacity', keep <= 0 ? 0 : ['*', keep, val, rev]);
  want('k-river-l', 'line-opacity', keep <= 0 ? 0 : ['*', keep * 0.3, rev]);
  const sw = s1 > 0.08 && s1 < 0.74 && keep > 0;
  if (S.map.getSource('k-sweep')) {
    const at = sw ? k : null;
    if (at !== S.sweepAt) { S.sweepAt = at; S.map.getSource('k-sweep').setData(at === null ? { type: 'FeatureCollection', features: [] } : { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[123.8, at], [131.8, at]] } }); }
    want('k-sweep-l', 'line-opacity', sw ? 0.9 : 0);
  }
}
function nationOutline(o) { want('k-sgg-l', 'line-opacity', 0.42 * o); }
/** ch2 — 필지 결합 → 대장과 겹쳐 보기 → 필지별 AI 분석 결과(하나만 활성 · 원칙 135) */
function parcelScene(s2, keep = 1) {
  const a = seg(s2, 0.24, 0.34) * keep;
  want('k-parcel-l', 'line-opacity', 0.95 * a); want('k-parcel-f', 'fill-opacity', 0.08 * a);
  want('k-aiin-f', 'fill-opacity', 0.4 * seg(s2, 0.3, 0.4) * keep); want('k-aiin-l', 'line-opacity', seg(s2, 0.3, 0.4) * keep); want('k-aiin-h', 'line-opacity', 0.3 * seg(s2, 0.3, 0.4) * keep);
  want('k-ainear-f', 'fill-opacity', 0.1 * seg(s2, 0.3, 0.4) * keep); want('k-ainear-l', 'line-opacity', 0.35 * seg(s2, 0.3, 0.4) * keep); want('k-ainear-h', 'line-opacity', 0);
  const i = s2 < 0.46 ? 0 : s2 < 0.7 ? 1 : 2;
  if (i !== S.item) {
    S.item = i;
    document.querySelectorAll('#ch2-items li').forEach((li) => li.classList.toggle('is-on', +li.dataset.i === i));
    const pc = $('.m-pc'); if (pc) { pc.dataset.step = String(i); pc.querySelector('.m-pc-foot')?.classList.toggle('is-on', i === 2); }
  }
}
/** ch3 — XI ChatGEO 세 물음: ① 지도에 그리기(비닐하우스 동 면) → ② 읍면동 통계(막대 · 읍면동 색칠) → ③ 보고서 초안.
    물음마다 타자 → 계획 줄 → 답. 스크롤로 되감으면 그대로 거꾸로(움직임 줄이기는 타자 없이 바로). */
const ASK = [
  { q: '남원시 비닐하우스 보여 줘', at: [0.1, 0.2] },
  { q: '읍면동별로 통계 내 줘', at: [0.46, 0.54] },
  { q: '보고서 초안 만들어 줘', at: [0.72, 0.8] },
];
function askScene(s3) {
  const d = S.data.agent; if (!d) return;
  const box = $('#ch3-ask .k-ck'); if (!box) return;
  // 지금 묻는 물음 · 타자
  let k = 0; ASK.forEach((a, i) => { if (s3 >= a.at[0]) k = i; });
  const a = ASK[k], n = s3 < a.at[0] ? 0 : RM() ? a.q.length : Math.round(a.q.length * seg(s3, a.at[0], a.at[1]));
  const key = k + ':' + n;
  if (key !== S.typed) { S.typed = key; box.querySelector('.m-typed').textContent = a.q.slice(0, n); }
  // 물음 · 계획 · 답 — 보이는 단계가 바뀔 때만 건드린다
  const vis = ASK.map((x) => (s3 < x.at[1] ? 0 : 1 + Math.min(4, Math.floor((s3 - x.at[1]) / 0.02)))).join();
  if (vis !== S.askVis) {
    S.askVis = vis;
    box.querySelectorAll('.m-a').forEach((el) => {
      const t0 = ASK[+el.dataset.i].at[1], on = s3 >= t0;
      el.hidden = !on; el.previousElementSibling.hidden = !on;
      el.querySelectorAll('.k-ck-plan li').forEach((li, j) => li.classList.toggle('is-done', s3 >= t0 + 0.02 * (j + 1)));
      el.querySelector('.m-res').hidden = s3 < t0 + 0.07;
    });
    const chat = box.querySelector('.m-chat'); chat.scrollTop = chat.scrollHeight;
  }
  // 왼쪽 단계
  const i = s3 < 0.44 ? 0 : s3 < 0.7 ? 1 : 2;
  if (i !== S.askItem) { S.askItem = i; document.querySelectorAll('#ch3-items li').forEach((li) => li.classList.toggle('is-on', +li.dataset.i === i)); }
  // 지도 — ① 비닐하우스 면(② 로 넘어가며 걷힘) · ② 읍면동 색칠(동 수만큼 진하게)
  const g = seg(s3, 0.3, 0.38) * (1 - seg(s3, 0.5, 0.58));
  want('k-ghp-f', 'fill-opacity', 0.6 * g); want('k-ghp-l', 'line-opacity', 0.9 * g); want('k-ghp-h', 'line-opacity', 0);
  const o = seg(s3, 0.6, 0.68);
  const val = ['interpolate', ['linear'], ['get', 'v'], 0, 0.04, Math.max(1, d.max * 0.15), 0.3, d.max, 0.72];
  want('k-emd-f', 'fill-opacity', o <= 0 ? 0 : ['*', o, val]);
  want('k-emd-l', 'line-opacity', 0.6 * seg(s3, 0.04, 0.16));
}
function kgzScene(o) { want('k-kgz-l', 'line-opacity', 0.95 * o); want('k-kgz-f', 'fill-opacity', 0.12 * o); }

/* 배포 점 라벨(DOM · 지도 좌표를 따라) */
function labels(o) {
  const on = o > 0.01 && S.map && S.labels.length;
  labelsEl.style.opacity = on ? String(o) : '0';
  labelsEl.style.visibility = on ? 'visible' : 'hidden';
  if (!on) return;
  for (const l of S.labels) {
    const p = S.map.project(l.at);
    const v = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-7px, -50%)`;
    if (l.el.style.transform !== v) l.el.style.transform = v;
  }
}

/* 히어로 첫 그림 — 지도가 첫 타일을 다 받기 전까지 같은 룩의 순백 지구 스틸(사전 렌더)을 창에 둔다.
   저사양은 스크롤 전까지 이 스틸이 히어로다. 검정 면 0. */
const POSTER = document.documentElement.dataset.poster;   // 'm' · 'd' · 없음(데스크톱은 자전 인트로 그대로)
if (POSTER) $('#poster').src = new URL(`./data/globe-hero${POSTER === 'm' ? '-m' : ''}.webp`, import.meta.url).href;
function poster(on, win) {
  const w = $('#winA'), im = $('#poster'); if (!im || !POSTER) return;
  if (on && win) {
    const s = w.style; s.left = win.x + 'px'; s.top = win.y + 'px'; s.width = win.w + 'px'; s.height = win.h + 'px';
    im.style.borderRadius = win.r + 'px';
  }
  im.classList.toggle('is-off', !on);
}

/* ── 글 · 카드 채우기 ──────────────────────────────────── */
function fillStats(d) {
  $('#ch1-p').textContent = `하천구역 안 건물 점유를 전국 ${d.n_sgg.value}개 시군구에서 같은 기준으로 찾았습니다.`;
  $('#ch1-cap').textContent = `가장 많은 곳 · ${d.top.sido} ${d.top.name}`;
  const ch1 = $('#ch1');
  const mk = () => { if (!S.bn) S.bn = bignum($('#ch1-big'), d.total, { label: '하천구역 안 건물 점유 · 전국' }); };
  if (ch1.classList.contains('is-in')) mk(); else ch1.addEventListener('ch:in', mk, { once: true });
}
function fillParcel(p) {
  /* 꼬리표는 화면 말로 고정 — 서버 예시의 판정 이름(verdict)은 쓰지 않는다(원칙 135) */
  const host = $('#ch2-card');
  const place = esc(p.place);
  host.innerHTML = `<div class="t-card m-pc" data-step="0">
    <div class="m-pc-top"><span class="t-label">${place} · 예시</span><span class="t-chip" data-lv="warn">대장과 다름</span></div>
    <div class="m-pc-cols">
      <div class="m-pc-col"><span class="t-label">대장</span><b class="t-h4">${esc(p.ledger.jimok)}</b><span>${numHtml(p.ledger.area)}</span><span class="t-label">${esc(p.ledger.yongdo || '')}</span></div>
      <div class="m-pc-col is-ai"><span class="t-label">AI 분석</span><b class="t-h4">${esc(p.ai.cls)}</b><span>${numHtml(p.ai.area)}</span><span class="t-label">${p.ai.year}년 항공영상</span></div>
    </div>
    <div class="m-pc-foot"><span class="m-ok" aria-hidden="true">✓</span><span class="t-label">필지별 AI 분석 결과에 담았습니다</span></div>
  </div>`;
  S.item = -1;
}
function fillAgent(a) {
  const host = $('#ch3-ask');
  const nf = (v) => new Intl.NumberFormat('ko-KR').format(v);
  const at = short(a.region);
  host.innerHTML = `<div class="m-ask"><div class="k-ck" role="img" aria-label="XI ChatGEO 질문 카드">
    <div class="k-ck-f"><span class="k-ck-ico" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/></svg></span><span class="k-ck-t"><span class="m-typed" data-ph="이 지역에 대해 물어보기"></span><i class="m-caret"></i></span><kbd class="k-ck-k">Ctrl K</kbd></div>
    <div class="m-chat"></div>
  </div></div>`;
  const chat = host.querySelector('.m-chat');
  const block = (i, plan, res) => {
    chat.append(h('p.m-q', { hidden: true }, '물음', h('b', { text: ASK[i].q })));
    chat.append(h('div.m-a', { hidden: true, dataset: { i: String(i) } }, h('ol.k-ck-plan', {}, ...plan.map((t) => h('li', { text: t }))), h('div.m-res', { hidden: true }, ...res)));
  };
  // ① 지도에 그리기 — 숫자는 결과 파일(원판 모델 · 동 면) 값
  block(0, ['비닐하우스 결과 찾기', `${at} 범위로 자르기`, '지도에 그리기'], [
    h('div.k-ck-a', {}, h('span.t-label', { text: `${at} · 비닐하우스` }), h('b.num', { text: nf(a.total) }), h('small', { text: `동 · 단동 ${nf(a.single)} · 다동 ${nf(a.multi)}` })),
    h('p.m-q', { text: `${a.as_of}년 항공영상 AI 분석 결과 · 읍면동 ${a.rows.length}곳` })]);
  // ② 읍면동 통계 — 막대 6줄 · 나머지는 표
  const bx = h('div');
  bars(bx, { items: a.rows.slice(0, 6).map((r) => ({ label: r.emd, value: r.n })), unit: '동', ai: true });
  block(1, ['읍면동 경계와 겹치기', '읍면동마다 세기'], [bx, h('p.m-q', { text: `위 6곳 · 나머지 ${a.rows.length - 6}곳은 표로 · 합계 ${nf(a.total)}동` })]);
  // ③ 보고서 초안 — 모양만(예시) · 실제 파일은 로그인 뒤
  block(2, ['표 · 지도 묶기', '보고서 초안 쓰기'], [
    h('div.m-file', {}, h('div', {}, h('b', { text: `비닐하우스 현황(${at}) — 보고서 초안` }), h('span', { text: `읍면동 ${a.rows.length}곳 표 1 · 지도 1 · 합계 ${nf(a.total)}동` })), h('span.m-ex', { text: '예시' })),
    h('p.m-q', { text: '보고서 초안은 로그인 뒤 XI ChatGEO 에서 실제 파일로 받습니다.' })]);
  S.typed = ''; S.askVis = ''; S.askItem = -1;
}
/** 비닐하우스 동이 가장 모인 곳(약 1.5 × 1 km) — 미리보기 장면과 같은 식 */
function denseWin(fc) {
  const cs = fc.features.map((f) => { const b = bboxFC({ features: [f] }); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
  if (!cs.length) return null;
  let best = cs[0], bn = -1;
  for (const c of cs) { const n = cs.reduce((k, x) => k + (Math.hypot((x[0] - c[0]) * 0.9, x[1] - c[1]) < 0.0045 ? 1 : 0), 0); if (n > bn) { bn = n; best = c; } }
  return [best[0] - 0.0075, best[1] - 0.0032, best[0] + 0.0075, best[1] + 0.0058];
}
function fillDeploys(dd, sum) {
  // ch4 — 실결과 있는 배포본의 카드 3 · 상태·수 = 요약(summary) 한 출처. 요약이 없으면 숫자 없이(배포 기록·사본의 수를 싣지 않는다)
  const rows = joinCards(dd.cards, dd.deploys).filter((r) => r.deploy && r.deploy.scale).map((r) => {
    const it = sum ? itemFor(sum, r.card.id, r.deploy) : null;
    const state = it ? stageKey(it.stage) || 'none' : sum ? 'none' : r.state;
    return { ...r, card: { ...r.card, name: userWords(r.card.name) }, deploy: { ...r.deploy, scale: it ? scaleOf(it) : null }, state, item: it };
  }).filter((r) => !sum || r.state !== 'none')
    .sort((a, b) => (a.state === 'ga' ? 0 : 1) - (b.state === 'ga' ? 0 : 1)).slice(0, 3);
  const cards = $('#cards');
  if (!rows.length) { empty(cards, { kind: 'first' }); }
  else {
    serviceGrid(cards, rows, { map: (r) => ({ crop: new URL(`./data/crop-${r.card.id}.webp`, import.meta.url).href, where: short(r.item?.region_name || r.deploy.region_name?.ko), href: `/landxi/v3/service-detail/?card=${encodeURIComponent(r.card.id)}` }) });
    cards.querySelectorAll('.k-svc').forEach((c, i) => { c.classList.add('t-enter'); c.style.transitionDelay = i * 120 + 'ms'; c.append(h('span.m-more', { text: '자세히' })); });
    enter(cards);
  }
  // ch5 — 국내 배포 지역 점(시험 배포 제외 · 지역별 하나)
  const by = new Map();
  for (const d of dd.deploys) {
    if (!d.center || d.center[0] < 124 || d.center[0] > 132 || d.center[1] < 33 || d.center[1] > 39) continue;
    const k = d.region_name?.ko || d.tenant_id;
    const cur = by.get(k) || { name: short(k), at: d.center, ga: false };
    // 운영 여부 = 요약 stage(있으면) · 요약이 없으면 배포 기록 단계
    const it = sum ? itemFor(sum, d.card_id, d, { strict: true }) : null;
    if (sum ? stageKey(it?.stage) === 'ga' : d.stage === 'ga') cur.ga = true;
    by.set(k, cur);
  }
  const regions = [...by.values()];
  $('#ch5-tag').textContent = `운영 ${regions.filter((r) => r.ga).length}곳`;
  labelsEl.innerHTML = '';
  S.labels = regions.map((r) => { const el = h('div.m-lbl', {}, h('i.m-dot', { dataset: { st: r.ga ? 'ga' : 'pilot' } }), h('span', { text: r.name })); labelsEl.append(el); return { el, at: r.at }; });
}
const short = (s = '') => { const p = String(s).trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : p[0]; };

/* ── 부팅 ─────────────────────────────────────────────── */
async function load() {
  const [stats, parcel, agent, dd, kgz, sum] = await Promise.allSettled([D.riverStats(), D.sampleParcel(), D.agentScene(), D.deploys(), D.kgz(), loadSummary()]);
  if (stats.status === 'fulfilled') { S.data.stats = stats.value; fillStats(stats.value); }
  else { empty($('#ch1-big'), { kind: 'first', compact: true }); }
  if (parcel.status === 'fulfilled') { S.data.parcel = parcel.value; fillParcel(parcel.value); }
  if (agent.status === 'fulfilled') { S.data.agent = agent.value; S.data.agent.dense = denseWin(agent.value.gh); fillAgent(agent.value); }
  if (dd.status === 'fulfilled') fillDeploys(dd.value, sum.status === 'fulfilled' ? sum.value : null); else empty($('#cards'), { kind: 'first' });
  if (kgz.status === 'fulfilled') { S.data.kgz = kgz.value; $('#ch6-tag').textContent = `키르기스스탄 · ${kgz.value.features.length}개 지역`; }
  cams(); addLayers();
  deferPrefetch();
  devlog('sources', JSON.stringify(D.SRC));
}
/* 지연 받기 — 첫 뷰에 필요한 것(히어로 지구 타일 · 문구 · 공개 사본)만 먼저. 경로 타일은 스크롤 의도가 보일 때 */
function deferPrefetch() {
  const goA = () => { removeEventListener('scroll', goA); removeEventListener('wheel', goA); removeEventListener('touchstart', goA); removeEventListener('keydown', goA); prefetchTiles('A'); };
  if (scrollY > 0) goA();
  else for (const ev of ['scroll', 'wheel', 'touchstart', 'keydown']) addEventListener(ev, goA, { passive: true });
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); prefetchTiles('A'); prefetchTiles('B'); } }, { rootMargin: '100% 0px' });
  io.observe($('#ch4'));
}

/* 메인 안 이동(서비스 보기 · 서비스 · 활용 사례 · 처음으로) — 부드러운 스크롤 없이 바로 그 자리로(10-01 사용자 "휠 스크롤 역순으로 화면이 빠르게 넘어가는데,
   이런 거 없이 그냥 바로"). 스크롤 장면(트랙)도 따라 미끄러지지 않고 목적지 장면 상태로 바로(S.snap — frame 의 lerp 를 건너뛴다). */
function anchors() {
  const jump = (y) => { S.snap = 3; scrollTo({ top: Math.max(0, y), behavior: 'instant' }); };
  const go = (el, off = 0) => jump(el.getBoundingClientRect().top + scrollY + off);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (id === 'top') { e.preventDefault(); jump(0); }
    else if (id === 'ch4') { e.preventDefault(); go($('#ch4')); }
    else if (id === 'ch5') { e.preventDefault(); go($('#trackB'), innerHeight * 0.35); }
  });
}

addEventListener('resize', () => { sizeTracks(); LY = L(); S.cams = null; S.last = ''; S.clip = ''; });
anchors();
enter(document);
mountCmdk({ guest: true });           // Ctrl K — 게스트는 '로그인하면 물어볼 수 있습니다'
requestAnimationFrame(frame);
load();
// 지도: 곧바로(히어로 지구 · 모바일 포함) · 저사양만 첫 스크롤 또는 잠시 뒤(그때까지 첫 화면은 순백 지구 스틸)
if (DEV) window.__lxm = S;
if (!LOW) bootStage();
else {
  const kick = () => { removeEventListener('scroll', kick); bootStage(); };
  addEventListener('scroll', kick, { passive: true });
  setTimeout(kick, 2500);
}


/* ── 스크롤 안내(메인-2): 맨 위에 머물면 가운데 아래에 보이고, 내려가면 숨고, 다시 맨 위로 오면 또 보인다 ── */
(() => {
  const hint = document.getElementById('hint');
  if (!hint) return;
  const wait = matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 1500;
  let t = 0;
  const show = () => { hint.classList.remove('is-off'); hint.classList.add('is-on'); };
  const hide = () => { if (hint.classList.contains('is-on')) { hint.classList.remove('is-on'); hint.classList.add('is-off'); } };
  const check = () => { clearTimeout(t); if (scrollY > 40) { hide(); return; } t = setTimeout(() => { if (scrollY <= 40) show(); }, wait); };
  addEventListener('scroll', check, { passive: true });
  check();
})();
