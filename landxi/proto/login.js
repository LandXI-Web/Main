/* Land-XI 로그인 — "관문이 아니라 도킹"(v3 시네마틱 §5.2).
   흰 종이 위 좌 5/12 활자, 우 7/12 FIG 판. 판 안에서만 어두워진다.
   판에는 V-World 정사영상이 LX 전주 본사 상공에 정박해 있고, 12초 주기로 아주 느리게
   표류한다(화면당 움직이는 요소 1개 + ● LIVE — 판정 규칙 §5-10).
   성공하면 화면을 갈아치우지 않고 **같은 카메라가 남원으로 1250ms 이동**한 뒤 넘어간다.

   거동 프리미티브는 system.js(LXSys)에서 온다: revealAll(텍스트 인 600/60ms) ·
   crosshair(판 위에서만 십자선 + 경위도 판독) · lx-link 밑줄 통과.

   유지 기능: ?next= 안전 리다이렉트(상대 *.html 만) · localStorage.lx_logged_in ·
             아이디 저장(lx_saved_email) · 목 인증. */

import LXSys from './system.js';          /* 시트 부팅 — revealAll · underlines · crosshair */
import { resolveVWorld } from './js/sources.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* LX 한국국토정보공사 본사 — 전주 만성동. */
const HQ = [127.1480, 35.8242];
const NAMWON = [127.3524, 35.5311];      // 착지 지점(남원 정사영상 도엽)
const Z0 = 14.2;

/* 카피 덱 §8 — 사과 없음. 원인 + 다음 행동. */
const MSG = {
  email: '업무 이메일 형식으로 입력해 주세요 (예: hong@lx.or.kr)',
  pw: '비밀번호가 비어 있습니다. 계정은 소속 기관 담당자가 발급합니다.',
  webgl: '이 브라우저에서는 3D 지도를 그릴 수 없습니다. 정지 화면 모드로 전체 내용을 볼 수 있습니다.',
  tiles: 'V-World 타일 서버가 응답하지 않습니다. 저해상도 배경으로 계속 볼 수 있습니다.',
};
/* 동사 사슬(카피 덱 §8·§4-1): 로그인하고 시작하기 → 로그인 중… → 시작됨 */
const VERB = { idle: '로그인하고 시작하기', busy: '로그인 중…', done: '시작됨' };

/* 오픈 리다이렉트 방지 — 같은 사이트의 "이름.html(?쿼리)" 만 허용. 기존 규칙 그대로. */
const safeNext = (v) =>
  (/^[a-z0-9_-]+\.html(?:\?[^\s#]*)?$/i.test(v || '') && !/[:\/\\]/.test(v)) ? v : 'dashboard.html';
const nextTarget = () => safeNext(new URLSearchParams(location.search).get('next'));

const isLoggedIn = () => localStorage.getItem('lx_logged_in') === '1';

const $ = (s) => document.querySelector(s);
const root = $('#lg');
const form = $('#loginForm');
const btn = $('#lgSubmit');
const verbEl = btn.querySelector('.lx-cta__t');
const plate = $('#lgPlate');
const mapEl = $('#lgMap');

/* 이미 로그인 상태면 도킹 과정을 반복하지 않는다(기존 동작 유지). */
if (isLoggedIn()) location.replace(nextTarget());

/* ── 등장 — 헤드라인은 줄 단위 clip-path 마스크, 나머지는 [data-reveal] 이 맡는다 ── */
requestAnimationFrame(() => requestAnimationFrame(() => {
  $('#lgH1').classList.add('is-in');
  plate.classList.add('is-in');
}));

/* ── 시계 — KST hh:mm. 캡션의 숫자는 전부 해설이다(§5-9). ─────────────── */
const clockEl = $('#lgClock');
const tickClock = () => {
  const kst = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  clockEl.textContent = String(kst.getHours()).padStart(2, '0') + ':' + String(kst.getMinutes()).padStart(2, '0');
};
tickClock();
setInterval(tickClock, 20000);

/* ── 판(FIG. 01) — 같은 지도. ─────────────────────────────────────────── */
const coordEl = $('#lgCoord');
const barEl = $('#lgScaleBar');
const scaleEl = $('#lgScaleTxt');

let map = null, drifting = false, driftT0 = 0, raf = 0, tileTpl = '';

/* 착지 지점 타일을 미리 받아 둔다 — 1250ms 이동 중에 판이 검게 비면 그 순간이 가장 크게 상한다.
   XYZ 타일 좌표를 직접 계산해 브라우저 HTTP 캐시에만 넣는다(지도에는 손대지 않는다). */
function prefetch(lng, lat, zooms) {
  if (!tileTpl) return;
  for (const z of zooms) {
    const n = Math.pow(2, z);
    const x0 = Math.floor((lng + 180) / 360 * n);
    const r = lat * Math.PI / 180;
    const y0 = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const img = new Image();
      img.decoding = 'async';
      img.src = tileTpl.replace('{z}', z).replace('{x}', x0 + dx).replace('{y}', y0 + dy);
    }
  }
}

/* 스케일바 — 액자 안 헤어라인 바가 실제로 몇 m 인가(척도 규칙, 장치 8). */
function paintScale() {
  if (!map) return;
  const c = map.getCenter();
  const mpp = 156543.03392 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom());
  const raw = mpp * 120;
  const step = [25, 50, 100, 200, 250, 500, 1000, 2000].reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
  barEl.style.width = Math.round(step / mpp) + 'px';
  scaleEl.textContent = (step >= 1000 ? (step / 1000) + ' km' : step + ' m') + ' · 비닐하우스 1동 54 m';
  coordEl.textContent = c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) + '  EPSG:4326';
}

/* MapLibre 5 는 supported() 를 없앴다 — 컨텍스트를 직접 물어본다. */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function boot() {
  if (!window.maplibregl || !webglOK()) { fail(MSG.webgl); return; }
  const v = await resolveVWorld();
  tileTpl = v.sat;

  try {
    map = new maplibregl.Map({
      container: 'lgMap',
      style: {
        version: 8,
        sources: {
          vsat: {
            type: 'raster', tiles: [v.sat], tileSize: 256,
            minzoom: v.minzoom, maxzoom: v.maxzoom,
            attribution: '© V-World · 국토교통부',
          },
        },
        layers: [
          { id: 'paper', type: 'background', paint: { 'background-color': '#010102' } },
          {
            id: 'vsat', type: 'raster', source: 'vsat',
            /* 선택적 채도 — 정사영상은 사진으로 다루되 −35% 로 눌러 활자에 자리를 내준다(§4). */
            paint: {
              'raster-saturation': -0.35,
              'raster-contrast': 0.08,
              'raster-brightness-max': 0.88,
              'raster-fade-duration': 300,
            },
          },
        ],
      },
      center: HQ, zoom: Z0, pitch: 0, bearing: 0,
      interactive: false, attributionControl: false,
      fadeDuration: 300, refreshExpiredTiles: false,
    });
  } catch { fail(MSG.webgl); return; }

  map.on('error', (e) => {                       /* 타일 404 는 콘솔로 새지 않게 삼킨다 */
    const m = String(e && e.error && e.error.message || '');
    if (/could not be decoded|Failed to fetch|AbortError|404/i.test(m)) return;
    console.warn('[login/map]', m);
  });

  map.on('load', () => {
    const el = document.createElement('div');
    el.className = 'lg-mark';
    el.innerHTML = '<i></i><i></i><span>LX 본사 · 전주</span>';
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(HQ).addTo(map);
    paintScale();
    startDrift();
    root.dataset.mapReady = '1';
    window.__login.ready = true;
    /* 착지 지점(남원) 을 미리 받아 둔다. 초기 화면 타일과 경쟁하지 않도록 한 박자 뒤에. */
    setTimeout(() => {
      prefetch(NAMWON[0], NAMWON[1], [12, 13, 14, 15]);   // 착지 지점
      prefetch(HQ[0], HQ[1], [10, 11]);                    // 물러났을 때의 광역 프레임
    }, 600);
  });
}

function fail(text) {
  const f = $('#lgFallback');
  f.textContent = text; f.hidden = false;
  root.dataset.mapReady = 'fallback';
  window.__login.ready = true;
}

/* ── 앰비언트 — 12초 주기의 아주 느린 표류. 정지 화면으로 시작하지 않는다(§5-2). ── */
function startDrift() {
  if (REDUCE) { paintScale(); return; }
  drifting = true; driftT0 = performance.now();
  const loop = (now) => {
    if (!drifting) return;
    const t = ((now - driftT0) / 12000) * Math.PI * 2;
    map.jumpTo({
      center: [HQ[0] + 0.0016 * Math.sin(t), HQ[1] + 0.0011 * Math.cos(t)],
      zoom: Z0 + 0.02 * Math.sin(t / 2),
    });
    paintScale();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function stopDrift() { drifting = false; cancelAnimationFrame(raf); }

/* ── 십자선 — 판 위에서만. 판독값은 지도의 실제 경위도다(장식 숫자 금지, §5-9). ── */
const cross = LXSys.crosshair(plate);
plate.__geo = {
  el: mapEl,
  get bounds() {
    if (!map) return [126, 35, 128, 36];
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  },
};

/* ── 폼 — 헤어라인 필드. 포커스는 색이 아니라 선이 그어지는 사건이다. ──── */
const fields = {};
for (const wrap of document.querySelectorAll('.lx-field')) {
  const key = wrap.dataset.field;
  const input = wrap.querySelector('.lx-field__input');
  const msg = wrap.querySelector('.lx-field__msg');
  fields[key] = { wrap, input, msg };
  input.addEventListener('focus', () => wrap.classList.add('is-focus'));
  input.addEventListener('blur', () => wrap.classList.remove('is-focus'));
  input.addEventListener('input', () => clearErr(key));
}
const setErr = (key, text) => {
  const f = fields[key];
  f.wrap.classList.add('is-error');
  f.msg.textContent = text; f.msg.hidden = false;
  f.input.setAttribute('aria-invalid', 'true');
};
const clearErr = (key) => {
  const f = fields[key];
  if (!f.wrap.classList.contains('is-error')) return;
  f.wrap.classList.remove('is-error');
  f.msg.hidden = true; f.msg.textContent = '';
  f.input.removeAttribute('aria-invalid');
};

/* 아이디 저장(기존 기능 유지) */
const saved = localStorage.getItem('lx_saved_email');
if (saved) { form.email.value = saved; form.remember.checked = true; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
let busy = false;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;

  const email = form.email.value.trim();
  const pw = form.pw.value;
  let bad = null;

  if (!EMAIL_RE.test(email)) { setErr('email', MSG.email); bad = bad || 'email'; } else clearErr('email');
  if (!pw) { setErr('pw', MSG.pw); bad = bad || 'pw'; } else clearErr('pw');
  if (bad) { fields[bad].input.focus(); return; }

  busy = true;
  btn.disabled = true;
  verbEl.textContent = VERB.busy;
  verbEl.dataset.verb = 'busy';

  /* 목 인증 — 형식이 맞으면 통과(기존 프로토와 동일). */
  setTimeout(() => {
    localStorage.setItem('lx_logged_in', '1');
    if (form.remember.checked) localStorage.setItem('lx_saved_email', email);
    else localStorage.removeItem('lx_saved_email');

    verbEl.textContent = VERB.done;
    verbEl.dataset.verb = 'done';
    handoff();
  }, REDUCE ? 0 : 420);
});

/* ── 핸드오프 — 화면 전환이 아니라 카메라 이동(§5-4). ────────────────────── */
function handoff() {
  const go = () => location.assign(nextTarget());
  if (REDUCE || !map) { go(); return; }
  stopDrift();
  root.classList.add('is-leaving');
  /* 데이터가 도착하는 사건 — 판독 줄이 목적지를 말한다(§5-5). */
  $('#lgStatus').textContent = '이동 중 · 남원 · 2025-08 정사영상 4시점';

  /* easeTo 로 35km 를 z14 그대로 건너뛰면 중간 프레임이 통째로 검게 빈다.
     flyTo 는 한 번 물러났다가(minZoom 10.4) 내려앉는다 — 궤도→강하 서사와 같은 동작이다. */
  map.flyTo({
    center: NAMWON, zoom: 15.2, duration: 1250, curve: 1.42, minZoom: 10.4,
    easing: (t) => 1 - Math.pow(1 - t, 3.2),          /* expo-out 계열 — 이징 하나의 근사 */
  });

  const tick = setInterval(paintScale, 80);
  const t0 = performance.now();
  let done = false;
  /* 마지막으로 보는 프레임이 검은 판이면 안 된다 — 착지 타일이 그려진 뒤에 넘긴다.
     그래도 2.8초를 넘기지는 않는다(느린 회선에서 사용자를 붙잡아 두지 않는다). */
  const land = () => {
    if (done) return;
    done = true;
    clearInterval(tick); paintScale();
    $('#lgStatus').textContent = '착지 · 남원 · 2025-08 정사영상 · 다음 화면으로';
    window.__login.landed = true;
    setTimeout(go, 600);                               /* 카피 덱 §8: "시작됨" 0.6초 노출 */
  };
  const onIdle = () => {
    if (performance.now() - t0 < 1250) { map.once('idle', onIdle); return; }
    land();
  };
  map.once('idle', onIdle);
  setTimeout(land, 2800);
}

/* ── 테스트 훅 ────────────────────────────────────────────────────────── */
window.__login = {
  ready: false,
  landed: false,
  MSG, VERB,
  safeNext,
  next: nextTarget,
  cross,
  center: () => (map ? [map.getCenter().lng, map.getCenter().lat] : null),
  drifting: () => drifting,
};

boot();
