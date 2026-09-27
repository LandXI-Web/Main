/* v3 global — 서비스 사용자 집 · 해외(명세 §2.15). UI en.
   질문 하나: "Where did my district change this season?"
   글로브(흰) → 대상국 → 지역 · HUD Crop condition drop · 시트 392(Season · NDVI · Sprawl) · Run this season(kind index · CPU 작업 큐).
   부품 K1 K2 K3 K5 K6 K9 K10 K12 K15 · 데이터 landxi/global/data/* · 지역은 변수(URL ?country=&district= 또는 기관 배포 범위). */
import * as K from '/landxi/v3/kit/index.js';
import { api, API, isEnvelope, bboxOf, h, esc, LS, RM } from '/landxi/v3/kit/util.js';
import { probe, sse } from '/landxi/shared/api-v1.js';
import { loadCatalog, MONTHS } from '/landxi/global/js/ladder-global.js';
import { loadYsData } from '/landxi/global/js/ndvi-theater.js';
import { loadSprawl } from '/landxi/global/js/sprawl.js';
import { D } from '/landxi/global/js/globe-stage.js';
import * as NT from './ndvi-tiles.js';

const q = new URLSearchParams(location.search);
const DATA = '/landxi/global/data/';
const T = (k, v) => K.t(k, v);
const STR = {   // 명세 §2.15 문구 전부(en) — 이 밖의 글자는 데이터(나라·지역·달 이름)뿐
  ask: 'Ask', exit: 'Sign out', hud: 'Crop condition drop · {district}', km2: 'km²',
  tabs: ['Season', 'NDVI', 'Sprawl'], run: 'Run this season', dl: 'Download',
  computing: 'Computing · about {n}s', none: 'No imagery for this season yet', req: 'Request imagery',
  noresult: 'No result yet', checking: 'Checking…',
  guard: 'Outside your districts', maperr: 'Could not load the map', retry: 'Try again',
  help: 'Help',
  helpLines: ['Pick a district on the map to see what changed this season.', 'Run this season updates the result with the latest satellite images.', '~ marks an estimate. Hover it to see what was measured and when.'],
  contact: 'Contact', mail: 'landxi@lx.or.kr', tel: '+82 63-713-1218',
};
/** 호버 한 줄(what · 기간) — HUD 정의와 같은 말 */
const DROP_WHAT = (s, prev) => `Cropland where NDVI fell ${NT.DROP} or more vs ${prev} · ${s}`;
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
/** 나라 → 경계 파일(예시 데이터 파일 이름 · 지역 문자열 하드코딩 아님). 없으면 배포 범위 자체가 지역이 된다. */
const ADM = {
  KGZ: { adm1: 'kgz-adm1.geojson', adm2: 'kgz-adm2.geojson', name: (p) => p.name, id: (p) => p.code },
  MMR: { adm2: 'mm-meiktila-aoi.geojson', keep: (p) => p.kind === 'aoi', name: (p) => p.locality, id: (p) => 'mmr-' + (p.emsr_id || p.area_id) },
};
const SEASON_OF = (m) => ({ 3: 'Spring', 4: 'Spring', 5: 'Spring', 6: 'Summer', 7: 'Summer', 8: 'Summer', 9: 'Autumn', 10: 'Autumn', 11: 'Autumn', 12: 'Winter', 1: 'Winter', 2: 'Winter' }[+m.slice(5)]);
const MON = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });
const MONY = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 기하 도우미 ── */
function ringHas(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function geomHas(g, x, y) {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.some((p) => ringHas(p[0], x, y) && !p.slice(1).some((hole) => ringHas(hole, x, y)));
}
const R = 6371.0088, RAD = Math.PI / 180;
const bboxKm2 = (b) => R * R * (b[2] - b[0]) * RAD * (Math.sin(b[3] * RAD) - Math.sin(b[1] * RAD));
const inter = (a, b) => { const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]; return r[0] < r[2] && r[1] < r[3] ? r : null; };
const ring = (b) => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const envOf = (value, unit, basis, source, as_of) => ({ value, unit, basis, as_of: as_of || new Date().toISOString(), source });
const V = (x) => (isEnvelope(x) ? x.value : x);

/* ── 상태 ── */
const S = { tab: Math.max(0, STR.tabs.map((x) => x.toLowerCase()).indexOf((q.get('tab') || '').toLowerCase())), level: 'globe', country: null, district: null, season: null, run: null };

async function main() {
  const who = await K.gate('global');
  // 첫 확인이 늦으면(느린 기기 · 게이트웨이 바쁨) off 로 굳지 않게 한 번 더 — 실패를 '배포 없음'으로 두지 않는다
  // /health 가 0.5–6 s 걸릴 때가 있다(실측) — 기본 1.5 s 에 끊기면 off 로 굳어 배포 0 처럼 보인다 → 이 화면은 8 s 까지 기다린다
  if (!(await probe()).ok) { API.probeMs = Math.max(API.probeMs || 0, 8000); await probe(true); }
  const isLX = who.me.realm === 'lx';

  /* 기관 이름(영문) — 공개 디렉터리(S-1) → 기관 디렉터리 → 배포 지역 이름. 국문은 쓰지 않는다. */
  const tenantId = who.me.tenant_id;
  let orgEn = '', orgShort = '';
  if (tenantId) {
    const pickName = (n) => { if (!orgEn && n?.en) { orgEn = n.en; orgShort = n.short_en || n.short || ''; } };
    if (await K.hasRoute('/auth/tenants')) { try { const j = await api('/auth/tenants'); pickName((j.items || []).find((x) => x.id === tenantId)?.name); } catch { /* 아래로 */ } }
    if (!orgEn) { try { const j = await (await fetch('/landxi/ops/data/fixtures/tenants.json')).json(); pickName(((j.items || j).find?.((x) => x.id === tenantId))?.name); } catch { /* 아래로 */ } }
    if (!orgEn) pickName(who.tenant?.name);
  }
  // 마스트 좌 = 짧은 이름(name.short 또는 괄호 앞까지) · 역할 칩 = 전체 이름(첫 뷰 글자 예산 ≤ 200)
  if (!orgShort || HANGUL.test(orgShort)) orgShort = orgEn.replace(/\s*\(.*$/, '').trim() || orgEn;
  // 역할 칩도 짧은 이름(전체 이름은 칩 풍선) — 키트 roleText 가 ' · ' 로 나누므로 이름 안 ' · '(예: 'Sokuluk · Bishkek')가 칩을 깨지 않게
  const whoEn = { ...who, org: orgShort, name: HANGUL.test(who.name) ? '' : who.name };
  // `?` = 영문 도움 서랍(짧은 안내 3줄 + 문의 1줄) — 키트 기본(help-my iframe)은 국문이라 쓰지 않는다
  const helpOpen = () => K.drawer({ title: STR.help, label: STR.help, body: h('div.gl-help', {},
    ...STR.helpLines.map((s) => h('p', { text: s })),
    h('p.gl-help-c', {}, h('span', { text: STR.contact + ' ' }), h('a', { href: 'mailto:' + STR.mail, text: STR.mail }), h('span', { text: ' · ' + STR.tel }))) });
  const SH = K.shell({ who: whoEn, home: 'global', title: orgShort || 'Global', onHelp: helpOpen });
  if (orgEn && orgEn !== orgShort) SH.app.querySelector('.k-role')?.setAttribute('title', orgEn);
  document.title = `Land-XI · ${orgShort || 'Global'}`;
  if (!whoEn.name && isLX) { const r = SH.app.querySelector('.k-role'); if (r) r.textContent = T('shell.role.' + who.key.slice(3), { name: '' }).replace(/\s·\s*$/, ''); }

  /* ── 판 ── */
  const main = SH.main;
  main.classList.add('gl');
  const stageEl = h('div.gl-stage');
  const crumbs = h('nav.gl-crumbs', { 'aria-label': 'Location' });
  const hudEl = h('div.gl-hud', { 'aria-live': 'polite' });
  const guard = h('div.gl-guard', { role: 'status', hidden: true, text: STR.guard });
  const tip = h('div.gl-tip', { hidden: true });
  const sheet = K.card({ map: true, cls: 'gl-sheet' });
  main.append(stageEl, crumbs, hudEl, guard, tip, sheet);

  /* ── 데이터(병렬) ── */
  const fx = (f) => fetch(DATA + f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  /** 꼭 있어야 하는 것(배포 · 나라 경계 · 카탈로그)은 세 번까지 받는다 — 실패를 '배포 없음'으로 두지 않는다 */
  const must = async (fn, what) => { for (let a = 0; a < 4; a++) { try { const v = await fn(); if (v) return v; } catch (e) { if (a === 3) console.warn('[global] load', what, e?.message || e); } if (a < 3) { await wait(800 * 2 ** a); if (API.mode === 'off') await probe(true); } } throw new Error('load ' + what); };
  const needJ = (u) => () => fetch(u).then((r) => (r.ok ? r.json() : null));
  let depJ, cat, lx, ys, sprawl, sprawlYs, jobsJ, prevYr;
  try {
    [depJ, cat, lx, ys, sprawl, sprawlYs, jobsJ, prevYr] = await Promise.all([
      must(() => api('/deploys?scope=global').then((j) => (Array.isArray(j?.items) ? j : null)), 'deploys'),
      must(() => loadCatalog(isLX ? 'lx' : 'tenant', 'en').then((c) => (c?.by ? c : null)), 'catalog'),
      must(needJ(DATA + 'lx-countries.json'), 'countries'), loadYsData().catch(() => ({})), loadSprawl().catch(() => null),
      fetch('data/kgz-sprawl-ysykata-2017-2025.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      api('/jobs?limit=50').catch(() => ({ items: [] })),
      fetch('data/pc-mosaics-2024.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
  } catch { return loadError(); }
  const JOBS = [...(jobsJ.items || [])];
  const kr = (b) => b[0] >= 124 && b[2] <= 132.5 && b[1] >= 32.5 && b[3] <= 39.5;
  const seen = new Set();
  const deploys = (depJ.items || []).filter((d) => {
    const b = bboxOf(d.aoi); if (!b || kr(b)) return false;
    if (!isLX && d.tenant_id !== tenantId) return false;
    const k = d.region_profile || d.id; if (seen.has(k)) return false; seen.add(k); return true;
  }).map((d) => ({ ...d, bbox: bboxOf(d.aoi) }));
  SH.fresh(depJ.as_of || null);

  /* 나라 = 배포 범위 중심이 든 나라(세계 경계) */
  const world = lx?.world || { type: 'FeatureCollection', features: [] };
  const countryOf = (pt) => world.features.find((f) => geomHas(f.geometry, pt[0], pt[1]));
  const countries = new Map();
  for (const d of deploys) {
    const c = countryOf(center(d.bbox)); if (!c) continue;
    const iso = c.properties.iso3;
    if (!countries.has(iso)) countries.set(iso, { iso, name: c.properties.name, feature: c, bbox: bboxOf(c), deploys: [] });
    countries.get(iso).deploys.push(d);
  }

  /* 지역(ADM2) — 나라마다 경계 파일 · 내 지역 = 배포 범위와 겹치는 지역(표본점 15% 이상) */
  const admCache = {};
  async function districtsOf(C) {
    if (admCache[C.iso]) return admCache[C.iso];
    const A = ADM[C.iso];
    let fc = null;
    if (A) fc = C.iso === 'KGZ' && ys.adm2 ? ys.adm2 : await fx(A.adm2);
    // 경계 미확보 사각형(level 'bbox')은 지역이 아니다 — 착지·선택 후보에서 뺀다
    const feats = (fc?.features || []).filter((f) => (!A?.keep || A.keep(f.properties)) && f.properties?.level !== 'bbox' && f.properties?.boundary !== 'not_acquired').map((f) => ({
      id: A.id(f.properties), name: A.name(f.properties), feature: f, bbox: f.properties.bbox || bboxOf(f),
    }));
    if (!feats.length) for (const d of C.deploys) feats.push({ id: d.region_profile || d.id, name: (d.region_name?.en || '').split(',')[0], feature: { type: 'Feature', properties: {}, geometry: d.aoi }, bbox: d.bbox });
    for (const D0 of feats) {
      D0.mine = false; D0.deploy = null;
      for (const d of C.deploys) {
        const ib = inter(D0.bbox, d.bbox); if (!ib) continue;
        let n = 0, hit = 0;
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
          const x = d.bbox[0] + ((i + 0.5) / 12) * (d.bbox[2] - d.bbox[0]), y = d.bbox[1] + ((j + 0.5) / 12) * (d.bbox[3] - d.bbox[1]);
          if (!geomHas(d.aoi, x, y)) continue; n++; if (geomHas(D0.feature.geometry, x, y)) hit++;
        }
        const share = n ? hit / n : 0;
        if (share >= 0.15 || feats.length === 1) { D0.mine = true; if (!D0.deploy || share > D0.share) { D0.deploy = d; D0.share = share; } }
      }
    }
    const adm1 = A?.adm1 ? await fx(A.adm1) : null;
    return (admCache[C.iso] = { feats, adm1 });
  }

  /* Sprawl — 2017·2025 건물 면적(500 m 격자) · 격자가 지역을 90% 이상 덮을 때만 값(부분값을 지역 값처럼 두지 않는다) */
  const COVER_MIN = 0.9;
  const r1 = (v) => Math.round(v * 10) / 10;
  const grids = [sprawl, sprawlYs].filter((g) => g?.grid?.features).map((g) => ({
    bbox: g.bbox || g.source_params?.bbox, src: g.summary?.delta_km2?.source || 'Sentinel-2 land cover 2017 vs 2025', as_of: g.summary?.delta_km2?.as_of,
    cells: g.grid.features.map((f) => { const b = bboxOf(f); return { b, c: center(b), d: +f.properties.d || 0, b17: +f.properties.b17 || 0, b25: +f.properties.b25 || 0, f }; }),
  }));
  /** 지역 폴리곤 중 격자 범위 안 비율(표본점 48×48) */
  function coverOf(D0, gb) {
    let n = 0, hit = 0; const b = D0.bbox;
    for (let i = 0; i < 48; i++) for (let j = 0; j < 48; j++) {
      const x = b[0] + ((i + 0.5) / 48) * (b[2] - b[0]), y = b[1] + ((j + 0.5) / 48) * (b[3] - b[1]);
      if (!geomHas(D0.feature.geometry, x, y)) continue; n++;
      if (x >= gb[0] && x <= gb[2] && y >= gb[1] && y <= gb[3]) hit++;
    }
    return n ? hit / n : 0;
  }
  function sprawlOf(D0) {
    const best = grids.map((g) => ({ g, cov: g.bbox ? coverOf(D0, g.bbox) : 0 })).sort((a, b) => b.cov - a.cov)[0];
    if (!best || best.cov < COVER_MIN) return null;
    const { g } = best;
    const inCells = g.cells.filter((c) => c.c[0] >= D0.bbox[0] && c.c[0] <= D0.bbox[2] && c.c[1] >= D0.bbox[1] && c.c[1] <= D0.bbox[3] && geomHas(D0.feature.geometry, c.c[0], c.c[1]));
    let a17 = 0, a25 = 0;
    for (const c of inCells) { const a = bboxKm2(c.b); a17 += (c.b17 / 100) * a; a25 += (c.b25 / 100) * a; }
    return { cells: inCells, cover: best.cov, b17: envOf(r1(a17), 'km2', 'estimate', g.src, g.as_of), b25: envOf(r1(a25), 'km2', 'estimate', g.src, g.as_of) };
  }

  /* HUD 결과 캐시(지역|계절) — 정의는 아래 changeOf · 작업이 없거나 경작지 화소의 90% 미만만 두 해 값이 있으면 'No result yet'. */
  const CH = {};
  if (q.get('dev') === '1') window.__glCH = CH;   // ?dev=1 서랍 전용(정의 검증)
  const sameMonths = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);
  const jobIn = (j, D0) => { const b = j.aoi && bboxOf(j.aoi); return !!b && geomHas(D0.feature.geometry, ...center(b)); };
  const seasonJob = (D0, s) => JOBS.filter((j) => j.kind === 'index' && j.state === 'done' && sameMonths(j.options?.months, s.months) && jobIn(j, D0))
    .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)))[0] || null;
  const tiles = { grid: {}, mask: {}, paint: {} };
  function geoOf(D0) {
    tiles.grid[D0.id] ||= NT.gridOf(D0.bbox);
    tiles.mask[D0.id] ||= NT.maskOf(tiles.grid[D0.id], D0.feature.geometry);
    return { grid: tiles.grid[D0.id], mask: tiles.mask[D0.id] };
  }
  const sidOf = (m) => ndm?.params?.months?.[m] || null;
  /** 전년 같은 달 모자이크(같은 등록 규칙 · data/pc-mosaics-2024.json) */
  const prevOf = (m) => { const p = `${+m.slice(0, 4) - 1}${m.slice(4)}`; return { m: p, sid: prevYr?.months?.[p] || null }; };
  const wc = cat?.by?.['pc-worldcover-2021'];
  /* Crop condition drop(HUD) — 이번 계절 실행 결과에 묶는다.
     이 지역·이 계절의 끝난 index 작업이 있을 때만: 경작지(WorldCover class 40) 중 이번 계절 평균 NDVI 가
     전년 같은 계절 평균보다 0.1 이상 낮은 화소 면적(km²). 계절 안 녹화·갈변(첫 달↔마지막 달)은 세지 않는다. */
  function changeOf(D0, s) {
    const key = D0.id + '|' + s.key;
    if (CH[key]) return CH[key];
    const job = seasonJob(D0, s);
    const cur = s.months.filter(sidOf), prev = s.months.map(prevOf).filter((x) => x.sid);
    if (!job || !ndm || !wc || !cur.length || !prev.length) return (CH[key] = { state: 'none' });
    const R0 = (CH[key] = { state: 'calc' });
    R0.p = (async () => {
      const { grid, mask } = geoOf(D0);
      const [crop, A, B] = await Promise.all([
        NT.cropOf(wc.tiles, wc.params?.items || [], grid),
        Promise.all(cur.map((m) => NT.monthOf(ndm.tiles, sidOf(m), grid))),
        Promise.all(prev.map((x) => NT.monthOf(ndm.tiles, x.sid, grid))),
      ]);
      if (!crop) { Object.assign(R0, { state: 'low' }); return R0; }
      const r = await NT.dropOf(A, B, mask, crop, grid);
      if (r.coverage < COVER_MIN) { Object.assign(R0, { state: 'low', cover: r.coverage }); return R0; }
      const y0 = s.key.replace(/\d{4}$/, (y) => String(+y - 1));
      const span = `${MON(s.months[0])}–${MONY(s.months[s.months.length - 1])}`;
      Object.assign(R0, { state: 'ok', cover: r.coverage, url: r.url, cropKm2: r.cropKm2,
        env: envOf(r1(r.km2), 'km2', 'estimate', DROP_WHAT(span, y0), job.finished_at) });
      return R0;
    })().catch(() => Object.assign(R0, { state: 'low' }));
    R0.p.then(() => { if (S.district === D0 && S.season === s) { hud(D0); if (S.tab === 0) renderSheet(); else dlCheck(D0); } });
    return R0;
  }

  /* NDVI — 이 지역의 마지막 계산(작업 결과) → 없으면 기록 파일(같은 지역일 때만) */
  const ndviCache = {};
  async function ndviOf(D0) {
    if (ndviCache[D0.id]) return ndviCache[D0.id];
    const out = {};
    const jobs = JOBS.filter((j) => j.kind === 'index' && j.state === 'done' && j.aoi && (() => { const b = bboxOf(j.aoi); return b && geomHas(D0.feature.geometry, ...center(b)); })())
      .sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at))).slice(-3);
    for (const j of jobs) {
      try { const r = await api(`/results/${encodeURIComponent(j.id)}/index?format=json`); for (const it of r.items || []) if (isEnvelope(it.ndvi_mean)) out[it.month] = it.ndvi_mean; } catch { /* 다음 작업 */ }
    }
    const nd = ys.nd;
    if (nd?.aoi && geomHas(D0.feature.geometry, ...center(nd.aoi))) for (const m of nd.months || []) if (!out[m.month] && isEnvelope(m.ndvi_mean)) out[m.month] = m.ndvi_mean;
    return (ndviCache[D0.id] = out);
  }

  /* 영상 있음 — 월별 S2 모자이크 범위가 지역 중심을 덮는가 */
  const mos = cat?.by?.['pc-s2-mosaic'], ndm = cat?.by?.['pc-ndvi-mosaic'];
  const covered = (D0, item = mos) => !!item?.bounds && !!inter(D0.bbox, item.bounds);

  /* 계절 — 월 목록에서(최근 계절이 기본) */
  const seasons = [];
  for (const m of MONTHS) { const k = `${SEASON_OF(m)} ${m.slice(0, 4)}`; let s = seasons.find((x) => x.key === k); if (!s) seasons.push(s = { key: k, months: [] }); s.months.push(m); }
  S.season = seasons.find((s) => s.key === q.get('season')) || seasons[seasons.length - 1];

  /* ── 무대 ── */
  let st;
  try { st = K.createStage(stageEl, { bounds: [-170, -58, 170, 75] }); } catch { return mapError(); }
  const map = st.map;
  map.getCanvas().setAttribute('aria-label', 'Map');
  const failT = setTimeout(() => { if (!stageEl.classList.contains('is-ready')) mapError(); }, 20000);
  await st.ready; clearTimeout(failT);
  const mobile = () => matchMedia('(max-width: 960px)').matches;
  const padNow = () => (mobile() ? { top: 150, bottom: Math.round(innerHeight * 0.46), left: 20, right: 20 } : { top: 80, bottom: 200, left: 64, right: 392 + 48 });
  st.pad(padNow()); addEventListener('resize', () => st.pad(padNow()));

  // 흰 글로브 — 줌 3 이하는 흰 지구 + 나라 면 · 4 이상에서 위성 영상이 차오른다
  map.setProjection({ type: ['interpolate', ['linear'], ['zoom'], 3.6, 'vertical-perspective', 5.4, 'mercator'] });
  map.setPaintProperty('bg', 'background-color', '#FFFFFF');
  if (map.getLayer('k-eox')) map.setPaintProperty('k-eox', 'raster-opacity', ['interpolate', ['linear'], ['zoom'], 2.8, 0, 4.2, 1]);
  if (map.getLayer('k-vw')) map.setLayoutProperty('k-vw', 'visibility', 'none');
  const lxIso = new Set((lx?.countries || []).map((c) => c.iso3));
  const worldFc = { type: 'FeatureCollection', features: world.features.map((f) => ({ ...f, properties: { ...f.properties, lx: lxIso.has(f.properties.iso3) ? 1 : 0, mine: countries.has(f.properties.iso3) ? 1 : 0 } })) };
  map.addSource('gl-world', { type: 'geojson', data: worldFc });
  map.addLayer({ id: 'gl-world-f', type: 'fill', source: 'gl-world', paint: { 'fill-color': ['case', ['==', ['get', 'mine'], 1], '#1C1F25', ['==', ['get', 'lx'], 1], '#E5E8EB', '#F2F4F6'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'mine'], 1], 0.9, 1], 4.4, 0] } }, 'slot-reference');
  map.addLayer({ id: 'gl-world-l', type: 'line', source: 'gl-world', paint: { 'line-color': ['case', ['==', ['get', 'mine'], 1], '#FFFFFF', '#D1D6DB'], 'line-width': ['case', ['==', ['get', 'mine'], 1], 1.4, 0.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.6, 1, 5, ['case', ['==', ['get', 'mine'], 1], 0.9, 0]] } }, 'slot-reference');
  // 지역 경계 · 내 지역 · 초점 밖 딤 · 변화 칸 · NDVI
  const EMPTY = { type: 'FeatureCollection', features: [] };
  for (const id of ['gl-adm1', 'gl-adm2', 'gl-mask', 'gl-cells']) map.addSource(id, { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'gl-mask', type: 'fill', source: 'gl-mask', paint: { 'fill-color': '#1C1F25', 'fill-opacity': 0, 'fill-opacity-transition': { duration: D[750] } } }, 'slot-reference');
  map.addLayer({ id: 'gl-adm1', type: 'line', source: 'gl-adm1', paint: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-opacity': 0.75 } }, 'slot-reference');
  map.addLayer({ id: 'gl-adm2-f', type: 'fill', source: 'gl-adm2', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, ['==', ['get', 'mine'], 1], 0.08, 0] } }, 'slot-reference');
  map.addLayer({ id: 'gl-adm2-l', type: 'line', source: 'gl-adm2', paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['==', ['get', 'cur'], 1], 2.4, ['==', ['get', 'mine'], 1], 1.4, 0.6], 'line-opacity': ['case', ['==', ['get', 'cur'], 1], 1, ['==', ['get', 'mine'], 1], 0.9, 0.45] } }, 'slot-overlay');
  map.addLayer({ id: 'gl-cells', type: 'fill', source: 'gl-cells', paint: { 'fill-color': '#FFB331', 'fill-opacity': ['*', ['min', 1, ['/', ['abs', ['get', 'd']], 30]], ['case', ['==', ['get', 'on'], 1], 0.85, 0]], 'fill-opacity-transition': { duration: D[500] } } }, 'slot-result');
  /* 지역 한 장(image 소스) — NDVI 는 지역 폴리곤 안만 칠해 사각형이 보이지 않는다 · 변화 화소도 같은 방식 */
  const imgLayer = (id, before, opacity) => {
    // 같은 그림이면 다시 싣지 않고, 싣는 중이면 끝난 뒤 마지막 요청만 싣는다(중간 취소 = 콘솔 오류 0)
    let cur = null, busy = false, next = null;
    const show = () => { map.setLayoutProperty(id, 'visibility', 'visible'); requestAnimationFrame(() => map.getLayer(id) && map.setPaintProperty(id, 'raster-opacity', opacity)); };
    const load = (url, coords) => {
      cur = url; busy = true;
      const src = map.getSource(id);
      if (src) src.updateImage({ url, coordinates: coords });
      else { map.addSource(id, { type: 'image', url, coordinates: coords }); map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: D[500] }, 'raster-fade-duration': 0 } }, before); }
      const fin = () => { map.off('sourcedata', on); clearTimeout(tm); busy = false; if (next) { const n = next; next = null; if (n.url !== cur) load(n.url, n.coords); } };
      const on = (e) => { if (e.sourceId === id && map.isSourceLoaded(id)) fin(); };
      const tm = setTimeout(fin, 4000);
      map.on('sourcedata', on);
    };
    return {
      set(url, coords) { if (busy) next = { url, coords }; else if (url !== cur) load(url, coords); show(); },
      off() { next = null; if (map.getLayer(id)) { map.setPaintProperty(id, 'raster-opacity', 0); map.setLayoutProperty(id, 'visibility', 'none'); } },
    };
  };
  const ndviImg = imgLayer('gl-ndvi', 'gl-mask', 0.9);
  const chImg = imgLayer('gl-change', 'gl-cells', 0.95);
  let ndviWant = null;
  /** 이 지역의 m 월 NDVI 를 켠다(null = 끔) · 늦게 도착한 그림은 버린다 */
  async function ndviShow(m) {
    ndviWant = m ? (S.district?.id + '|' + m) : null;
    if (!m || !S.district || !sidOf(m)) { ndviImg.off(); return; }
    const D0 = S.district, want = ndviWant;
    try {
      const { grid, mask } = geoOf(D0);
      const k = D0.id + '|' + m;
      tiles.paint[k] ||= NT.monthOf(ndm.tiles, sidOf(m), grid).then((mo) => NT.paintNdvi(mo, mask, grid));
      const url = await tiles.paint[k];
      if (ndviWant !== want) return;
      ndviImg.set(url, grid.coords);
    } catch { if (ndviWant === want) ndviImg.off(); }
  }
  function changeShow(on) {
    const c = on && S.district && CH[S.district.id + '|' + S.season.key];
    if (c?.state === 'ok' && c.url) chImg.set(c.url, geoOf(S.district).grid.coords); else chImg.off();
  }

  /* ── 흐름: 글로브 → 나라 → 지역 ── */
  const url = () => { const u = new URL(location.href); u.searchParams.set('country', S.country?.iso || ''); if (S.district) u.searchParams.set('district', S.district.id); else u.searchParams.delete('district'); u.searchParams.set('tab', STR.tabs[S.tab].toLowerCase()); u.searchParams.set('season', S.season.key); history.replaceState(null, '', u); };

  function drawCrumbs() {
    crumbs.innerHTML = '';
    crumbs.append(h('button.gl-crumb.gl-crumb--globe', { type: 'button', 'aria-label': 'Globe', 'aria-current': S.level === 'globe' ? 'true' : null, html: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.2 2 2.2 12 0 14M10 3c-2.2 2-2.2 12 0 14"/></svg>', onclick: () => toGlobe() }));
    if (S.country) {
      crumbs.append(h('span.gl-sep', { 'aria-hidden': 'true', text: '›' }));
      crumbs.append(S.level === 'country' ? h('span.gl-crumb.is-now', { text: S.country.name }) : h('button.gl-crumb', { type: 'button', text: S.country.name, onclick: () => toCountry(S.country) }));
    }
    // 지역 단계 — 마지막 단 = 지역 이름(지금 위치) · 나라 단을 누르면 나라로 올라가 시트가 접힌다
    if (S.level === 'district' && S.district) {
      crumbs.append(h('span.gl-sep', { 'aria-hidden': 'true', text: '›' }));
      crumbs.append(h('span.gl-crumb.is-now', { 'aria-current': 'location', text: S.district.name }));
    }
  }

  async function toGlobe({ fly = true } = {}) {
    S.level = 'globe'; S.district = null; main.dataset.level = 'globe'; drawCrumbs(); hud(null);
    map.getSource('gl-adm2').setData(EMPTY); map.getSource('gl-adm1').setData(EMPTY); map.getSource('gl-cells').setData(EMPTY); map.setPaintProperty('gl-mask', 'fill-opacity', 0); ndviShow(null); changeShow(false);
    const c = S.country ? center(S.country.bbox) : [60, 25];
    const cam = { center: [c[0] + (mobile() ? 0 : 18), Math.max(-30, Math.min(40, c[1] - 6))], zoom: mobile() ? 0.9 : 1.75, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
    if (!fly || RM()) map.jumpTo(cam); else map.easeTo({ ...cam, duration: D[2400] });
    renderSheet();
  }

  async function toCountry(C, { fly = true } = {}) {
    S.country = C; S.level = 'country'; S.district = null; main.dataset.level = 'country'; drawCrumbs(); hud(null); url();
    const A = await districtsOf(C);
    map.getSource('gl-adm1').setData(A.adm1 || EMPTY);
    map.getSource('gl-adm2').setData({ type: 'FeatureCollection', features: A.feats.map((d, i) => ({ type: 'Feature', id: i, properties: { i, mine: d.mine ? 1 : 0, cur: 0 }, geometry: d.feature.geometry })) });
    map.getSource('gl-cells').setData(EMPTY); map.setPaintProperty('gl-mask', 'fill-opacity', 0); ndviShow(null); changeShow(false);
    renderSheet();
    if (fly) await st.go(C.bbox, { maxZoom: 7.2 });
  }

  async function toDistrict(D0, { fly = true } = {}) {
    if (!D0.mine && !isLX) { flashGuard(); return; }
    const A = admCache[S.country.iso];
    S.district = D0; S.level = 'district'; main.dataset.level = 'district'; drawCrumbs(); url();
    map.getSource('gl-adm2').setData({ type: 'FeatureCollection', features: A.feats.map((d, i) => ({ type: 'Feature', id: i, properties: { i, mine: d.mine ? 1 : 0, cur: d === D0 ? 1 : 0 }, geometry: d.feature.geometry })) });
    const g = D0.feature.geometry, holes = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
    map.getSource('gl-mask').setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring([-179.9, -85, 179.9, 85]), ...holes.map((r) => [...r].reverse())] } });
    map.setPaintProperty('gl-mask', 'fill-opacity', 0);   // 법전 v2.2 §6 위성 그대로(딤 없음) — 초점은 2.4px 흰 경계 + 내 지역 흰 0.08 채움
    if (!('sprawl' in D0)) D0.sprawl = sprawlOf(D0);
    cellFc = { type: 'FeatureCollection', features: (D0.sprawl?.cells || []).map((c) => ({ type: 'Feature', properties: { d: c.d, on: 0 }, geometry: c.f.geometry })) };
    map.getSource('gl-cells').setData(cellFc);
    hud(null, true);
    renderSheet();
    changeOf(D0, S.season);   // 비행과 함께 계절 결과 그림을 미리 받는다(도착 즉시 큰 숫자)
    if (fly) await st.go(D0.bbox, { maxZoom: 11.2 });
    // 도착 — 이번 계절 결과가 있으면 변화 화소가 차오르고 큰 숫자가 선다 · 없으면 'No result yet'(견적은 착지를 막지 않는다 · 뒤에서)
    changeOf(D0, S.season);
    hud(D0);
    renderSheet();
    quoteSoon();
  }
  let cellFc = EMPTY;
  const cellsOn = (on) => { cellFc.features.forEach((f) => { f.properties.on = on ? 1 : 0; }); map.getSource('gl-cells').setData(cellFc); };

  /* HUD — Crop condition drop · {district} {n} km² ~ */
  let big = null;
  function hud(D0, wait = false) {
    if (!D0 && !wait) { hudEl.hidden = true; return; }
    hudEl.hidden = false;
    if (!big) big = K.bignum(h('div'), null, { label: '', unit: STR.km2, hud: true, digits: 1 });
    if (!big.el.isConnected) hudEl.append(big.el);
    const name = (D0 || S.district)?.name || '';
    big.label(fill(STR.hud, { district: name }));
    big.el.dataset.metric = 'Crop condition drop';
    big.el.classList.toggle('is-wait', wait);
    if (wait) { big.set(null); big.el.querySelector('.k-big-none').hidden = true; return; }
    const c = changeOf(D0, S.season);
    if (c.state === 'calc') { big.el.classList.add('is-wait'); big.set(null); big.el.querySelector('.k-big-none').hidden = true; return; }
    const e = c.state === 'ok' ? c.env : null;
    big.set(e, { unit: STR.km2, digits: 1 });
    big.el.classList.toggle('is-none', !e);
    // 빈 상태 한 줄 — 시트와 같은 말(영상 없음은 영상이 정말 없을 때만)
    if (!e) big.el.querySelector('.k-big-none').textContent = covered(D0) ? STR.noresult : STR.none;
    enSig(big.el, e);
  }
  /** 호버 한 줄을 영문으로(키트 sig.humanize 는 국문 — 키트 요청) */
  function enSig(root, e) {
    const s = root.querySelector('.k-sig'); if (!s || !isEnvelope(e)) return;
    const src = String(e.source || '');
    const what = /^(Sentinel-2 NDVI |Cropland )/.test(src) ? src : /land ?cover|LULC|Esri/i.test(src) ? 'Sentinel-2 land cover 2017–2025' : /S2|Sentinel|NDVI|B04/i.test(src) ? 'Sentinel-2 imagery' : 'Land-XI analysis';
    s.dataset.why = `${what} · as of ${K.df(e.as_of)}`;
  }

  function flashGuard() { guard.hidden = false; clearTimeout(flashGuard.t); flashGuard.t = setTimeout(() => { guard.hidden = true; }, 2600); }

  /* 지도 조작 — 나라 누르면 나라로 · 지역 누르면 지역으로 · 지역 이름은 풍선 */
  let hoverId = null;
  map.on('mousemove', (e) => {
    if (S.level === 'globe') {
      const f = map.queryRenderedFeatures(e.point, { layers: ['gl-world-f'] })[0];
      const mine = f && countries.has(f.properties.iso3);
      map.getCanvas().style.cursor = mine ? 'pointer' : '';
      showTip(mine ? f.properties.name : '', e.point); return;
    }
    const f = map.queryRenderedFeatures(e.point, { layers: ['gl-adm2-f'] })[0];
    if (hoverId !== null) map.setFeatureState({ source: 'gl-adm2', id: hoverId }, { hover: false });
    hoverId = f ? f.id : null;
    if (f) map.setFeatureState({ source: 'gl-adm2', id: f.id }, { hover: true });
    map.getCanvas().style.cursor = f ? 'pointer' : '';
    const D0 = f && admCache[S.country.iso]?.feats[f.properties.i];
    showTip(D0 && D0 !== S.district ? D0.name : '', e.point);
  });
  map.on('mouseout', () => showTip('', null));
  map.on('click', (e) => {
    if (S.level === 'globe') { const f = map.queryRenderedFeatures(e.point, { layers: ['gl-world-f'] })[0]; const C = f && countries.get(f.properties.iso3); if (C) toCountry(C); return; }
    const f = map.queryRenderedFeatures(e.point, { layers: ['gl-adm2-f'] })[0];
    const D0 = f && admCache[S.country?.iso]?.feats[f.properties.i];
    if (D0 && D0 !== S.district) toDistrict(D0);
  });
  function showTip(text, p) { if (!text || !p) { tip.hidden = true; return; } tip.hidden = false; tip.textContent = text; tip.style.transform = `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y - 30)}px)`; }

  /* ── 시트 392: Season · NDVI · Sprawl ── */
  const tabs = h('div.gl-tabs', { role: 'tablist', 'aria-label': 'View' });
  const body = h('div.gl-body');
  const act = h('div.gl-act');
  sheet.append(h('div.gl-grip', { 'aria-hidden': 'true' }), tabs, body, act);
  STR.tabs.forEach((lab, i) => tabs.append(h('button.gl-tab', { type: 'button', role: 'tab', text: lab, 'aria-selected': String(i === S.tab), onclick: () => { S.tab = i; url(); renderSheet(); } })));
  const runBtn = h('button.t-btn.gl-run', { type: 'button', text: STR.run, onclick: () => run() });
  const dlBtn = h('button.t-btn.t-btn--2.gl-dl', { type: 'button', text: STR.dl, onclick: () => download() });
  const why = h('p.gl-why', { role: 'status', hidden: true });
  const prog = h('div.gl-prog', { hidden: true }, h('div.t-progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: '0%' } })), h('p.gl-prog-t'));
  act.append(prog, why, h('div.gl-btns', {}, runBtn, dlBtn));

  let renderSeq = 0;
  async function renderSheet() {
    const seq = ++renderSeq;
    delete body.dataset.norun;
    [...tabs.children].forEach((b, i) => b.setAttribute('aria-selected', String(i === S.tab)));
    const D0 = S.level === 'district' ? S.district : null;
    // 지도 층은 탭마다 하나: Season = 이번 계절 변화 화소(결과 전·실행 중엔 그 달 NDVI) · NDVI = 최근 달 NDVI · Sprawl = 건물 변화 칸
    const lay = { ndvi: null, change: false, cells: false };
    const apply = () => { if (seq !== renderSeq) return; ndviShow(lay.ndvi); changeShow(lay.change); cellsOn(lay.cells); runState(); };
    /* 빈 상태 — 영상이 정말 없을 때만 'No imagery…'(covered()=false) · 영상은 있는데 결과가 없으면 'No result yet' + 'Run this season'(행동 1 · 아래 Run 버튼은 숨김) */
    const noResult = (why) => {
      const e = h('div'); body.append(e);
      if (why === 'img') K.empty(e, { kind: 'ingest', compact: true, title: STR.none, action: { label: STR.req, onClick: () => ck.open(`${STR.req}: ${D0.name} · ${S.season.key}`) } });
      else K.empty(e, { kind: 'first', compact: true, title: STR.noresult, action: why === 'run' ? { label: STR.run, onClick: () => run() } : null });
      if (why === 'run') e.querySelector('.k-empty-a')?.classList.add('gl-run-k');
    };
    if (!D0) { body.innerHTML = ''; S.dl = false; return apply(); }
    dlCheck(D0);   // 지역 전: 시트는 비켜 있다(지도에서 나라 → 지역을 고른다)
    const frag = [];
    const push = (el) => frag.push(el);
    if (S.tab === 0) {
      push(h('select.t-input.gl-season', { 'aria-label': 'Season', onchange: (ev) => { S.season = seasons.find((s) => s.key === ev.target.value); url(); changeOf(D0, S.season); hud(D0); renderSheet(); quoteSoon(); } },
        ...seasons.map((s) => h('option', { value: s.key, selected: s === S.season ? 'selected' : null, text: `${s.key} · ${MON(s.months[0])}–${MON(s.months[s.months.length - 1])}` }))));
      if (!covered(D0)) { body.replaceChildren(...frag); noResult('img'); return apply(); }
      const nd = await ndviOf(D0); if (seq !== renderSeq) return;
      const bx = h('div.gl-months'); push(bx);
      body.replaceChildren(...frag);
      const items = S.season.months.map((m) => ({ label: MON(m), value: nd[m] ?? 0, env: nd[m] }));
      K.bars(bx, { items, ai: true, max: 0.6 });
      bx.querySelectorAll('.k-bar-v').forEach((v, i) => { if (!items[i].env) v.textContent = '—'; else { v.textContent = K.nf(V(items[i].env), 2); v.insertAdjacentHTML('beforeend', K.sig(items[i].env)); enSig(v, items[i].env); } });
      const running = S.run && !S.run.done && S.run.key === D0.id + '|' + S.season.key;
      const c = CH[D0.id + '|' + S.season.key];
      if (!running && c?.state === 'ok') lay.change = true;
      else if (!running && c?.state === 'calc') lay.ndvi = null;   // 결과 그림을 받는 중 — 다른 그림을 잠깐 비추지 않는다
      else lay.ndvi = running ? (S.run.lastMonth || null) : ([...S.season.months].reverse().find((m) => nd[m]) || null);
    } else if (S.tab === 1) {
      const nd = await ndviOf(D0); if (seq !== renderSeq) return;
      const pts = MONTHS.filter((m) => nd[m]).map((m) => ({ label: MON(m), value: nd[m] }));
      if (!covered(D0)) { body.replaceChildren(); noResult('img'); }
      else if (!pts.length) { body.replaceChildren(); noResult('run'); }
      else {
        const ln = h('div.gl-line'); body.replaceChildren(ln); K.line(ln, { points: pts, ai: true });
        const lv = ln.querySelector('.k-line-v'); if (lv?.firstChild?.nodeType === 3) lv.firstChild.textContent = K.nf(V(pts[pts.length - 1].value), 2);
        lay.ndvi = MONTHS.filter((m) => nd[m]).pop();
      }
    } else {
      const s = D0.sprawl;
      body.replaceChildren();
      // 건물 면적은 계절 실행이 만들지 않는다 — 결과가 없으면 'No result yet' 한 줄만(행동 0 · 아래 Run 도 숨김)
      if (!s) { noResult('plain'); body.dataset.norun = '1'; }
      else {
        const bx = h('div.gl-sprawl'); body.append(bx);
        K.bars(bx, { items: [{ label: '2017', value: s.b17 }, { label: '2025', value: s.b25 }], unit: STR.km2 });
        bx.querySelectorAll('.k-bar-v').forEach((v, i) => { const e = [s.b17, s.b25][i]; const u = v.querySelector('small'); if (u) u.textContent = ' ' + STR.km2; v.insertAdjacentHTML('beforeend', K.sig(e)); enSig(v, e); });
        lay.cells = true;
      }
    }
    apply();
  }


  /* ── 실행: 견적(착지 뒤 · 막지 않음) → 제출(kind index · CPU 작업 큐) → SSE 월 도착 ── */
  let quoteT = 0;
  function quoteSoon() { clearTimeout(quoteT); quoteT = setTimeout(quote, 400); }
  const runAoi = (D0) => { const b = D0.deploy ? inter(D0.bbox, D0.deploy.bbox) || D0.bbox : D0.bbox; const mb = mos?.bounds; return { type: 'Polygon', coordinates: [ring(mb ? inter(b, mb) || b : b)] }; };
  const runBody = (D0) => ({ kind: 'index', model_id: 'index/ndvi_pc', deploy_id: D0.deploy?.id, card_id: D0.deploy?.card_id, aoi: runAoi(D0),
    options: { months: S.season.months, cloud_max: 15, mask: 'worldcover-40', source: 'pc-s2-mosaic' }, priority: 0 });
  async function quote() {
    const D0 = S.district; if (!D0) return;
    const key = D0.id + '|' + S.season.key;
    if (S.quote?.key === key) return runState();
    S.quote = { key, pending: true }; runState();
    if (!covered(D0)) { S.quote = { key, allowed: false, reason: STR.none }; return runState(); }
    try {
      const qt = await api('/jobs/quote', { method: 'POST', body: runBody(D0) });
      S.quote = { key, allowed: !!qt.allowed, eta: V(qt.eta_s), reason: qt.allowed ? '' : reasonOf(qt.reasons) };
      if (qt.allowed) await resume(D0, V(qt.eta_s));
    } catch (e) { S.quote = { key, allowed: false, reason: e.status === 403 ? STR.guard : STR.none }; }
    runState();
  }
  const reasonOf = (rs = []) => (rs.some((r) => /outside|tenant|forbidden/.test(r)) ? STR.guard : rs.some((r) => /quota/.test(r)) ? 'Monthly limit reached' : rs.some((r) => /power|busy/.test(r)) ? 'Queue is busy · try again shortly' : STR.none);

  function runState() {
    const D0 = S.level === 'district' ? S.district : null;
    const running = S.run && !S.run.done && S.run.key === (D0?.id + '|' + S.season.key);
    const key = D0?.id + '|' + S.season.key;
    const checking = !!D0 && !running && (!S.quote || S.quote.pending || S.quote.key !== key);
    runBtn.disabled = !D0 || running || checking || !S.quote.allowed;
    dlBtn.disabled = !D0;
    // 빈 상태 카드의 'Run this season' 이 행동 하나 — 아래 Run 은 숨기고 같은 상태를 따른다
    const kRun = body.querySelector('.gl-run-k');
    const noRun = body.dataset.norun === '1';
    runBtn.hidden = !!kRun || noRun;
    if (kRun) kRun.disabled = runBtn.disabled;
    // 내릴 값이 하나도 없으면 Download 를 숨긴다(헤더만 있는 파일 0)
    dlBtn.hidden = !D0 || !S.dl;
    // 비활성 이유 한 줄 — 늘 보인다(견적 대기 중 = Checking…)
    let r = '';
    if (noRun) r = '';
    else if (checking) r = STR.checking;
    else if (D0 && !running && !S.quote.allowed) r = S.quote.reason;
    if (r === STR.none && body.querySelector('.k-empty')) r = '';   // 빈 상태 카드가 이미 같은 말을 한다
    why.hidden = !r; why.textContent = r;
    prog.hidden = !running;
  }

  async function run() {
    const D0 = S.district; if (!D0 || !S.quote?.allowed) return;
    const eta = Math.max(5, Math.round(S.quote.eta || 60));
    attach(D0, null, eta);
    let job;
    try { job = await api('/jobs', { method: 'POST', body: runBody(D0) }); }
    catch (e) { S.run.finish(false); S.quote = { ...S.quote, allowed: false, reason: e.status === 403 ? STR.guard : reasonOf([e.code || '']) }; return runState(); }
    job = job.job || job;
    S.run.job = job; if (!JOBS.some((x) => x.id === job.id)) JOBS.unshift({ ...job });
    listen(D0, job.id);
  }
  /** 진행 — 남은 달 × 한 달 예상(견적)로 '약 n초' · 서버 진행이 오면 그것으로 */
  function attach(D0, jobId, eta) {
    const months = S.season.months.length || 1;
    S.run = { done: false, t0: performance.now(), eta, total: months, doneN: 0, key: D0.id + '|' + S.season.key, seasonKey: S.season.key, months: [...S.season.months] };
    const bar = prog.querySelector('i'), txt = prog.querySelector('.gl-prog-t');
    const per = eta / months;
    const tick = () => {
      if (!S.run || S.run.done) return;
      const el = (performance.now() - S.run.t0) / 1000, rest = (S.run.total - S.run.doneN) * per;
      const left = Math.max(1, Math.round(Math.max(rest - Math.max(0, el - S.run.doneN * per), rest > 0 ? Math.min(rest, per) : 1)));
      txt.textContent = fill(STR.computing, { n: left });
      bar.style.width = `${Math.max(4, Math.min(96, (S.run.doneN / S.run.total) * 100 + Math.min(0.9, el / eta) * (100 / S.run.total))).toFixed(1)}%`;
      S.run.timer = setTimeout(tick, 1000);
    };
    S.run.finish = (ok) => {
      clearTimeout(S.run.timer); S.run.sub?.close(); S.run.done = true;
      bar.style.width = ok ? '100%' : '0%';
      S.quote = null; runState(); quoteSoon();
      if (ok && S.district === D0) renderSheet();
    };
    runState(); tick();
    if (jobId) listen(D0, jobId);
  }
  function listen(D0, jobId) {
    const R0 = S.run; R0.id = jobId;
    const cache = ndviCache[D0.id] ||= {};
    R0.sub = sse(`/events/jobs/${encodeURIComponent(jobId)}`, {
      on: (name, d) => {
        if (!d || R0 !== S.run) return;
        if (name === 'job.started') R0.total = d.shards_total || R0.total;
        if (name === 'job.progress') { R0.doneN = d.shards_done || 0; R0.total = d.shards_total || R0.total; }
        if (name === 'index.month' && isEnvelope(d.ndvi_mean)) {
          cache[d.month] = d.ndvi_mean; R0.doneN = Math.max(R0.doneN, Object.keys(cache).filter((m) => S.season.months.includes(m)).length);
          R0.lastMonth = d.month;
          if (S.district === D0 && S.tab === 0) renderSheet();
        }
        if (name === 'job.done') {
          // 이번 계절 결과가 생겼다 → 목록에 넣고 Crop condition drop 를 이 결과로 다시 잰다
          const j0 = JOBS.find((x) => x.id === jobId);
          const done = { ...(j0 || R0.job || {}), id: jobId, kind: 'index', state: 'done', finished_at: d.at || new Date().toISOString() };
          if (!done.aoi) done.aoi = runAoi(D0);
          if (!done.options?.months) done.options = { ...(done.options || {}), months: R0.months };
          if (j0) Object.assign(j0, done); else JOBS.unshift(done);
          const key = D0.id + '|' + R0.seasonKey; delete CH[key];
          R0.finish(true);
          const s0 = seasons.find((x) => x.key === R0.seasonKey);
          if (s0) changeOf(D0, s0);
          if (S.district === D0) hud(D0);
        }
        if (name === 'job.failed' || name === 'job.cancelled') R0.finish(false);
      },
    });
  }
  /** 이미 도는 같은 계절 작업이 있으면 이어 본다(두 번 실행 0) */
  async function resume(D0, eta) {
    if (S.run && !S.run.done) return false;
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const list = await api('/jobs?limit=20').catch(() => jobsJ);
    if (S.district !== D0 || (S.run && !S.run.done)) return false;
    const j = (list.items || []).find((x) => x.kind === 'index' && /queued|running/.test(x.state) && same(x.options?.months || [], S.season.months) && x.aoi && geomHas(D0.feature.geometry, ...center(bboxOf(x.aoi))));
    if (!j) return false;
    attach(D0, j.id, Math.max(5, Math.round(eta || 60)));
    S.run.doneN = j.shards_done || 0; S.run.total = j.shards_total || S.run.total;
    return true;
  }

  /* 내려받기 — 지금 지역의 수(CSV · 서버 값 그대로) */
  function rowsOf(D0, nd) {
    const s = D0.sprawl;
    const rows = [['district', 'metric', 'period', 'value', 'unit', 'as_of']];
    const c = CH[D0.id + '|' + S.season.key];
    if (c?.state === 'ok') rows.push([D0.name, 'Crop condition drop', S.season.key, c.env.value, 'km2', c.env.as_of]);
    if (s) rows.push([D0.name, 'Built area', '2017', s.b17.value, 'km2', s.b17.as_of], [D0.name, 'Built area', '2025', s.b25.value, 'km2', s.b25.as_of]);
    for (const m of MONTHS) if (nd[m]) rows.push([D0.name, 'NDVI mean', m, nd[m].value, 'ndvi', nd[m].as_of]);
    return rows;
  }
  /** Download 는 내릴 값이 있을 때만 보인다 */
  async function dlCheck(D0 = S.district) {
    if (!D0) { S.dl = false; return runState(); }
    const nd = await ndviOf(D0);
    if (S.district !== D0) return;
    S.dl = rowsOf(D0, nd).length > 1; runState();
  }
  async function download() {
    const D0 = S.district; if (!D0) return;
    const rows = rowsOf(D0, await ndviOf(D0));
    if (rows.length < 2) return;
    const csv = rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `${D0.name.replace(/[^\w-]+/g, '-').toLowerCase()}-changes.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  /* ── Ctrl K ── */
  // 에이전트 도구 결과가 '이 지역'일 때만 지도를 움직이고 답을 보인다(S-10 전 화면 측 가드 · 남원 등 다른 기관 결과 차단)
  const ckRun = { hit: false };
  const inArea = (b) => { const d = S.district?.bbox; if (!d || !b) return false; const [x, y] = center(b); return x >= d[0] && x <= d[2] && y >= d[1] && y <= d[3]; };
  const ckStage = { get map() { return st.map; }, go: (b, o) => (inArea(b) ? st.go(b, o) : null), geo: (...a) => (ckRun.hit ? st.geo(...a) : null) };
  const ck = K.mountCmdk({
    stage: ckStage,
    context: () => ({ locale: 'en', country: S.country?.name, region: S.district?.name, district: S.district?.name, season: S.season?.key }),
    onAction: (a) => { if (inArea(actBox(a))) ckRun.hit = true; },
  });
  SH.mast(h('button.k-mast-b.gl-ask', { type: 'button', onclick: () => ck.open() }, h('span', { text: STR.ask }), h('kbd', { text: T('cmdk.key') })));
  ckEnglish(ck.el, { run: ckRun, where: () => [S.district?.name || S.country?.name, S.season?.key].filter(Boolean) });

  /* ── 시작 ── */
  const want = countries.get((q.get('country') || '').toUpperCase()) || [...countries.values()].sort((a, b) => b.deploys.length - a.deploys.length)[0] || null;
  S.country = want;
  // 좁은 화면 마스트 좌 = 짧은 이름(예: 'Agri · KGZ') — 키트가 ≤960 에서 기관명을 숨기므로 화면이 한 줄 더 둔다
  {
    // 나라 = 착지 나라 → 없으면 기관 이름 첫 낱말로 시작하는 나라(예: 'Kyrgyz …' → Kyrgyzstan)
    const w0 = (orgShort.split(/\s+/)[0] || '').slice(0, 4).toLowerCase();
    const home = want ? { iso: want.iso, name: want.name } : (() => { const f = w0.length === 4 && world.features.find((x) => String(x.properties.name || '').toLowerCase().startsWith(w0)); return f ? { iso: f.properties.iso3, name: f.properties.name } : null; })();
    const iso = home?.iso || '';
    const lead = (home?.name || '').slice(0, 4).toLowerCase();
    const GEN = /^(ministry|state|agency|department|office|of|on|for|the|national|republic)$/i;
    let sn = isLX ? 'LX' : orgShort.split(/\s+/).filter((w, i) => !(i === 0 && lead && w.toLowerCase().startsWith(lead)) && !GEN.test(w))[0] || orgShort;
    if (!isLX && sn.length > 8) sn = sn.slice(0, 4);   // 'Agriculture' → 'Agri' (전체 이름은 풍선)
    const word = SH.app.querySelector('.k-word');
    if (word && sn) word.append(h('span.gl-home-s', { title: orgEn || sn }, h('span.gl-home-n', { text: sn }), iso ? h('span', { text: ' · ' + iso }) : null));
  }
  await toGlobe({ fly: false });
  // 흰 글로브가 한 번 그려진 뒤에야 판을 보인다(기본 메르카토르 위성 · 투영 전환 프레임이 정문 뒤에 비치지 않게)
  await new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r() : map.once('render', f)); map.triggerRepaint(); map.once('render', f); setTimeout(r, 1500); });
  stageEl.classList.add('gl-on');
  document.body.dataset.state = 'globe';
  if (!want) {   // 이 기관에 해외 배포가 아직 없다 — 글로브 위 K9 한 장(지역을 지어내지 않는다)
    renderSheet();
    const e = h('div.gl-none'); main.append(e); K.empty(e, { kind: 'first', compact: true, title: T('big.none') });
    document.body.dataset.state = 'ready';
    return;
  }
  await wait(RM() ? 0 : 900);
  await toCountry(want, { fly: true });
  const A = admCache[want.iso];
  const pick = A.feats.find((d) => d.id === q.get('district')) || A.feats.filter((d) => d.mine).sort((a, b) => (b.share || 0) - (a.share || 0))[0] || null;
  if (pick) changeOf(pick, S.season);
  if (pick) { await wait(RM() ? 0 : 350); await toDistrict(pick, { fly: true }); }
  document.body.dataset.state = 'ready';

  function mapError() {
    main.innerHTML = '';
    const e = h('div'); main.append(h('div.gl-err', {}, e));
    K.empty(e, { kind: 'first', compact: true, title: STR.maperr, action: { label: STR.retry, onClick: () => location.reload() } });
    document.body.dataset.state = 'error';
  }
  function loadError() { stageEl.classList.add('gl-on'); return mapError(); }
}

/* Ctrl K 영문판 — 키트 K10 은 계획 줄·확인 카드·거절 문구가 국문(키트 en 사전 요청 중).
   그때까지 이 화면이 ① 질문 끝에 영어로 답하라는 한 줄을 붙여 보내고(입력창에는 남기지 않는다)
   ② 계획·확인·거절의 국문을 영문으로 바꾸고 ③ 그래도 남는 국문 답은 영문 오류 한 줄로 바꾼다(한국어 잔존 0). */
const CK_EN = {
  '건수 확인': 'Count results', '의심 필지 찾기': 'Find flagged parcels', '필지 대장 대조': 'Check the parcel register', 'AI 결과 집계': 'Sum up AI results',
  'AI 결과 가져오기': 'Get AI results', '필지 조회': 'Look up the parcel', '필지와 결합': 'Join with parcels', '영상 확인': 'Check imagery',
  '분석 범위 계산': 'Estimate the run', '분석 실행': 'Run the analysis', '상태 변경': 'Update status', '지도에 표시': 'Show on the map',
  '필지로 이동': 'Go to the parcel', '층 켜기': 'Turn on a layer', '범위 표시': 'Show the area', '목록 열기': 'Open the list', '필지 카드': 'Parcel card',
  '대장 읽기': 'Read the register', '대장과 AI 결과 맞추기': 'Match register and AI results', '대조 규칙 적용': 'Apply rules', '어긋난 필지 찾기': 'Find mismatched parcels',
  '확인': 'Check', '실행': 'Run', '이 기관의 데이터가 아닙니다': 'Outside your districts', '해당 지역 데이터가 없습니다': 'No data for this area yet',
};
/** 에이전트 ui_action 의 범위(bbox · center · features · geojson) */
function actBox(a) {
  if (!a) return null;
  if (a.bbox) return a.bbox;
  if (a.center) return [a.center[0], a.center[1], a.center[0], a.center[1]];
  const g = a.geojson || (a.features?.length ? { type: 'GeometryCollection', geometries: a.features.map((f) => f.geometry) } : null);
  if (!g) return null;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => { if (typeof c?.[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c?.forEach?.(walk); };
  const geo = (x) => (x?.type === 'GeometryCollection' ? x.geometries.forEach(geo) : walk(x?.coordinates));
  geo(g);
  return Number.isFinite(b[0]) ? b : null;
}
/* 다른 기관·국내 지역 이름이 답에 섞이면 원문을 버린다 */
const KR_PLACE = /(namwon|jeonbuk|jeolla|jeonju|korea|korean|seoul|busan|jeju|gyeong\w*|chungcheong\w*|gangwon)|\w+-(gun|si|gu|myeon|eup|dong)|\d{10,19}/i;
function ckEnglish(box, { run, where } = {}) {
  if (!box) return;
  const form = box.querySelector('form'), inp = box.querySelector('.k-ck-i'), ans = box.querySelector('.k-ck-a');
  const DOTS = '<span class="k-ck-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  const KEEP = new Set([...Object.values(CK_EN), K.t('cmdk.error')]);
  let live = false;
  // 같은 대상의 capture 수신자가 키트 수신자보다 먼저 돈다 — 키트가 값을 읽은 뒤 입력창을 되돌린다
  form?.addEventListener('submit', () => {
    const v = inp.value.trim(); if (!v) return;
    live = true; if (run) run.hit = false;
    if (HANGUL.test(v)) return;
    const w = where?.() || [];
    inp.value = `${v}
(${w.length ? `Area: ${w.join(', ')}. ` : ''}Answer in English only, about this area only.)`;
    setTimeout(() => { inp.value = v; }, 0);
  }, true);
  const fix = (n) => {
    const s = n.nodeValue; if (!s || !HANGUL.test(s)) return;
    const k = s.trim();
    if (CK_EN[k]) { n.nodeValue = CK_EN[k]; return; }
    const inAns = n.parentElement?.closest('.k-ck-a');
    if (inAns && !box.dataset.busy) inAns.textContent = K.t('cmdk.error');   // 답 전체를 한 줄로(조각마다 되풀이 0)
    else n.nodeValue = inAns ? '…' : K.t('cmdk.error');
  };
  // 답 — 흘러드는 원문은 보이지 않고(점 셋), 끝났을 때 이 지역 도구 결과가 없으면 영문 한 줄 + 지역 · 계절
  const settle = () => {
    if (!live || !ans) return;
    const txt = ans.textContent.trim();
    if (box.dataset.busy) { if (txt && !ans.querySelector('.k-ck-dots')) ans.innerHTML = DOTS; return; }
    live = false;
    if (KEEP.has(txt)) return;
    if (run?.hit && txt && !KR_PLACE.test(txt) && !HANGUL.test(txt)) return;
    const w = where?.() || [];
    ans.innerHTML = '';
    ans.append(h('span', { text: CK_EN['해당 지역 데이터가 없습니다'] }), w.length ? h('span.gl-ck-where', { text: ' · ' + w.join(' · ') }) : '');
  };
  const sweep = (root) => { if (root.nodeType === 3) return fix(root); const tw = document.createTreeWalker(root, 4); let n; while ((n = tw.nextNode())) fix(n); };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(sweep); } settle(); })
    .observe(box, { subtree: true, childList: true, characterData: true });
}

main().catch((e) => { console.warn('[global]', e); document.body.dataset.state = 'error'; });
