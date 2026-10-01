/* lx-ingest data.js — 데이터 올리기 화면의 데이터 한 곳.
   명세 §2.4 API: GET /catalog/layers · /regions/{sgg}(S-3) · /proxy/vworld/data · 필지 단위 결과 GET /survey/build/{sgg}(결합 실행은 뺌 · M-3 ⓐ) ·
   영상 등록 = 파일 끌어 놓기(조각 올리기 /catalog/imagery/uploads → POST /catalog/imagery {draft_id} · 구현 4차 fixes · 확인 대장 1차 FR-1) ·
   PUT /registry/cards/{id}/ledger_schema(S-6).
   S-3 · S-5 · S-6 은 서버에 있다(2026-09-27 · openapi 로 확인). 아래 어댑터는 경로가 없을 때만 쓰는 폴백이다:
     · 지역 목록·경계  /regions 없음 → V-World 시군구(LT_C_ADSIGG_INFO)
     · 지역 영상       /regions/{sgg} 없음 → 카탈로그 bounds 대조
     · 대장 형식       PUT …/ledger_schema 없음 → 이 브라우저에 보관
   숫자는 전부 봉투(env). */
import { api, hasRoute, LS, bboxOf, session } from '../kit/util.js';
import { env } from '../../shared/api-v1.js';
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
  for (const r of rows) { const k = (r.year ? `${r.year} ${r.res} ${r.kind}` : `${r.res} ${r.kind} · 촬영 연도 모름`).replace(/\s+/g, ' ').trim(); if (!seen.has(k)) seen.set(k, { ...r, label: k, n: 1 }); else seen.get(k).n++; }
  const items = rows.map((r) => r.item).filter((i) => i && i.bounds);
  return { rows, labels: [...seen.values()], items, as_of: det?.as_of || cat.as_of };
}

/** 원본 동적 타일 서명(LX 세션 · 12시간) — { url: …/{z}/{x}/{y}.webp?exp&sig } */
const SIG = new Map();
export function signCog(id) {
  if (!SIG.has(id)) SIG.set(id, api('/tiles/sign?' + new URLSearchParams({ set: 'cog/' + id })).catch((e) => { SIG.delete(id); devlog('sign', e.code || e.message); return null; }));
  return SIG.get(id);
}

/* ── 영상 등록 = 파일 끌어 놓기(구현 4차 fixes · 확인 대장 1차 FR-1 '기존 자산 기준으로' · 원칙 41 · 49 · 사용자 규칙 2) ──────────
   기관 분석 요청과 같은 조각 올리기(kit/dropzone.js uploadQueue · 여러 파일 · 진행 · 멈춤 · 이어 올리기 · 취소). 다 올리면 서버가 파일마다
   시군구 · 촬영 연도 · 해상도를 읽어 등록한다(입력 칸 없음 · 촬영 연도가 파일에 없으면 '촬영 연도 모름'). 서버 경로 등록은 LX 관리자 도구로만. */
export const UPLOADS = '/catalog/imagery/uploads';
let FORMATS = null;
/** 받는 형식(설정 한 곳 config/imagery.yaml) — 못 받으면 기본 목록 */
export function formats() {
  FORMATS ||= api(UPLOADS + '/formats').catch(() => ({ raster: ['tif', 'tiff', 'jpg', 'jpeg', 'jp2', 'j2k', 'ecw', 'img'],
    sidecar: ['tfw', 'tifw', 'jgw', 'jpgw', 'jpw', 'j2w', 'wld', 'eww', 'prj', 'aux.xml', 'ovr'] }));
  return FORMATS;
}
/** 올린 묶음 → 영상 등록(파일마다 한 영상) → { items:[{id, sgg_cd, region, place, year, gsd_m, kind}] } · 등록한 지역의 영상 목록을 새로 */
export async function registerDraft(draft, near) {
  const out = await api('/catalog/imagery', { method: 'POST', body: { draft_id: draft, near: near || undefined } });
  await catalog(true).catch(() => null);
  for (const cd of new Set((out.items || []).map((x) => x.sgg_cd))) await regionDetail(cd, { force: true });
  devlog('imagery', `등록 ${out.items?.length || 0} · ${(out.items || []).map((x) => x.id).join(', ')}`);
  return out;
}
/** 등록 전 묶음 지우기(다른 파일 고르기) */
export const dropDraft = (draft) => api(`/catalog/imagery/drafts/${encodeURIComponent(draft)}`, { method: 'DELETE' }).catch(() => null);
/** 영상 종류(사용자 말) — 해상도로: 드론 · 항공 · 위성 */
export const kindWord = (g) => (g == null ? '영상' : g < 0.1 ? '드론영상' : g < 1 ? '항공영상' : '위성영상');

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

/* ── 필지 단위 결과(확인 18차 M-3 ⓐ) ─────────────────────────────────────
   필지 결합(실태조사 — 필지 적재 · AI 결합 · 규칙 · 의심)은 서버가 전역 분석 뒤 저절로 만든다(서버 deploys.parcel_tick · 배포 흐름).
   이 화면은 상태만 읽는다 — GET /survey/build/{sgg} → { state: building | done | failed, finished_at } · 없으면 null(아직 없음).
   예전의 결합 실행(작업 kind join) · 결합률(결과 1,200건 표본 · 읍면동별)은 뺐다 — 서버 실태조사 표와 숫자가 둘로 갈리던 것(55.2% ↔ 60.8%)도 함께 사라진다. */
export async function parcelState(region) {
  if (!/^\d{5}$/.test(String(region?.sgg_cd || ''))) return null;
  try { return await api(`/survey/build/${encodeURIComponent(region.sgg_cd)}`); }
  catch (e) { if (e.code !== 'not_found') devlog('parcel state', e.code || e.message); return null; }
}

export const who = () => session.get();
