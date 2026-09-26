/* K-2 메이크틸라 — dp-mm-meiktila-25(tenant lx · shadow · 시연 한정)
   Maxar 전(2025-03-06) ↔ 후(2025-04-03) 스와이프(G5 XYZ · build=export|public 이거나 타일 없으면 S2 전후로 대체 표기)
   · EMS 38점 → Overture 건물 등급 채색(Destroyed 잉크 · Damaged 액센트 · Possibly 슬레이트 — 빨강은 조치 글자만)
   · 등급별 차트(봉투 measured · EMS) · 출처 칩 '© EU Copernicus EMS · Maxar Open Data CC BY-NC 4.0 · 시연 한정'. */
import { fixture } from '/landxi/shared/api-v1.js';
import { t, num } from './i18n.js';
import { D, prov, lockOn, wait, ensureMapB, swipe, STAGGER, idle } from './globe-stage.js';
import { cardHead, reveal } from './cards-global.js';
import { show, s2Pair, rawTiles } from './ladder-global.js';

const DATA = new URL('../data/', import.meta.url);
export const CAM_MK = { center: [95.884, 20.892], zoom: 13.9, pitch: 0, bearing: 0 };   // Maxar 타일 범위 [95.858, 20.864, 95.934, 20.937] 안
export const CAM_MK_DETAIL = { center: [95.8624, 20.8816], zoom: 16.55, pitch: 0, bearing: 0 };   // EMS 피해 7동 밀집(파괴 1 · 피해 4 · 가능 2)
const GRADE = [
  { k: 'Destroyed', i18n: 'mk.destroyed', color: '#010102' },
  { k: 'Damaged', i18n: 'mk.damaged', color: '#006DF7' },
  { k: 'Possibly damaged', i18n: 'mk.possibly', color: '#8F99A8' },
];
const FILL = ['match', ['get', 'damage_gra'], 'Destroyed', '#010102', 'Damaged', '#006DF7', '#8F99A8'];

export async function loadMeiktila() {
  const [dmg, aoi] = await Promise.all(['mm-meiktila-damage.geojson', 'mm-meiktila-aoi.geojson'].map((f) => fixture(new URL(f, DATA))));
  return { dmg, aoi };
}

function centroid(f) {
  const r = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : [f.geometry.coordinates];
  const n = r.length; return [r.reduce((a, p) => a + p[0], 0) / n, r.reduce((a, p) => a + p[1], 0) / n];
}

function addDamage(m, d, prefix = '') {
  if (m.getSource(prefix + 'dmg')) return;
  const pts = { type: 'FeatureCollection', features: d.dmg.features.map((f) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: centroid(f) } })) };
  m.addSource(prefix + 'dmg', { type: 'geojson', data: d.dmg });
  m.addSource(prefix + 'dmg-pt', { type: 'geojson', data: pts });
  m.addSource(prefix + 'aoi', { type: 'geojson', data: d.aoi });
  m.addLayer({ id: prefix + 'aoi', type: 'line', source: prefix + 'aoi', filter: ['==', ['get', 'kind'], 'aoi'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
  m.addLayer({ id: prefix + 'dmg-halo', type: 'line', source: prefix + 'dmg', paint: { 'line-color': FILL, 'line-width': 7, 'line-blur': 2, 'line-opacity': 0, 'line-opacity-transition': { duration: D[500], delay: 0 } } });
  m.addLayer({ id: prefix + 'dmg-fill', type: 'fill', source: prefix + 'dmg', paint: { 'fill-color': FILL, 'fill-opacity': 0, 'fill-opacity-transition': { duration: D[500], delay: 0 } } });
  m.addLayer({ id: prefix + 'dmg-line', type: 'line', source: prefix + 'dmg', paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-opacity': 0, 'line-opacity-transition': { duration: D[500], delay: 0 } } });
  m.addLayer({ id: prefix + 'dmg-pt', type: 'circle', source: prefix + 'dmg-pt', maxzoom: 15.2,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 15, 7], 'circle-color': FILL, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1.5,
             'circle-opacity': 0, 'circle-stroke-opacity': 0, 'circle-opacity-transition': { duration: D[500], delay: 0 }, 'circle-stroke-opacity-transition': { duration: D[500], delay: 0 } } });
}
function damageOn(m, prefix = '', on = true) {
  if (!m.getLayer(prefix + 'dmg-fill')) return;
  m.setPaintProperty(prefix + 'dmg-fill', 'fill-opacity', on ? 0.82 : 0);
  m.setPaintProperty(prefix + 'dmg-halo', 'line-opacity', on ? 0.45 : 0);
  m.setPaintProperty(prefix + 'dmg-line', 'line-opacity', on ? 1 : 0);
  m.setPaintProperty(prefix + 'dmg-pt', 'circle-opacity', on ? 1 : 0);
  m.setPaintProperty(prefix + 'dmg-pt', 'circle-stroke-opacity', on ? 1 : 0);
}

export function meiktilaScene(stage, ctx) {
  const { map, root } = stage;
  const card = root.querySelector('#card');
  const d = ctx.mk;
  const S = { swipe: null, fallback: null, maxar: !!ctx.ladder.cat.by['maxar-mm-meiktila'] && !!ctx.ladder.cat.by['maxar-mm-meiktila-pre'] };

  async function imagery() {
    const cat = ctx.ladder.cat;
    const pre = cat.by['maxar-mm-meiktila-pre'], post = cat.by['maxar-mm-meiktila'];
    let A, B;
    if (S.maxar) {
      A = { tiles: [`/landxi/data/${pre.path}`], bounds: pre.bounds, minzoom: 12, maxzoom: 17, attribution: pre.attribution };
      B = { tiles: [`/landxi/data/${post.path}`], bounds: post.bounds, minzoom: 12, maxzoom: 17, attribution: post.attribution };
    } else {   // Maxar 불가 → S2 전후(PC STAC) · 표기
      const pi = cat.by['s2-mm-meiktila-pre'], po = cat.by['s2-mm-meiktila-post'];   // 사전 수집(G2) — 없으면 런타임 검색
      S.fallback = pi && po ? { pre: { id: pi.params.item, date: pi.epoch, tiles: pi.tiles }, post: { id: po.params.item, date: po.epoch, tiles: po.tiles } } : await s2Pair([95.82, 20.85, 95.91, 20.92]);
      if (S.fallback.pre) A = { tiles: [S.fallback.pre.tiles], bounds: cat.by['s2-mm-meiktila-pre']?.bounds || [95.82, 20.85, 95.91, 20.92], minzoom: 10, maxzoom: 14 };
      if (S.fallback.post) B = { tiles: [S.fallback.post.tiles], bounds: cat.by['s2-mm-meiktila-post']?.bounds || [95.82, 20.85, 95.91, 20.92], minzoom: 10, maxzoom: 14 };
    }
    if (A && !map.getSource('mk-pre')) {
      map.addSource('mk-pre', { type: 'raster', tileSize: 256, ...A });
      map.addLayer({ id: 'mk-pre', type: 'raster', source: 'mk-pre', paint: { 'raster-fade-duration': D[500], 'raster-opacity': 1 } }, map.getLayer('lx-fill') ? 'lx-fill' : undefined);
    }
    const b = ensureMapB(stage);
    await stage.mapBReady;
    if (b.getLayer('b-eox')) b.setLayoutProperty('b-eox', 'visibility', 'none');
    const eox = cat.by['eox-s2cloudless-2025'];
    if (eox && !b.getSource('b-base')) {
      b.addSource('b-base', { type: 'raster', tiles: [rawTiles(eox)], tileSize: 256, minzoom: 3, maxzoom: 14 });
      b.addLayer({ id: 'b-base', type: 'raster', source: 'b-base', paint: { 'raster-fade-duration': D[500] } });
    }
    if (A && !b.getSource('b-pre')) {   // 도착 크로스페이드용 — 본 지도와 같은 사전 영상(평소 숨김)
      b.addSource('b-pre', { type: 'raster', tileSize: 256, ...A });
      b.addLayer({ id: 'b-pre', type: 'raster', source: 'b-pre', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': D[500] } });
    }
    if (B && !b.getSource('b-maxar')) {
      b.addSource('b-maxar', { type: 'raster', tileSize: 256, ...B });
      b.addLayer({ id: 'b-maxar', type: 'raster', source: 'b-maxar', paint: { 'raster-fade-duration': D[500] } });
    }
    bImagery(false);   // 스와이프를 켤 때만 받는다(하강 중 가려진 두 번째 지도가 타일 슬롯을 먹지 않게)
    ['b-eox', 'b-sw'].forEach((l) => b.getLayer(l) && b.setLayoutProperty(l, 'visibility', 'none'));
    addDamage(b, d, 'b-');
  }

  function bImagery(on) {
    const b = stage.mapB; if (!b) return;
    ['b-maxar', 'b-base'].forEach((l) => b.getLayer(l) && b.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'));
  }
  function renderCard() {
    const dep = ctx.deploys.byId['dp-mm-meiktila-25'];
    const c = d.dmg.lx.counts;
    const max = Math.max(...GRADE.map((g) => c[g.k].value));
    card.innerHTML = cardHead(dep, { title: t('mk.h'), place: t('mk.place') }) + `
      <section class="g-sec g-in-3"><div class="g-sec__t"><span>${t('mk.grades')}</span><b>${num(d.dmg.lx.total.value)}</b></div>
        <ul class="g-grades" id="mk-grades">${GRADE.map((g) => `<li class="g-grade"><span><i class="g-sw" style="background:${g.color};transform:none;display:inline-block"></i>${t(g.i18n)}</span><i style="width:${(c[g.k].value / max * 100).toFixed(1)}%;background:${g.color}"></i><em>${c[g.k].value}</em></li>`).join('')}</ul>
        <div id="mk-prov" style="margin-top:10px;display:grid;gap:6px"></div></section>
      <div class="g-toggles" role="group" style="margin-top:12px"><button class="g-tg" data-k="swipe" aria-pressed="false">${t('mk.tg.swipe')}</button></div>
      <section class="g-sec g-in-4"><div class="gs-void" id="mk-lic"><b>CC BY-NC</b> · ${t('mk.lic')}</div><div class="g-note" style="margin-top:8px">${t('mk.not')}</div></section>`;
    card.querySelector('.g-tg[data-k="swipe"]').onclick = (e) => {
      const on = !S.swipe; e.currentTarget.setAttribute('aria-pressed', String(on));
      if (on) { bImagery(true); idle(stage.mapB, D[1250]).then(() => { if (!S.swipe) { const { L, R } = chips(); S.swipe = swipe(stage, { left: L, right: R, at: 50 }); } }); }
      else { S.swipe && S.swipe.off(); S.swipe = null; }
    };
    const p = card.querySelector('#mk-prov');
    p.appendChild(prov(d.dmg.lx.total));
    p.appendChild(prov(d.dmg.lx.joined));
    reveal(card);   // 내용이 다 찬 뒤 카드 전체를 한 번에(빈 유리 상자 선행 0 · 판정 2차)
  }

  function chips() {
    const L = document.createElement('span'); L.className = 'gs-chip';
    const R = document.createElement('span'); R.className = 'gs-chip';
    if (S.maxar) { L.innerHTML = `<b>${t('mk.pre')}</b> · CC BY-NC`; R.innerHTML = `<b>${t('mk.post')}</b> · CC BY-NC`; }
    else { L.innerHTML = `<b>${t('mk.s2pre')}</b> ${S.fallback?.pre?.date || ''}`; R.innerHTML = `<b>${t('mk.s2post')}</b> ${S.fallback?.post?.date || ''}`; }
    return { L, R };
  }

  return {
    S,
    async prepare() { await imagery(); addDamage(map, d); },
    async enter() {
      stage.inKgz = false;
      renderCard();
      ctx.chip.set(S.maxar ? { name: t('ladder.maxar', { date: '2025-03-06 ↔ 04-03' }), lic: 'CC BY-NC 4.0', nc: true }
        : { name: t('ladder.s2', { date: `${S.fallback?.pre?.date} ↔ ${S.fallback?.post?.date}` }), lic: 'Copernicus' });
      damageOn(map); damageOn(stage.mapB, 'b-');
      await wait(D[500]);
      card.querySelector('#mk-grades')?.setAttribute('data-on', '');
    },
    /** 락온 — 지금 화면 안의 피해 건물(없으면 파괴 4동) · 380 · 스태거 120(사다리 값). */
    lockVisible(max = 8) {
      const b = map.getBounds();
      const inView = d.dmg.features.filter((f) => { const [x, y] = centroid(f); return b.contains([x, y]); });
      const list = (inView.length ? inView : d.dmg.features.filter((f) => f.properties.damage_gra === 'Destroyed')).slice(0, max);
      list.forEach((f, i) => {
        const [x, y] = centroid(f); const e = map.getZoom() > 16 ? 0.00016 : 0.00035;
        setTimeout(() => lockOn(stage, [x - e, y - e, x + e, y + e]), [0, 120, 180, 380, 500, 750, 1000, 1250][i] || 1250);
      });
      return list.length;
    },
    bOn() { bImagery(true); },
    /** 도착 크로스페이드 층(arriveCross) — 두 번째 지도에 본 지도와 같은 화면(EOX + 사전 Maxar). */
    coverLayers(B, on) { const v = (l, x) => B.getLayer(l) && B.setLayoutProperty(l, 'visibility', x ? 'visible' : 'none'); v('b-base', on); v('b-pre', on); v('b-maxar', false); if (B.getLayer('b-eox')) v('b-eox', false); if (B.getLayer('b-sw')) v('b-sw', false); },
    swipeOn(at = 50) { bImagery(true); const { L, R } = chips(); S.swipe = swipe(stage, { left: L, right: R, at }); card.querySelector('.g-tg[data-k="swipe"]')?.setAttribute('aria-pressed', 'true'); return S.swipe; },
    leave() { S.swipe && S.swipe.off(); S.swipe = null; bImagery(false); damageOn(map, '', false); if (stage.mapB) { damageOn(stage.mapB, 'b-', false); } ctx.chip.set(null); },
  };
}
