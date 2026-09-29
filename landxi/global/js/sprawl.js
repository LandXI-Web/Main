/* K-3 소쿨룩 · 비슈케크 — kgz-land · dp-kgz-land-change-26(있으면 카드 · 없으면 '이식 전' 결손)
   Esri/IO LULC 2017→2025 built Δ 500 m 격자(액센트 램프 · 앰버 금지) · 필라멘트(z9–11 · 격자 built 밀도) · Overture 건물 압출(기본 OFF · pitch 45)
   · 스와이프 EOX 2017 ↔ 2025 · 연속지적 시범지 3곳 라벨 + 경계 미확보 · Сокулук · Бишкек 병기. */
import { API, fixture, env, api, session, catalog, quote, submit, sse } from '../../shared/api-v1.js';
import { t, num, area } from './i18n.js';
import { D, prov, pinBox, tween, ensureMapB, swipe, idle, eoxB, dcache } from './globe-stage.js';
import { cardHead, gap, reveal } from './cards-global.js';
import { opacity, show, rawTiles } from './ladder-global.js';

const DATA = new URL('../data/', import.meta.url);
export const CAM_SK = { center: [74.43, 42.855], zoom: 10.35, pitch: 40, bearing: -8 };
export const CAM_SK_BLD = { center: [74.512, 42.868], zoom: 14.0, pitch: 45, bearing: -18 };
const PILOTS = [
  { name: 'Bishkek', cyr: 'Бишкек', at: [74.60, 42.875], below: true },   // 이웃과 위·아래 엇갈림(라벨 겹침 0)
  { name: 'Ysyk-Ata', cyr: 'Ысык-Ата', at: [74.94, 42.885] },
  { name: 'Sokuluk', cyr: 'Сокулук', at: [74.30, 42.86] },
];
const RAMP = ['interpolate', ['linear'], ['get', 'd'], 0, 'rgba(191,217,255,0)', 3, '#BFD9FF', 10, '#5E9BFF', 25, '#0F55C7', 50, '#003B85'];
const OVERTURE = 'pmtiles://https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles';

/** 스와이프 2017 ↔ 2025 원천(PC S2 L2A 여름 모자이크 두 장). */
function swipeSrcOf(ctx, yr) {
  const pc = ctx.ladder.cat.by['pc-s2-mosaic'];
  if (!pc || !pc.params?.swipe?.[yr]) return null;
  return { type: 'raster', tileSize: 256, tiles: [pc.tiles.replace('{searchid}', pc.params.swipe[yr])], minzoom: 9, maxzoom: 15, bounds: pc.params.swipe_bbox || pc.bounds, attribution: pc.attribution };
}
/** 미리 받기용(boot 배경) — 도착 카메라의 두 모자이크. */
export const swipeSpecs = (ctx) => ['2017', '2025'].map((yr) => swipeSrcOf(ctx, yr)).filter(Boolean).map((src) => ({ src, final: true }));

export async function loadSprawl() { return fixture(new URL('kgz-sprawl-2017-2025.json', DATA)); }

function filamentFC(grid) {
  // 셀 중심에 가는 기둥(≈ 70 m) — 높이 = 2025 built 비율 · 1px 수직선 문법의 3D 판
  const w = 0.00042, h = 0.00031;
  return { type: 'FeatureCollection', features: grid.features.filter((f) => f.properties.b25 >= 5).map((f) => {
    const c = f.geometry.coordinates[0]; const x = (c[0][0] + c[2][0]) / 2, y = (c[0][1] + c[2][1]) / 2;
    return { type: 'Feature', properties: { b25: f.properties.b25, d: f.properties.d }, geometry: { type: 'Polygon', coordinates: [[[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h], [x - w, y - h]]] } };
  }) };
}

function addOverture(map, id = 'ovt-3d') {
  if (map.getLayer(id)) return;
  if (!map.getSource('ovt'))
  map.addSource('ovt', { type: 'vector', url: OVERTURE, attribution: '© OpenStreetMap contributors, Overture Maps Foundation' });
  map.addLayer({ id, type: 'fill-extrusion', source: 'ovt', 'source-layer': 'building', minzoom: 13, layout: { visibility: 'none' },
    paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'height'], ['*', ['coalesce', ['get', 'num_floors'], 2], 3]], 3, '#93BDFF', 12, '#5E9BFF', 30, '#0F55C7'],
             'fill-extrusion-height': ['*', ['coalesce', ['get', 'height'], ['*', ['coalesce', ['get', 'num_floors'], 2], 3]], ['literal', 0]],
             'fill-extrusion-opacity': 0.86, 'fill-extrusion-vertical-gradient': true } });
}

export function sprawlScene(stage, ctx) {
  const { map, root } = stage;
  const card = root.querySelector('#card');
  const S = { grid: false, fil: false, bld: false, swipe: null, change: null };

  function addLayers() {
    if (map.getSource('sprawl')) return;
    map.addSource('sprawl', { type: 'geojson', data: ctx.sprawl.grid });
    map.addLayer({ id: 'sprawl-grid', type: 'fill', source: 'sprawl', filter: ['>', ['get', 'd'], 1],
      paint: { 'fill-color': RAMP, 'fill-opacity': 0, 'fill-opacity-transition': { duration: D[500], delay: 0 }, 'fill-outline-color': 'rgba(255,255,255,.18)' } });
    map.addSource('filament', { type: 'geojson', data: filamentFC(ctx.sprawl.grid) });
    map.addLayer({ id: 'filament', type: 'fill-extrusion', source: 'filament', minzoom: 8.5, maxzoom: 12,
      paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'b25'], 2, '#FFFFFF', 30, '#7FD6D0', 80, '#0FA9A0'],
               'fill-extrusion-height': 0, 'fill-extrusion-opacity': 0.85 } });
    addOverture(map);
  }

  /* 카드 — 판정 1차 불합격(소쿨룩 정직성·읽힘): 'DRAFT · results 0' 이 머리에, 바로 밑 +44.4 km² 가 Esri/IO 외부 통계라
     공무원에게 '분석 안 함' 으로 읽혔다 → ① LX 분석(변화탐지) 절을 먼저 · 실행 버튼(사전 점검 → 큐 제출) ② 외부 통계 절에 'LX 분석 아님' 칩. */
  function renderCard() {
    const dep = ctx.deploys.byId['dp-kgz-land-change-26'];
    const s = ctx.sprawl.summary;
    card.innerHTML = cardHead(dep || null, { title: t('sk.h'), place: t('sk.place'), cyr: 'Сокулук · Бишкек' });
    const lx = document.createElement('section');
    lx.className = 'g-sec g-in-2'; lx.id = 'sk-lx';
    const status = dep ? `${t('card.stage.' + dep.stage)} · ${dep.snapshot_current ? t('sk.lx.snap') : t('sk.lx.results0')}` : t('sk.nodeploy');
    lx.innerHTML = `<div class="g-sec__t"><span>${t('sk.lx.h')}</span><b>${status}</b></div>
      <p class="g-note" style="margin:8px 0 0">${t('sk.lx.what')}</p>
      <div class="g-run"><button class="g-btn" id="sk-run">${t('sk.run')}</button><span class="g-note" id="sk-run-note">${API.mode === 'on' ? t('sk.run.on') : t('sk.run.off')}</span></div>
      <ul class="g-pre" id="sk-pre" hidden></ul><div id="sk-gap"></div>`;
    card.appendChild(lx);
    if (!dep) lx.insertBefore(gap(t('sk.nodeploy'), t('sk.nodeploy.why')), lx.querySelector('.g-run'));   // 이식 전 — 정직한 결손
    lx.querySelector('#sk-run').onclick = () => runChange();
    const sec = document.createElement('section');
    sec.className = 'g-sec g-in-3';
    sec.innerHTML = `<div class="g-sec__t"><span>${t('sk.delta')} · ${t('sk.cells')}</span><b>+${num(s.delta_km2.value, 1)} ${t('unit.km2')}</b></div>
      <div style="margin-top:6px"><span class="g-xchip" style="margin-left:0">${t('sk.ext')}</span></div>
      <dl class="g-quote"><div><dt>${t('sk.b17')}</dt><dd>${num(s.built_2017_km2.value, 1)}<small>${t('unit.km2')}</small></dd></div>
        <div><dt>${t('sk.b25')}</dt><dd>${num(s.built_2025_km2.value, 1)}<small>${t('unit.km2')}</small></dd></div>
        <div><dt>Δ</dt><dd>+${num(s.delta_km2.value * 100, 0)}<small>${t('unit.ha')}</small></dd></div></dl>
      <div style="margin-top:8px;display:flex;align-items:center;gap:8px;font:500 14px/16px var(--g-num);color:var(--cw-sub)">0<span style="flex:1;height:8px;background:linear-gradient(90deg,#BFD9FF,#5E9BFF,#0F55C7,#003B85)"></span>50 %p</div>
      <div id="sk-prov" style="margin-top:8px"></div>
      <div class="g-toggles" role="group">
        <button class="g-tg" data-k="grid" aria-pressed="false">${t('sk.tg.grid')}</button><button class="g-tg" data-k="fil" aria-pressed="false">${t('sk.tg.fil')}</button>
        <button class="g-tg" data-k="bld" aria-pressed="false">${t('sk.tg.bld')}</button><button class="g-tg" data-k="swipe" aria-pressed="false">${t('sk.tg.swipe')}</button></div>`;
    card.appendChild(sec);
    sec.querySelector('#sk-prov').appendChild(prov(s.delta_km2));
    const pil = document.createElement('section');
    pil.className = 'g-sec g-in-4';
    pil.innerHTML = `<div class="g-sec__t"><span>${t('pilot.h')}</span><b>3</b></div><div class="gs-void" style="margin-top:8px">${PILOTS.map((p) => `<b>${p.name}</b> <span class="g-cyr" lang="ru">${p.cyr}</span>`).join(' · ')} — ${t('pilot.void')} · LX L1 2022–25</div>`;
    card.appendChild(pil);
    sec.addEventListener('click', (e) => { const b = e.target.closest('.g-tg'); if (b) toggle(b.dataset.k); });
    reveal(card);
  }

  /** 변화탐지 실행 — 사전 점검(게이트웨이 · 배포본 · 권한 · 모델 어댑터 · 영상 쌍) 뒤 통과하면 POST /jobs · SSE 진행.
      하나라도 막히면 제출하지 않고 이유를 결손 칩으로(가짜 작업 0). */
  async function runChange() {
    const ul = card.querySelector('#sk-pre'), gapEl = card.querySelector('#sk-gap'), btn = card.querySelector('#sk-run'), note = card.querySelector('#sk-run-note');
    ul.hidden = false; gapEl.replaceChildren(); btn.disabled = true; btn.textContent = t('sk.run.checking');
    const L = [];
    const line = (k, ok, txt) => { L.push({ k, ok, txt }); ul.innerHTML = L.map((i) => `<li data-ok="${i.ok}"><i></i><span><b>${t('sk.pre.' + i.k)}</b> · ${i.txt}</span></li>`).join(''); };
    const stop = (why) => { gapEl.appendChild(gap(t('sk.run.cant'), why)); btn.disabled = false; btn.textContent = t('sk.run'); S.change = { blocked: why }; root.dispatchEvent(new CustomEvent('f1d:sk-preflight', { detail: { items: L, blocked: why } })); };
    if (API.mode !== 'on') { line('gw', 0, t('sk.pre.gw.off')); return stop(t('sk.run.cant.off')); }
    if (!session.get()) { line('gw', 1, t('sk.pre.gw.guest')); return stop(t('sk.run.cant.guest')); }   // 인증 라우트(401 콘솔 오류 0) — 게스트는 부르지 않는다
    line('gw', 1, API.base.replace(/^https?:\/\//, ''));
    let dep = null;
    // 목록에서 찾는다(단건 GET 의 404 는 브라우저 콘솔 오류가 된다)
    try { dep = ((await api('/deploys?tenant_id=kgz-land')).items || []).find((x) => x.id === 'dp-kgz-land-change-26') || null; } catch { dep = null; }
    line('dep', dep ? 1 : 0, dep ? `${dep.id} · ${dep.stage}` : t('sk.pre.dep.no'));
    const sh = session.shadow();
    const perm = sh.realm === 'tenant' ? (sh.tenant_id === 'kgz-land' && sh.role === 'manager') : sh.realm === 'lx' ? sh.role !== 'sales' : false;
    line('perm', perm ? 1 : 0, `${sh.realm || 'guest'} · ${sh.role || '—'}${sh.tenant_id ? ' · ' + sh.tenant_id : ''}`);
    const modelId = dep?.model_override || 'unsupervised-change';
    let model = null, modelOk = '-';
    if (sh.realm === 'lx') { try { model = await api('/registry/models/' + modelId); modelOk = model && model.adapter ? 1 : 0; } catch { modelOk = 0; } }
    line('model', modelOk, modelOk === '-' ? `${modelId} · ${t('sk.pre.model.hidden')}` : model && model.adapter ? `${modelId} · ${model.adapter}` : `${modelId} · ${t('sk.pre.model.noadapter')}`);
    let pair = [];
    try {
      const c = await catalog({ stage: 'global', build: ctx.build || 'lx', locale: document.documentElement.lang });
      const bb = [74.2, 42.6, 74.8, 43.0];
      pair = (c.items || []).filter((i) => i.role === 'imagery' && i.source !== 'external' && i.bounds && !(i.bounds[2] < bb[0] || i.bounds[0] > bb[2] || i.bounds[3] < bb[1] || i.bounds[1] > bb[3]));
    } catch { pair = []; }
    line('img', pair.length >= 2 ? 1 : 0, pair.length >= 2 ? pair.slice(0, 2).map((i) => i.id).join(' ↔ ') : t('sk.pre.img.no', { n: pair.length }));
    const bad = L.find((i) => i.ok === 0);
    if (bad) return stop(t('sk.pre.' + bad.k) + ' — ' + bad.txt);
    const body = { kind: 'infer', model_id: modelId, imagery_id: pair[1].id, deploy_id: dep.id, card_id: 'card-change', aoi: { type: 'Polygon', coordinates: [[[74.44, 42.84], [74.56, 42.84], [74.56, 42.9], [74.44, 42.9], [74.44, 42.84]]] }, options: { pair: pair.map((i) => i.id) }, priority: 0, demo: false };
    try {
      const q = await quote(body);
      if (!q.allowed) return stop((q.reasons || []).join(' · '));
      const r = await submit(body);
      btn.textContent = t('sk.run.queued'); note.textContent = r.job.id;
      S.change = { job: r.job.id };
      sse(r.events_url.replace(/^\/api\/v1/, ''), { on: (name, d) => {
        if (name === 'job.progress') note.textContent = `${r.job.id} · shard ${d.shards_done}/${d.shards_total}`;
        if (name === 'shard.done') note.textContent = `${r.job.id} · ${d.shard_id} · ${num(d.ms / 1000, 1)} s`;
        if (name === 'job.done') { note.textContent = `${r.job.id} · job.done · ${d.result_set || ''}`; btn.textContent = t('sk.run'); btn.disabled = false; }
        if (name === 'job.failed') stop(d.error || 'job.failed');
      } });
    } catch (e) { stop(`${e.code || 'error'} · ${e.message || ''}`); }
  }
  const pressed = (k, v) => card.querySelector(`.g-tg[data-k="${k}"]`)?.setAttribute('aria-pressed', String(v));

  async function grid(on = !S.grid) { S.grid = on; pressed('grid', on); map.setPaintProperty('sprawl-grid', 'fill-opacity', on ? 0.72 : 0); }
  async function filament(on = !S.fil) {
    S.fil = on; pressed('fil', on);
    const from = on ? 0 : 1, to = on ? 1 : 0;
    await tween(D[1000], (k) => map.setPaintProperty('filament', 'fill-extrusion-height', ['*', ['get', 'b25'], 26 * (from + (to - from) * k)]));
  }
  async function buildings(on = !S.bld) {
    S.bld = on; pressed('bld', on);
    show(map, 'ovt-3d', true);
    const h = ['coalesce', ['get', 'height'], ['*', ['coalesce', ['get', 'num_floors'], 2], 3]];
    const B = stage.mapB && stage.mapB.getLayer('b-ovt') ? stage.mapB : null;   // 스와이프 양쪽에 같은 건물(현재 = Overture 2026-09)
    if (B) show(B, 'b-ovt', true);
    await tween(D[1000], (k) => { const e = ['*', h, on ? k : 1 - k]; map.setPaintProperty('ovt-3d', 'fill-extrusion-height', e); if (B) B.setPaintProperty('b-ovt', 'fill-extrusion-height', e); });
    if (!on) { show(map, 'ovt-3d', false); if (B) show(B, 'b-ovt', false); }
  }
  /** 스와이프 2017 ↔ 2025 — PC S2 L2A 여름(7–9월) 모자이크 두 장(같은 처리 · Copernicus · export 가능).
      EOX s2cloudless-2017 은 키르기스스탄에서 흰 타일(2026-09-24 실측) → 쓰지 않는다. */
  const swipeSrc = (yr) => swipeSrcOf(ctx, yr);
  async function swipeOn(on = !S.swipe) {
    pressed('swipe', on);
    if (!on) { S.swipe && S.swipe.off(); S.swipe = null; show(map, 'sw-2017', false); if (stage.mapB) { show(stage.mapB, 'b-sw', false); eoxB(stage.mapB, false); } return; }
    if (!map.getSource('sw-2017')) {
      map.addSource('sw-2017', swipeSrc('2017'));
      map.addLayer({ id: 'sw-2017', type: 'raster', source: 'sw-2017', paint: { 'raster-fade-duration': D[500] } }, map.getLayer('lx-fill') ? 'lx-fill' : undefined);
    }
    show(map, 'sw-2017', true);
    const b = await prepB(true);
    await idle(b, D[1250]);   // 오른쪽 2025 타일 도착 뒤에 가르기(빈 반쪽 0)
    const L = document.createElement('span'); L.className = 'gs-chip'; L.innerHTML = `<b>2017</b> Sentinel-2 L2A · Jul–Sep mosaic · Copernicus`;
    const R = document.createElement('span'); R.className = 'gs-chip'; R.innerHTML = `<b>2025</b> Sentinel-2 L2A · Jul–Sep mosaic · Copernicus`;
    S.swipe = swipe(stage, { left: L, right: R, at: 50 });
    return b;
  }
  /** 두 번째 지도 준비 — visible 이 아니면 층을 숨긴 채(가려진 지도가 타일 요청 슬롯을 먹지 않게 · 하강 뭉개짐 원인 제거). */
  async function prepB(visible = false) {
    const b = ensureMapB(stage);
    await stage.mapBReady;
    if (!b.getSource('b-sw')) {
      const eox = ctx.ladder.cat.by['eox-s2cloudless-2025'];
      if (eox && !b.getSource('b-eox')) { b.addSource('b-eox', { type: 'raster', tileSize: 256, tiles: [dcache(rawTiles(eox))], minzoom: 3, maxzoom: 14 }); b.addLayer({ id: 'b-eox', type: 'raster', source: 'b-eox', paint: { 'raster-fade-duration': D[500] } }); }
      b.addSource('b-sw', swipeSrc('2025'));
      b.addLayer({ id: 'b-sw', type: 'raster', source: 'b-sw', paint: { 'raster-fade-duration': D[500] } });
    }
    addOverture(b, 'b-ovt');
    show(b, 'b-ovt', S.bld);
    if (S.bld) b.setPaintProperty('b-ovt', 'fill-extrusion-height', ['coalesce', ['get', 'height'], ['*', ['coalesce', ['get', 'num_floors'], 2], 3]]);
    ['b-maxar', 'b-base'].forEach((l) => b.getLayer(l) && b.setLayoutProperty(l, 'visibility', 'none'));
    if (b.getLayer('b-sw')) b.setLayoutProperty('b-sw', 'visibility', visible ? 'visible' : 'none');
    eoxB(b, visible);
    if (b.getLayer('b-ovt')) show(b, 'b-ovt', S.bld);
    return b;
  }
  function toggle(k) { ({ grid, fil: filament, bld: buildings, swipe: swipeOn })[k](); }

  return {
    S, grid, filament, buildings, swipeOn, prepB, runChange,
    async enter() {
      addLayers(); renderCard();
      stage.inKgz = true;
      // 시범지 라벨 — fx anchor(화면 안으로 반전 · 카드·HUD 회피 · 판정 1차 must_fix 5)
      const avoid = [root.querySelector('#hud')].filter(Boolean);   // fx anchor 는 왼쪽으로만 비킨다 — 좌 카드는 카메라 여백(PAD_REGION left 380)이 피한다
      PILOTS.forEach((p) => pinBox(stage, p.at, `<b>${p.name}</b><span class="g-cyr" lang="ru">${p.cyr}</span><small>${t('pilot.h')} · ${t('pilot.void')}</small>`, { avoid, below: !!p.below }));
    },
    leave() {
      S.swipe && S.swipe.off(); S.swipe = null;
      ['sprawl-grid'].forEach((l) => map.getLayer(l) && map.setPaintProperty(l, 'fill-opacity', 0));
      map.getLayer('filament') && map.setPaintProperty('filament', 'fill-extrusion-height', 0);
      show(map, 'ovt-3d', false); show(map, 'sw-2017', false); if (stage.mapB) { ['b-ovt', 'b-sw'].forEach((l) => show(stage.mapB, l, false)); eoxB(stage.mapB, false); }
      S.grid = S.fil = S.bld = false;
    },
  };
}
