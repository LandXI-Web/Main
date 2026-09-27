/* 글로벌 영상 사다리(설계서 §3.2 · 계약 §4.1 · §8)
   GIBS VIIRS 어제(0–5) → EOX S2 cloudless 2025(5–9 · build=export 면 2017) → PC 월별 S2 모자이크(9–14) → WorldCover → NDVI(지수)
   → Overture 건물(13+) → Maxar 0.5 m(미얀마 · 시연 한정 · export/public 제외 → S2 전후 대체).
   카탈로그: on = GET /catalog/layers · off = data/catalog-fixture-global.json + 같은 라이선스 가드(서버 build_ok 와 같은 규칙). */
import { API, api, catalog, fixture, tileUrl } from '/landxi/shared/api-v1.js';
import { t } from './i18n.js';
import { D, mem, dcache } from './globe-stage.js';

const DATA = new URL('../data/', import.meta.url);
export const MONTHS = ['2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10'];

/** 라이선스 가드 — export: 비상업(NC)·export_policy never 제외 · public: 자체 영상(xyz/pmtiles/cog imagery) 제외. */
export function buildOk(item, build) {
  const lic = String(item.license || '').toUpperCase();
  if (build === 'export') return item.export_policy !== 'never' && !lic.includes('NC');
  if (build === 'public') return item.role !== 'imagery' || item.source === 'external';
  return true;
}

export async function loadCatalog(build, locale) {
  let doc = null, via = 'fixture';
  if (API.mode === 'on') {
    try { doc = await catalog({ stage: 'global', build, locale }); via = 'api'; } catch { doc = null; }
  }
  // on: 게이트웨이 카탈로그가 정본 · F1-D 전용 항목(NDVI 지수 · Maxar · 스와이프 모자이크)이 아직 없으면 픽스처로 채운다(폴백 표기 via)
  const fx = await fixture(new URL('catalog-fixture-global.json', DATA));
  if (!doc) doc = fx;
  else if (fx) {
    const have = new Map(doc.items.map((i) => [i.id, i]));
    for (const f of fx.items) {
      const a = have.get(f.id);
      if (!a) { doc.items.push({ ...f, _from: 'fixture' }); via = 'api+fixture'; }
      else if (f.params) a.params = { ...f.params, ...(a.params || {}) };
    }
  }
  // 영문판 순수(F2-D · integrate 지적 '영문판 라이선스 칩에 국문 (비상업 · export 빌드 제외)'): 게이트웨이 카탈로그의 국문 표기를
  // 픽스처(영문 정본) 값으로 바꾸고, 픽스처에 없는 항목은 알려진 구절을 영문으로 옮긴다(계약 요청: 카탈로그가 locale=en 을 따르기).
  if (locale !== 'ko') {
    const fxBy = Object.fromEntries((fx?.items || []).map((i) => [i.id, i]));
    for (const it of doc?.items || []) for (const k of ['license', 'attribution', 'title', 'note']) {
      if (typeof it[k] !== 'string' || !HANGUL.test(it[k])) continue;
      it[k] = fxBy[it.id] && typeof fxBy[it.id][k] === 'string' && !HANGUL.test(fxBy[it.id][k]) ? fxBy[it.id][k] : enText(it[k]);
    }
  }
  const items = (doc?.items || []).filter((i) => buildOk(i, build));
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  return { items, by, via, ladder: doc?.ladder?.global || [], build };
}

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const EN = [[/비상업\s*·\s*export\s*빌드\s*제외/g, 'non-commercial · excluded from export build'], [/공개/g, 'open data'], [/비상업/g, 'non-commercial'], [/시연 한정/g, 'demo only'], [/무제한/g, 'no restriction']];
/** 국문 구절 → 영문(알려진 것) · 남는 한글은 지운다(영문판에 국문 0). */
export function enText(x) { let v = String(x); for (const [re, en] of EN) v = v.replace(re, en); return v.replace(/[ㄱ-ㆎ가-힣]+/g, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/(\S)\(/g, '$1 (').trim(); }

const rasterPaint = (op = 0, fade = D[500]) => ({ 'raster-opacity': op, 'raster-opacity-transition': { duration: fade, delay: 0 }, 'raster-fade-duration': D[500] });

async function srcOf(item, params) {
  if (item.source === 'xyz') return { tiles: [`${API.dataAlias}/${item.path.replace(/\{z\}.*$/, '')}{z}/{x}/{y}.webp`] };   // on 모드도 junction(계약 변경 요청 §4.2 global/ 접두)
  return tileUrl(item, params);
}

/** 사다리 층 전부를 한 번에 올린다(투명) — 장면은 불투명도만 바꾼다. 타일 미리 받기 = 보이는 층만이므로 visibility 로 제어. */
export async function addLadder(map, cat, { mapB = null } = {}) {
  const L = { cat, months: {}, ndvi: {}, has: {} };
  // EOX 2025(비상업)가 없으면(build=export) EOX 2017 은 중앙아시아에서 흰 타일(실측) → 5–9 는 GIBS 그대로, 9+ 는 PC 모자이크
  const eoxId = cat.by['eox-s2cloudless-2025'] ? 'eox-s2cloudless-2025' : null;
  L.base = eoxId;
  for (const id of [eoxId, 'xdworld-satellite'].filter(Boolean)) {   // V-World 는 한국 bounds 안에서만 · EOX 위
    const it = cat.by[id]; if (!it || map.getSource(id)) continue;
    const src = await srcOf(it);
    // V-World 는 캐시 헤더 없음(휴리스틱) → 메모리 캐시(lxm) — 남원 후퇴 전 z10–12 를 확실히 쥐고 출발(판정 2차 · 첫 0.3 s 뭉개짐)
    if (id === 'xdworld-satellite' && src.tiles) src.tiles = src.tiles.map((u) => (/^https:\/\//.test(u) ? mem(u) : u));
    // EOX(7 d) → 영속 캐시(lxc · Cache Storage) — 재방문 네트워크 0(판정 3차 · HTTP 캐시 밀려남)
    if (id === eoxId && src.tiles) src.tiles = src.tiles.map((u) => (/^https:\/\//.test(u) ? dcache(u) : u));
    map.addSource(id, { type: 'raster', ...src, tileSize: 256, minzoom: it.minzoom, maxzoom: it.maxzoom, bounds: it.bounds, attribution: it.attribution });
    // V-World: z 8 → 7 에서 1 → 0(판정 2차: 후퇴 z7→5 에서 한반도 좌우로 회색·베이지 무자료 타일 사각형 · bounds 는 카탈로그 한국 bbox) — 그 아래는 EOX
    const op = id === 'xdworld-satellite' ? ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1]
      : ['interpolate', ['linear'], ['zoom'], 3, 0, 4, 1];   // 글로브(≤2.4)는 GIBS 어제 · 하강은 3→4 에서 EOX 로(캐시 가능 원천 · GIBS 중간 줌 의존 0)   // 글로브(≤2.4)는 GIBS 어제 · 하강은 3→4 에서 EOX 로(캐시 가능 원천 · GIBS 중간 줌 의존 0)
    map.addLayer({ id, type: 'raster', source: id, paint: { ...rasterPaint(0), 'raster-opacity': op } });   // 글로브에서도 EOX z3 를 받는다(투명) — 하강 z5+ 의 조상 타일(없으면 흰 구멍 · 판정 3차 실측 부족 99 0.4 s)
    L.has[id] = true;
  }
  const mos = cat.by['pc-s2-mosaic'];
  if (mos) for (const m of MONTHS) {
    const sid = mos.params.months[m]; if (!sid) continue;
    const id = 'pc-' + m;
    map.addSource(id, { type: 'raster', ...(await srcOf(mos, { searchid: sid })), tileSize: 256, minzoom: 9, maxzoom: 14, bounds: mos.bounds, attribution: mos.attribution });
    map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' }, paint: rasterPaint(0) });
    L.months[m] = id;
  }
  const wc = cat.by['pc-worldcover-2021'];
  if (wc) wc.params.items.forEach((item, i) => {
    const id = 'wc-' + i; const lon = i ? 75 : 72;
    map.addSource(id, { type: 'raster', tiles: [wc.tiles.replace('{item}', item)], tileSize: 256, minzoom: 9, maxzoom: 14, bounds: [lon, 42, lon + 3, 45], attribution: wc.attribution });
    map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' }, paint: rasterPaint(0) });
  });
  const nd = cat.by['pc-ndvi-mosaic'];
  if (nd) for (const m of MONTHS) {
    const sid = nd.params.months[m]; if (!sid) continue;
    const id = 'ndvi-' + m;
    map.addSource(id, { type: 'raster', tiles: [nd.tiles.replace('{searchid}', sid)], tileSize: 256, minzoom: 9, maxzoom: 14, bounds: nd.bounds, attribution: nd.attribution });
    map.addLayer({ id, type: 'raster', source: id, layout: { visibility: 'none' }, paint: rasterPaint(0, D[500]) });
    L.ndvi[m] = id;
  }
  return L;
}

/** 외부 템플릿의 {year}·{date} 를 채운 원 문자열(두 번째 지도용). */
export function rawTiles(item, extra = {}) {
  const p = { year: item.epoch, date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), ...(item.params || {}), ...extra };
  return String(item.tiles).replace(/\{(year|date)\}/g, (_, k) => p[k]);
}

export function show(map, id, on = true) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); }
export function opacity(map, id, v) { if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', v); }

/** 좌하 사다리 칩 — 지금 보이는 영상 층 이름 + 라이선스(비상업이면 점선 강조). */
export function ladderChip(stage, L, el) {
  const state = { override: null, month: '2025-06' };
  const render = () => {
    const z = stage.map.getZoom();
    let name, lic, nc = false;
    if (state.override) ({ name, lic, nc = false } = state.override);
    else if (z < (L.base ? 3.5 : 5)) { name = t('ladder.gibs', { date: stage.gibs?.date || '' }); lic = 'NASA'; }
    else if ((z < 9 || !stage.pcOn) && L.base) { const it = L.cat.by[L.base]; name = t('ladder.eox2025'); lic = it?.license; nc = /NC/.test(lic || ''); }
    else if (!stage.pcOn) { name = t('ladder.gibs', { date: stage.gibs?.date || '' }) + ' · build=export'; lic = 'NASA'; }
    else { name = t('ladder.pcmos', { month: state.month }); lic = 'Copernicus · PC'; }
    el.innerHTML = `<span class="g-ladder__now g-glass" ${nc ? 'data-nc' : ''} data-ladder="${name}"><b>${name}</b><i>${lic ? '(' + lic + ')' : ''}</i></span>`;
  };
  stage.map.on('zoomend', render); stage.map.on('moveend', render);
  return { render, set(o) { state.override = o; render(); }, month(m) { state.month = m; render(); } };
}

/** Maxar 불가 + 카탈로그에 S2 전후 항목도 없을 때만 — 계약 §4.3 프록시(on)로 검색. off 는 null(결손 칩).
    브라우저 직접 POST 검색은 PC 가 CORS 사전요청을 거절(2026-09-24 실측) → 쓰지 않는다. */
export async function s2Pair(bbox) {
  if (API.mode !== 'on') return { pre: null, post: null };
  const PC = 'https://planetarycomputer.microsoft.com/api';
  const one = async (dt) => {
    try {
      const j = await api(`/proxy/pc/stac/search?bbox=${bbox.join(',')}&datetime=${dt}&collections=sentinel-2-l2a`);
      const f = (j.features || []).sort((a, b) => a.properties['eo:cloud_cover'] - b.properties['eo:cloud_cover'])[0];
      return f ? { id: f.id, date: f.properties.datetime.slice(0, 10), tiles: `${PC}/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&item=${f.id}&assets=visual&asset_bidx=visual|1,2,3&nodata=0` } : null;
    } catch { return null; }
  };
  return { pre: await one('2025-03-01/2025-03-27'), post: await one('2025-03-29/2025-04-20') };
}
