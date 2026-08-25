// 홈 v2 장면 컨트롤러 — 스크롤 스냅이 아니라 상태 기계다.
// go(n) 이 body[data-scene] 을 바꾸고, 떠나는 장면의 leave() 와 들어오는 장면의 enter() 가
// 카메라·레이어·오버레이를 맡는다. 장면은 겹쳐 쌓인 전면 레이어라서 스크롤이 없다.
// Scene 1 만 다크이며, Scene 2 진입 시 '일출'(night-veil 페이드아웃)로 라이트가 된다 —
// 지도 스타일 자체는 건드리지 않으므로 MapLibre·폴백 두 엔진에서 똑같이 동작한다.
import { createMap } from '../map/shell.js';
import { countUpAll } from '../ui/kpi.js';
import { SERVICES, serviceById } from '../../data/services.js';
import { createOrbit } from './home-orbit.js';
import { createHud } from './home-hud.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;
const $ = s => document.querySelector(s);

const ORBIT_CENTER = [127.8, 36.2], ORBIT_ZOOM = 1.4;   // 링 3개(최대 반지름 = 글로브의 1.95배)가 화면에 다 들어오는 크기
const ORBIT_X = 0.32;                                    // 글로브 중심의 화면 가로 위치(= CSS --orbit-x)
const NATION_CENTER = [127.8, 36.2], NATION_ZOOM = 6.3;  // 하강 도착점(한반도 전역)
const NAMWON = [127.39, 35.41];
const AUTO_MS = 4000, WHEEL_MS = 700;

let map = null, orbit = null, hud = null;
let scene = 0, autoT = 0, wheelAt = 0, story = null;

const sections = [...document.querySelectorAll('.scene')];
const dots = [...document.querySelectorAll('.scene-nav button')];

/* ── 톤 ────────────────────────────────────────────────────── */
const setDark = on => body.classList.toggle('is-dark', on);

/* ── 카메라 ────────────────────────────────────────────────── */
// Scene 1 은 글로브를 화면 왼쪽 28% 로 밀어 오른쪽에 워드마크 자리를 낸다.
// MapLibre 는 padding 으로, 폴백은 궤도 SVG 가 스스로 그 자리에 지구본을 그린다.
function orbitPadding(on) {
  const raw = map && map.engine === 'maplibre' ? map.raw : null;
  if (!raw || typeof raw.setPadding !== 'function') return;
  raw.setPadding({ top: 0, bottom: 0, left: 0, right: on ? Math.round(innerWidth * (1 - 2 * ORBIT_X)) : 0 });
}

function descend() {
  const raw = map && map.engine === 'maplibre' ? map.raw : null;
  if (raw && !REDUCE) {
    // padding 까지 한 번에 보간해야 글로브가 왼쪽에서 가운데로 '끌려 내려오는' 하강이 된다.
    raw.flyTo({
      center: NATION_CENTER, zoom: NATION_ZOOM, pitch: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 2400, essential: true,
    });
    return;
  }
  orbitPadding(false);
  map.flyTo(NATION_CENTER, NATION_ZOOM, { pitch: 0 });
}

// Task 8b(남원 실정사영상 + IMAGERY 카탈로그)가 들어오면 여기서 raster 를 올린다.
// 아직 assets/data/imagery.js 가 없으므로 import 하지 않고 훅만 남긴다.
function useRealImagery(/* map */) { /* TODO(Task 8b): IMAGERY.namwon_2508 → map.addRaster(...) */ }

// 우주에서 보는 글로브에는 지명 라벨이 없어야 한다. 하강 뒤(Scene 2~)에는 되살린다.
function placeLabels(on) {
  const raw = map && map.engine === 'maplibre' ? map.raw : null;
  if (!raw || !raw.getLayer || !raw.getLayer('label-place')) return;
  raw.setLayoutProperty('label-place', 'visibility', on ? 'visible' : 'none');
}

/* ── 장면 정의 ─────────────────────────────────────────────── */
const SCENES = {
  1: {
    enter() {
      setDark(true);
      orbitPadding(true);
      placeLabels(false);
      map.jumpTo(ORBIT_CENTER, ORBIT_ZOOM, { pitch: 0 });
      orbit.layout();
      orbit.start();
      countUpAll($('.orbit-strip'));
      if (!REDUCE) autoT = setTimeout(() => go(2), AUTO_MS);
    },
    leave() { orbit.stop(); placeLabels(true); },
  },
  2: {
    enter() {
      setDark(false);            // 일출 — night-veil 이 1.2s 동안 걷힌다
      descend();
      hud.show();
      countUpAll($('.hud__stats'));
    },
    leave() { hud.hide(); },
  },
  3: {
    enter() {
      setDark(false);
      hud.hide();
      const s = story && serviceById(story);
      if (s) map.flyTo(s.lnglat, 12, { pitch: 45 });
    },
  },
  4: {
    enter() { setDark(false); map.flyTo(NAMWON, 11, { pitch: 0 }); },
  },
  5: {
    enter() { setDark(false); map.flyTo(NAMWON, 12, { pitch: 45 }); useRealImagery(map); },
  },
  6: {
    enter() { setDark(false); map.flyTo(NATION_CENTER, 5.6, { pitch: 0 }); },
  },
};

/* ── 전이 ──────────────────────────────────────────────────── */
function cancelAuto() { if (autoT) { clearTimeout(autoT); autoT = 0; } }

function go(n) {
  n = Math.max(1, Math.min(6, Math.round(Number(n) || 0)));
  if (n === scene) return scene;
  cancelAuto();
  const from = scene;
  if (SCENES[from] && SCENES[from].leave) SCENES[from].leave();
  scene = n;
  body.dataset.scene = String(n);
  for (const el of sections) el.classList.toggle('is-on', Number(el.dataset.scene) === n);
  for (const d of dots) d.setAttribute('aria-current', Number(d.dataset.dot) === n ? 'true' : 'false');
  if (SCENES[n] && SCENES[n].enter) SCENES[n].enter(from);
  return scene;
}

function openStory(id) {
  const s = serviceById(id);
  if (!s) return;
  story = s.id;
  const panel = $('#scene-story');
  panel.dataset.service = s.id;
  panel.dataset.story = s.story;
  $('.story-panel__title').textContent = s.name;
  $('.story-panel__meta').textContent =
    `${s.ministry} · ${s.count.toLocaleString('ko-KR')}${s.unit} · ${String(s.lastRun).replace(/-/g, '.')}`;
  // 이미 스토리 장면이면 go(3) 이 조기 반환하므로 카메라만 새 서비스로 옮긴다.
  if (scene === 3) map.flyTo(s.lnglat, 12, { pitch: 45 });
  go(3);
}

function closeStory() {
  story = null;
  const panel = $('#scene-story');
  panel.removeAttribute('data-service');
  panel.removeAttribute('data-story');
  go(2);
}

/* ── 라인업 칩 ─────────────────────────────────────────────── */
function buildLineup() {
  const wrap = $('.lineup__chips');
  wrap.innerHTML = SERVICES.map(s =>
    `<button type="button" class="chip" data-service="${s.id}" data-real="${s.real}" style="--c:${s.color}" title="${s.ministry}">${s.name}</button>`
  ).join('');
  const hot = id => {
    for (const c of wrap.children) c.classList.toggle('is-hot', c.dataset.service === id);
    hud.highlight(id);
  };
  wrap.addEventListener('pointerover', e => { const c = e.target.closest('.chip'); if (c) hot(c.dataset.service); });
  wrap.addEventListener('pointerout', e => { if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) hot(null); });
  wrap.addEventListener('focusin', e => { const c = e.target.closest('.chip'); if (c) hot(c.dataset.service); });
  wrap.addEventListener('focusout', () => hot(null));
  wrap.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) openStory(c.dataset.service); });
}

/* ── 입력 ──────────────────────────────────────────────────── */
const typing = () => {
  const a = document.activeElement;
  return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};

function bindInput() {
  // 휠·터치는 한 번에 한 장면씩(700ms 디바운스). 키보드·도트는 즉시 반응한다.
  addEventListener('wheel', e => {
    cancelAuto();
    if (Math.abs(e.deltaY) < 6) return;
    const now = performance.now();
    if (now - wheelAt < WHEEL_MS) return;
    wheelAt = now;
    go(scene + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  let ty = null;
  addEventListener('touchstart', e => { cancelAuto(); ty = e.touches[0] ? e.touches[0].clientY : null; }, { passive: true });
  addEventListener('touchend', e => {
    if (ty == null) return;
    const y = e.changedTouches[0] ? e.changedTouches[0].clientY : ty, d = ty - y;
    ty = null;
    if (Math.abs(d) < 40) return;
    const now = performance.now();
    if (now - wheelAt < WHEEL_MS) return;
    wheelAt = now;
    go(scene + (d > 0 ? 1 : -1));
  }, { passive: true });

  addEventListener('keydown', e => {
    if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
    let n = null;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') n = scene + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') n = scene - 1;
    else if (e.key === 'Home') n = 1;
    else if (e.key === 'End') n = 6;
    else if (e.key === 'Escape' && scene === 3) { e.preventDefault(); cancelAuto(); closeStory(); return; }
    if (n == null) return;
    e.preventDefault();
    cancelAuto();
    go(n);
  });

  addEventListener('pointerdown', cancelAuto, { passive: true });

  for (const d of dots) d.addEventListener('click', () => go(Number(d.dataset.dot)));
  for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => go(Number(b.dataset.go)));
  for (const b of document.querySelectorAll('[data-story]')) b.addEventListener('click', () => openStory(b.dataset.story));
  const close = $('.story-panel__close');
  if (close) close.addEventListener('click', closeStory);
}

/* ── 기동 ──────────────────────────────────────────────────── */
async function init() {
  map = await createMap($('#homeMap'), {
    mode: 'canvas', globe: true, zoom: ORBIT_ZOOM, center: ORBIT_CENTER,
    interactive: false, tools: false, rulebar: false, ortho: false,
  });
  body.dataset.engine = map.engine;

  orbit = createOrbit($('.orbit'), map, { zoom: ORBIT_ZOOM });
  hud = createHud(map, SERVICES, { onSelect: openStory });
  $('#scene-descent').prepend(hud.el);

  buildLineup();
  bindInput();
  go(1);                                   // LX.home 을 노출하기 전에 첫 장면을 세운다
  window.LX = Object.assign(window.LX || {}, {
    home: {
      get scene() { return scene; },
      get service() { return story; },
      go, openStory, closeStory,
    },
  });
}

init().catch(e => console.error('[LX.home] 기동 실패:', e));
