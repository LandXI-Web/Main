/* lx-ingest data.js — ① 반입 화면의 데이터 한 곳.
   명세 §2.4 API: GET /catalog/layers · /regions/{sgg}(S-3) · /proxy/vworld/data · /jobs/quote|/jobs{kind:join} → SSE ·
   POST /catalog/imagery(S-5) · PUT /registry/cards/{id}/ledger_schema(S-6).
   S-3 · S-5 · S-6 은 서버에 있다(2026-09-27 · openapi 로 확인). 아래 어댑터는 경로가 없을 때만 쓰는 폴백이다:
     · 지역 목록·경계  /regions 없음 → V-World 시군구(LT_C_ADSIGG_INFO)
     · 지역 영상       /regions/{sgg} 없음 → 카탈로그 bounds 대조
     · 영상 등록       POST /catalog/imagery 없음 → 이 브라우저에 '등록 요청'으로 보관
     · 대장 형식       PUT …/ledger_schema 없음 → 이 브라우저에 보관
   숫자는 전부 봉투(env). */
import { api, hasRoute, LS, bboxOf, session, API } from '../kit/util.js';
import { env, sse } from '../../shared/api-v1.js';
import { loadRegions } from '../kit/region.js';
import { devlog } from '../kit/dev-drawer.js';

const KOREA_BOX = 'BOX(124,33,132,39)';
const vwq = (q) => '/proxy/vworld/data?' + new URLSearchParams({ service: 'data', request: 'GetFeature', size: '1000', page: '1', format: 'json', crs: 'EPSG:4326', geometry: 'false', attribute: 'true', ...q });

/** V-World data 한 번 — { total, features, bbox } · 없음 = total 0 */
async function vw(q) {
  const j = await api(vwq(q));
  const r = j?.response;
  if (!r) throw new Error('vworld');
  if (r.status === 'NOT_FOUND') return { total: 0, features: [], bbox: null };
  if (r.status !== 'OK') throw new Error('vworld ' + r.status);
  const fc = r.result?.featureCollection || { features: [] };
  return { total: +(r.record?.total || fc.features.length), features: fc.features || [], bbox: fc.bbox };
}

/* ── 지역 ─────────────────────────────────────────────────────── */
/** 키트 지역 목록을 전국 시군구로 채운다(S-3 가 있으면 그대로). 키트 regionPicker 는 같은 배열을 읽는다. */
export async function regions() {
  const list = await loadRegions();
  if (list.source === 'regions' || list.source === 'vworld') return list;
  try {
    const { features } = await vw({ data: 'LT_C_ADSIGG_INFO', geomFilter: KOREA_BOX });
    const byFull = new Map(list.map((r) => [String(r.full || '').replace(/\s+/g, ''), r]));
    const out = features.map((f) => {
      const p = f.properties || {};
      const full = p.full_nm || p.sig_kor_nm;
      const sido = String(full).split(/\s+/)[0];
      const d = byFull.get(String(full).replace(/\s+/g, ''));
      return { sgg_cd: p.sig_cd, name: p.sig_kor_nm, sido, full, bbox: null, has_imagery: null, deploys: d?.deploys || [], profile: d?.sgg_cd || null, approx: true };
    }).filter((r) => r.sgg_cd).sort((a, b) => a.sido.localeCompare(b.sido, 'ko') || a.name.localeCompare(b.name, 'ko'));
    if (out.length) { list.splice(0, list.length, ...out); list.source = 'vworld'; }
  } catch (e) { devlog('regions', 'V-World 시군구 실패 · ' + (e.code || e.message)); }
  devlog('regions', `${list.source} · ${list.length}`);
  return list;
}

/** S-3 GET /regions/{sgg} — 영상 목록 · 필지 · 대장 · 경계(geom) · 없으면 null */
const DET = new Map();
export async function regionDetail(sgg, { geom = false, force = false } = {}) {
  if (!(await hasRoute('/regions/{sgg_cd}'))) return null;
  const k = sgg + (geom ? ':g' : '');
  if (force) { DET.delete(sgg); DET.delete(sgg + ':g'); }
  if (!DET.has(k)) DET.set(k, api(`/regions/${encodeURIComponent(sgg)}${geom ? '?geom=1' : ''}`).catch((e) => { DET.delete(k); devlog('region', e.code || e.message); return null; }));
  return DET.get(k);
}

const GEOM = new Map();
const boxPoly = (b) => ({ type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] });
/** 서버 경계가 사각형(= bbox 그대로, 뼈대만 있는 지역)인가 — 그러면 시군구 경계로 쓰지 않는다 */
export function isBoxGeom(g) {
  if (!g) return true;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys || polys.length !== 1) return false;
  const ring = polys[0][0] || [];
  if (ring.length > 5) return false;
  const xs = new Set(ring.map((c) => +c[0].toFixed(6))), ys = new Set(ring.map((c) => +c[1].toFixed(6)));
  return xs.size <= 2 && ys.size <= 2;
}
/** V-World 시군구 폴리곤(LT_C_ADSIGG_INFO) — sig_cd 로, 안 되면 이름 + 범위로 */
async function vwSigungu(r) {
  const as = (feats) => ({ type: 'FeatureCollection', features: feats.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) });
  if (/^\d{5}$/.test(String(r.sgg_cd))) {
    const j = await vw({ data: 'LT_C_ADSIGG_INFO', attrFilter: `sig_cd:=:${r.sgg_cd}`, geomFilter: KOREA_BOX, geometry: 'true', size: '10' });
    if (j.features.length) return as(j.features);
  }
  if (r.bbox && r.name) {
    const j = await vw({ data: 'LT_C_ADSIGG_INFO', geomFilter: `BOX(${r.bbox.map((v) => v.toFixed(5)).join(',')})`, geometry: 'true', size: '40' });
    const hit = j.features.filter((f) => f.properties?.sig_kor_nm === r.name);
    if (hit.length) return as(hit);
  }
  return null;
}
/** 시군구 경계(FeatureCollection) + bbox + real(실제 경계인가).
    S-3 `GET /regions/{sgg}?geom=1` 경계가 실제 폴리곤이면 그대로 · 사각형(bbox 와 같음)이거나 없으면 V-World 폴리곤 ·
    둘 다 없을 때만 사각형(real:false — 이때 표본 조회의 '없음'은 믿지 않는다) */
export async function regionGeom(r) {
  if (GEOM.has(r.sgg_cd)) return GEOM.get(r.sgg_cd);
  let fc = null, bbox = r.bbox || null, real = false;
  const det = await regionDetail(r.sgg_cd, { geom: true });
  if (det?.bbox) bbox = det.bbox;
  if (det?.geometry && !isBoxGeom(det.geometry)) {
    fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: det.geometry }] };
    bbox = bboxOf(fc) || bbox; real = true;
  } else if (det?.geometry) devlog('region geom', `${r.sgg_cd} 서버 경계 = 사각형 → V-World`);
  if (!fc) {
    try { const v = await vwSigungu({ ...r, bbox }); if (v) { fc = v; bbox = bboxOf(fc) || bbox; real = true; } }
    catch (e) { devlog('region geom', e.code || e.message); }
  }
  if (!fc && bbox) fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: boxPoly(bbox) }] };
  const g = { fc, bbox, real };
  if (fc && real) GEOM.set(r.sgg_cd, g);
  return g;
}

/** 지도 한 점 → 시군구 코드 */
export async function regionAt(lng, lat) {
  const j = await vw({ data: 'LT_C_ADSIGG_INFO', geomFilter: `POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`, size: '1' });
  return j.features[0]?.properties?.sig_cd || null;
}

/** 읍면동 경계(결합률 채색) */
export async function emdGeom(sgg) {
  if (!/^\d{5}$/.test(String(sgg))) return null;
  const j = await vw({ data: 'LT_C_ADEMD_INFO', attrFilter: `emd_cd:like:${sgg}`, geomFilter: KOREA_BOX, geometry: 'true' });
  return { type: 'FeatureCollection', features: j.features.map((f, i) => ({ type: 'Feature', id: i + 1, properties: { cd: f.properties.emd_cd, name: f.properties.emd_kor_nm }, geometry: f.geometry })) };
}

/* ── 기하 도우미 ───────────────────────────────────────────────── */
const hitB = (a, b) => a && b && !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
function inRing(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const RB = new WeakMap();   // 고리별 범위(섬이 많은 다도해 폴리곤에서 빠르게)
const ringBox = (ring) => { let b = RB.get(ring); if (!b) { b = bboxOf({ coordinates: ring }); RB.set(ring, b); } return b; };
const inBox = (pt, b) => b && pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
export function inside(pt, fc) {
  for (const f of fc?.features || []) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) if (inBox(pt, ringBox(p[0])) && inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h))) return true;
  }
  return false;
}
/** 경계 안 표본점 — 폴리곤 안에서만. bbox 중심이 바다(다도해 등)면 격자를 촘촘히 해 육지 안 n 점을 고르게 뽑는다 */
function samples(fc, bbox, n = 4) {
  const c = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const cand = inside(c, fc) ? [c] : [];
  for (const k of [6, 10, 16, 24]) {
    for (let i = 1; i < k; i++) for (let j = 1; j < k; j++) {
      const p = [bbox[0] + ((bbox[2] - bbox[0]) * i) / k, bbox[1] + ((bbox[3] - bbox[1]) * j) / k];
      if (inside(p, fc)) cand.push(p);
    }
    if (cand.length >= n * 3) break;
  }
  if (!cand.length) return [];
  // 가장 먼 점부터(고르게 퍼지게) — 첫 점은 후보 무게중심에 가장 가까운 점
  const m = [cand.reduce((s, p) => s + p[0], 0) / cand.length, cand.reduce((s, p) => s + p[1], 0) / cand.length];
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  const out = [cand.reduce((best, p) => (d2(p, m) < d2(best, m) ? p : best), cand[0])];
  while (out.length < Math.min(n, cand.length)) {
    let far = null, fd = -1;
    for (const p of cand) { const d = Math.min(...out.map((q) => d2(p, q))); if (d > fd) { fd = d; far = p; } }
    if (fd <= 0) break;
    out.push(far);
  }
  return out;
}
const smallBox = ([x, y], d = 0.014) => `BOX(${(x - d).toFixed(5)},${(y - d).toFixed(5)},${(x + d).toFixed(5)},${(y + d).toFixed(5)})`;

/* ── 영상 ─────────────────────────────────────────────────────── */
let CAT = null;
export async function catalog(force = false) {
  if (!CAT || force) CAT = api('/catalog/layers').catch((e) => { CAT = null; throw e; });
  return CAT;
}
const NOT_IMAGERY = /지수|분할|원천|GT|change/i;
const own = (i) => i.role === 'imagery' && i.source !== 'external' && !NOT_IMAGERY.test(`${i.id} ${i.name?.ko || ''}`);
export const resText = (g) => (g === null || g === undefined ? '' : g < 1 ? `${+(g * 100).toFixed(g * 100 < 10 ? 1 : 0)}cm` : `${+g.toFixed(1)}m`);
const kindOf = (i) => { const s = `${i.name?.ko || ''} ${i.id}`; if (/드론|drone|uav/i.test(s)) return '드론'; if (/항공|aerial|ap25/i.test(s)) return '항공'; if (/위성|sentinel|kompsat|satellite/i.test(s)) return '위성'; const g = i.gsd_m; return g < 0.1 ? '드론' : g < 1 ? '항공' : '위성'; };
const yearOf = (i) => (/(19|20)\d{2}/.exec(String(i.epoch || i.name?.ko || '')) || [''])[0];

const PENDING = 'lx_ingest_imagery_requests';
const pendingOf = (sgg) => LS.get(PENDING, []).filter((p) => p.region === sgg);

const IMG_KIND = { drone: '드론', aerial: '항공', satellite: '위성' };
const kindOfRow = (x) => { const s = `${x.name || ''} ${x.id}`; if (/드론|drone|uav/i.test(s) || x.kind === 'drone') return '드론'; if (/항공|aerial|ap25/i.test(s) || x.kind === 'aerial') return '항공'; if (/위성|sentinel|kompsat|satellite/i.test(s) || x.kind === 'satellite') return '위성'; const g = x.gsd_m; return g == null ? '항공' : g < 0.1 ? '드론' : g < 1 ? '항공' : '위성'; };

/** 지역의 영상 — S-3 `/regions/{sgg}` 영상 목록(등록 직후 행 포함) + 카탈로그(footprint · 사다리). S-3 이 없으면 카탈로그 bounds 대조 폴백 */
export async function imageryIn(region, geo, { force = false } = {}) {
  const cat = await catalog();
  const byId = new Map((cat.items || []).map((i) => [i.id, i]));
  const det = await regionDetail(region.sgg_cd, { geom: true, force });
  let rows;
  if (det && Array.isArray(det.imagery)) {
    rows = det.imagery.filter((x) => (x.kind === 'ortho' || x.kind in IMG_KIND) && !NOT_IMAGERY.test(`${x.id} ${x.name || ''}`))
      .map((x) => {
        const it = byId.get(x.id);
        const year = String(x.year || (/(19|20)\d{2}/.exec(String(x.epoch || x.name || '')) || [''])[0]);
        const raw = x.tier === 'raw' && !it?.bounds;   // 타일 작업이 끝나면 카탈로그에 범위가 생긴다
        const kind = kindOfRow(x);
        return { id: x.id, year, res: resText(x.gsd_m), gsd: x.gsd_m, kind, bounds: it?.bounds || null, item: it || null, raw, cov: it?.coverage || null,
          env: { ...env(1, 'count', 'recorded', `${year} ${kind} 영상`, raw ? '등록됨 · 타일 작업 중' : null), as_of: det.as_of } };
      });
  } else {
    const box = geo.bbox;
    const hits = (cat.items || []).filter((i) => own(i) && hitB(i.bounds, box) && (!geo.fc || inside([(i.bounds[0] + i.bounds[2]) / 2, (i.bounds[1] + i.bounds[3]) / 2], geo.fc)));
    rows = hits.map((i) => ({ id: i.id, year: yearOf(i), res: resText(i.gsd_m), gsd: i.gsd_m, kind: kindOf(i), bounds: i.bounds, item: i,
      env: { ...env(1, 'count', 'recorded', `${yearOf(i)} ${kindOf(i)} 영상`), as_of: cat.as_of } }));
    for (const p of pendingOf(region.sgg_cd)) rows.push({ id: 'req-' + p.at, year: String(p.year), res: resText(p.gsd), gsd: p.gsd, kind: p.kind, bounds: null, pending: true,
      env: { ...env(1, 'count', 'estimate', `${p.year} ${p.kind} 영상`, '등록 요청 · 타일 작업 전'), as_of: p.at } });
  }
  rows.sort((a, b) => b.year.localeCompare(a.year) || (a.gsd ?? 9) - (b.gsd ?? 9));
  // 같은 라벨(같은 연도·해상도·종류의 여러 시점)은 한 줄
  const seen = new Map();
  for (const r of rows) { const k = `${r.year} ${r.res} ${r.kind}`.replace(/\s+/g, ' ').trim(); if (!seen.has(k)) seen.set(k, { ...r, label: k, n: 1 }); else seen.get(k).n++; }
  const items = rows.map((r) => r.item).filter((i) => i && i.bounds);
  return { rows, labels: [...seen.values()], items, as_of: det?.as_of || cat.as_of };
}

/** 원본 동적 타일 서명(LX 세션 · 12시간) — { url: …/{z}/{x}/{y}.webp?exp&sig } */
const SIG = new Map();
export function signCog(id) {
  if (!SIG.has(id)) SIG.set(id, api('/tiles/sign?' + new URLSearchParams({ set: 'cog/' + id })).catch((e) => { SIG.delete(id); devlog('sign', e.code || e.message); return null; }));
  return SIG.get(id);
}

/** 서버 사유 → 사용자 말(토스트 한 줄) */
export function imageryReason(e) {
  const m = `${e?.code || ''} ${e?.message || ''}`;
  if (/not_found|파일이 없/.test(m)) return '그 경로에 영상 파일이 없습니다';
  if (/지역이 없/.test(m)) return '이 지역을 찾지 못했습니다';
  if (/래스터|GeoTIFF/i.test(m)) return 'GeoTIFF 같은 영상 파일만 등록할 수 있습니다';
  if (/너무 큽|413/.test(m)) return '파일이 커서 서버 경로로 등록해야 합니다';
  if (/연도|year/.test(m)) return '촬영 연도를 확인해 주세요';
  if (/forbidden|403/.test(m)) return 'LX 직원·관리자만 등록할 수 있습니다';
  return null;
}

export async function registerImagery({ region, path, file, year, gsd }) {
  const kind = gsd < 0.1 ? 'drone' : gsd < 1 ? 'aerial' : 'satellite';
  const body = { path, region: region.sgg_cd, year: +year, gsd: +gsd, kind };
  if (await hasRoute('/catalog/imagery') && (await routeMethods('/catalog/imagery')).includes('post')) {
    let out;
    if (file) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(body)) if (k !== 'path') fd.append(k, String(v));
      fd.append('upload', file, file.name);
      const s = session.get();
      const r = await fetch(API.prefix + '/catalog/imagery', { method: 'POST', body: fd, headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      out = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error(out?.error?.message || 'http ' + r.status), { code: out?.error?.code || 'http_' + r.status });
    } else out = await api('/catalog/imagery', { method: 'POST', body });
    await catalog(true);
    await regionDetail(region.sgg_cd, { force: true });
    devlog('imagery', `POST · ${out?.id || ''} · tile job ${out?.job?.id || ''}`);
    return { server: true, out };
  }
  // 폴백(S-5 경로 없음) — 계약 모양 그대로 이 브라우저에 보관
  const ko = IMG_KIND[kind];
  LS.set(PENDING, [...LS.get(PENDING, []), { ...body, kind: ko, at: new Date().toISOString() }]);
  devlog('imagery', 'S-5 없음 · 로컬 보관 ' + JSON.stringify(body));
  return { server: false };
}

let OPENAPI = null;
async function routeMethods(path) {
  if (!OPENAPI) OPENAPI = fetch(API.prefix + '/openapi.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
  const j = await OPENAPI;
  return Object.keys(j.paths?.['/api/v1' + path] || j.paths?.[path] || {});
}

/* ── 대장(V-World 갖춤) ─────────────────────────────────────────── */
export const LEDGER = [
  { k: 'cadastral', label: '연속지적', layers: ['LP_PA_CBND_BUBUN'], by: 'point' },
  { k: 'zoning', label: '용도지역·농업진흥', layers: ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_AGRIXUE101'], by: 'name' },
  { k: 'gb', label: '개발제한구역', layers: ['LT_C_UD801'], by: 'name' },
  { k: 'bldg', label: '건축물대장', layers: ['LT_C_BLDGINFO'], by: 'point' },
  { k: 'farm', label: '농지대장(기관 제공)', agency: true },
];

/** 대장 한 줄 상태 — 'yes' | 'no' | 'agency' | 'unknown'
    'no' 는 모든 조회가 성공(NOT_FOUND 포함)했고 실제 경계 안 표본이 3점 이상일 때만. V-World 오류·경계 없음은 'unknown'('—') — 거짓 결손 0 */
async function ledgerOne(L, region, geo) {
  if (L.agency) return { state: 'agency' };
  const name = String(region.name || '').split(/\s+/)[0];
  const b = geo.bbox;
  try {
    let qs, enough = true;
    if (L.by === 'name') qs = L.layers.map((layer) => ({ layer, q: { data: layer, attrFilter: `sigg_name:=:${name}`, geomFilter: `BOX(${b.map((v) => v.toFixed(5)).join(',')})`, size: '1' } }));
    else {
      const pts = geo.real ? samples(geo.fc, b) : [];
      enough = pts.length >= 3;
      if (!pts.length) return { state: 'unknown' };
      qs = L.layers.flatMap((layer) => pts.map((p) => ({ layer, q: { data: layer, geomFilter: smallBox(p), size: '1' } })));
    }
    const got = await Promise.all(qs.map(({ layer, q }) => vw(q).then((j) => (j.total > 0 ? layer : null)).catch((e) => { devlog('ledger ' + L.k, e.code || e.message); return false; })));
    const hit = got.find(Boolean);
    if (hit) return { state: 'yes', layer: hit };
    if (got.some((g) => g === false) || !enough) return { state: 'unknown' };
    return { state: 'no' };
  } catch (e) { devlog('ledger ' + L.k, e.code || e.message); return { state: 'unknown' }; }
}
export async function ledgerIn(region, geo) {
  const at = new Date().toISOString();
  const res = await Promise.all(LEDGER.map((L) => ledgerOne(L, region, geo)));
  return LEDGER.map((L, i) => ({ ...L, ...res[i], env: res[i].state === 'yes' ? { ...env(1, 'count', 'recorded', 'V-World 공간정보'), as_of: at } : null }));
}

/* ── 대장 형식(S-6) ────────────────────────────────────────────
   서버 계약: PUT /registry/cards/{id}/ledger_schema  본문 {kind, columns:[{key:<열 이름>, label:<열 이름>, role}]}
   kind = 서버 KINDS(farm_ledger · dev_permit · public_asset · river_permit · greenhouse) · role ⊂ 서버 ROLES_OK.
   화면의 뜻 4개(pnu · jibun · status · date)만 고치고, 카드에 이미 있던 다른 역할 열(use · permit_no …)은 그대로 둔다. */
export const LEDGER_KINDS = [
  { kind: 'farm_ledger', label: '농지대장', card: 'card-farm' },
  { kind: 'dev_permit', label: '개발행위 허가 대장', card: 'card-change' },
  { kind: 'public_asset', label: '공유재산 대장', card: 'card-living' },
  { kind: 'river_permit', label: '하천 점용 허가 대장', card: 'card-change' },
  { kind: 'greenhouse', label: '시설원예 등록', card: 'card-farm' },
];
export const MEANINGS = [
  { role: 'pnu', label: '필지 번호(PNU)' },
  { role: 'jibun', label: '지번' },
  { role: 'status', label: '상태' },
  { role: 'date', label: '날짜' },
];
const MEANING_ROLES = new Set(MEANINGS.map((m) => m.role));
const SCHEMA = 'lx_ingest_ledger_schema';
let CARDS = null;
/** 카드의 현재 대장 형식(서버) — 없으면 이 브라우저 폴백 */
export async function cardSchema(card) {
  if (!CARDS) CARDS = api('/registry/cards').then((j) => new Map((j.items || []).map((c) => [c.id, c.ledger_schema || null]))).catch(() => { CARDS = null; return new Map(); });
  const m = await CARDS;
  return m.get(card) || LS.get(SCHEMA, {})[card] || null;
}
/** columns = [{ role, name }] (name = 대장 파일의 열 이름) */
export async function saveLedgerSchema({ kind, card, columns }) {
  const prev = await cardSchema(card);
  const keep = (prev?.kind === kind ? prev.columns || [] : []).filter((c) => !MEANING_ROLES.has(c.role));
  const body = { kind, columns: [...columns.map((c) => ({ key: c.name, label: c.name, role: c.role })), ...keep] };
  if (await hasRoute(`/registry/cards/${card}/ledger_schema`)) {
    const out = await api(`/registry/cards/${card}/ledger_schema`, { method: 'PUT', body });
    CARDS = null;
    devlog('ledger_schema', `PUT ${card} · ${out?.ledger_schema?.kind} · ${out?.ledger_schema?.columns?.length}`);
    return { server: true, out };
  }
  LS.set(SCHEMA, { ...LS.get(SCHEMA, {}), [card]: { ...body, at: new Date().toISOString() } });
  devlog('ledger_schema', 'S-6 없음 · 로컬 보관 ' + JSON.stringify(body));
  return { server: false };
}

/* ── 결합률 ─────────────────────────────────────────────────────
   필지 결합률 = AI 결과와 겹친 필지 ÷ 지역 필지(연속지적 적재분).
   분자: GET /results/{set}/parcels(서버 ST_Intersects · by_emd) · 분모: GET /survey/stats?by=emd(지역 읍면동). */
let STATS = null;
const statsEmd = () => (STATS ||= api('/survey/stats?by=emd').catch((e) => { STATS = null; throw e; }));

/** 지역에 결합할 수 있는가 — { emds[], parcels, set } | null */
export async function joinBasis(region, geo) {
  if (!/^\d{5}$/.test(String(region.sgg_cd))) return null;
  let st; try { st = await statsEmd(); } catch { return null; }
  const emds = (st.items || []).filter((i) => String(i.cd || '').startsWith(region.sgg_cd));
  if (!emds.length) return null;
  const cat = await catalog();
  const res = (cat.items || []).filter((i) => i.role === 'result' && i.set && hitB(i.bounds, geo.bbox))
    .sort((a, b) => (b.count?.value || 0) - (a.count?.value || 0));
  if (!res.length) return null;
  return { emds, parcels: emds.reduce((s, e) => s + (e.parcels?.value || 0), 0), as_of: st.as_of, set: res[0].set, setName: res[0].name?.ko };
}

const RATE = new Map();
/** 결합률 봉투 + 읍면동별 비율 + 결합 필지 일부(지도) */
export async function joinRate(basis, { force = false } = {}) {
  const key = basis.set + '|' + basis.emds.map((e) => e.cd).join(',');
  if (RATE.has(key) && !force) return RATE.get(key);
  const p = (async () => {
    const j = await api(`/results/${basis.set}/parcels?limit=1200&emd_cd=${basis.emds.map((e) => e.cd).join(',')}`);
    const by = new Map((j.lx?.by_emd || []).map((b) => [b.emd_cd, b.parcels?.value || 0]));
    const joined = [...by.values()].reduce((s, v) => s + v, 0);
    const per = new Map(basis.emds.map((e) => [e.cd, e.parcels?.value ? (by.get(e.cd) || 0) / e.parcels.value : 0]));
    const value = basis.parcels ? Math.round((joined / basis.parcels) * 1000) / 10 : null;
    const e = { ...env(value, '%', 'inferred', basis.set, '확인 전 · AI 결과와 겹친 필지 ÷ 지역 필지'), as_of: j.lx?.count?.as_of || new Date().toISOString() };
    devlog('join rate', `${joined} / ${basis.parcels} = ${value}% · ${j.lx?.ms} ms`);
    return { env: e, per, joined, fc: { type: 'FeatureCollection', features: (j.features || []).filter((f) => f.geometry) } };
  })();
  RATE.set(key, p);
  p.catch(() => RATE.delete(key));
  return p;
}

/** 결합 실행 — POST /jobs/quote{kind:join} → POST /jobs → SSE /events/jobs/{id} */
export async function runJoin(basis, h) {
  // 서버 join 어댑터는 자동 선택에서 빠져 있다(hidden) — 이름을 함께 보낸다(운영 서버는 이 칸을 무시하고 자동 선택)
  const body = { kind: 'join', adapter: 'survey/join', options: { source_set: basis.set, emd_cd: basis.emds.map((e) => e.cd) } };
  const q = await api('/jobs/quote', { method: 'POST', body });
  devlog('join quote', `${q.shards} · ${q.allowed ? 'ok' : q.reasons?.join(',')}`);
  if (!q.allowed) throw Object.assign(new Error('not allowed'), { code: q.reasons?.[0] || 'not_allowed' });
  const out = await api('/jobs', { method: 'POST', body });
  const job = out.job || out;
  devlog('join job', job.id);
  return { job, watch: watchJoin(job, q.shards || basis.emds.length, h) };
}

/** 이미 돌고 있는 결합(다시 들어왔을 때 이어 보기) */
export async function runningJoin(basis) {
  try {
    const j = await api('/jobs?limit=40');
    return (j.items || []).find((x) => x.kind === 'join' && (x.state === 'queued' || x.state === 'running') && (!x.options?.source_set || x.options.source_set === basis.set)) || null;
  } catch { return null; }
}

/** SSE /events/jobs/{id} — 처음부터 재생되므로 이어 보기도 같은 길 */
export function watchJoin(job, total, { onShard, onProgress, onDone, onFail }) {
  let done = 0;
  const s = sse('/events/jobs/' + job.id, {
    on: (name, d) => {
      if (name === 'shard.done') { done++; onShard?.(String(d?.shard_id || '').replace(/^emd-/, ''), d); onProgress?.(done / (total || 1)); }
      if (name === 'job.done') { s.close(); api('/jobs/' + job.id).then((j) => { devlog('join done', `${j.state} · ${j.shards_done}/${j.shards_total}`); onDone?.(j); }).catch(() => onDone?.(null)); }
      if (name === 'job.failed' || name === 'job.cancelled') { s.close(); onFail?.(d); }
    },
  });
  return { close: () => s.close() };
}

export const who = () => session.get();
