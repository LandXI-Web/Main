/* adapter.js — 서비스 상세의 데이터 한 곳(명세 §2.14 데이터/API).
   서버 우선:  GET /registry/cards/{id}(S-6: intro · 모듈 · crop_url) → GET /deploys → GET /catalog/layers(결과 지도 층)
   S-6 이 아직 없을 때(계약 준수 폴백):
     · 로그인  = GET /registry/cards 목록에서 같은 id 를 찾고, intro 는 data/intro.json(S-6 과 같은 모양)
     · 게스트  = 카드 원천(landxi/assets/data/cards.js — 서버 시드가 읽는 그 파일)에서 이름·상태·모듈만. 숫자 0.
   모듈 이름(사용자 말)은 카드 원천의 EXT_MODULES 에서, 결과 크롭은 data/visuals.json 에서.
   3차: 정적 화면 캡처(숫자가 박힌 XI맵·할 일·보고서 사진) 0 — '결과 지도' 블록은 그 배포본의 결과 층을 실시간으로 그린다.
   4차: 블록은 항상 3 이상(크롭 없는 모듈 = K9 compact) · 결과 세트마다 지역(visuals.sets[].region/where) — 지금 지역 밖이면 화면이 '예시'를 붙인다.
   5차: 큰 숫자 = 실태조사 '현장 확인 필요'(XI맵과 같은 출처 · surveyOf) — 탐지 총수(봉투 scale)는 숫자 자리에 싣지 않는다 · 모듈 문장은 사용자 말로(plain).
   지역 착지: 배포본 sgg_cd → 지역 이름(시군구 경계 파일에서) → 결과 위치(크롭 좌표) → 배포 범위 중심 순. 해외 = 나라 · 지역 id. */
import { API, api, hasRoute, isEnvelope, bboxOf } from '/landxi/v3/kit/util.js';

const here = (p) => new URL(p, import.meta.url).href;
const json = (p) => fetch(here(p)).then((r) => r.json());
const once = (f) => { let p = null; return () => (p ||= f()); };

const seed = once(() => import('/landxi/assets/data/cards.js'));
export const intros = once(() => json('./data/intro.json'));
export const visuals = once(() => json('./data/visuals.json'));

/* 서버 시드와 같은 모듈 id 규칙(server/seed/seed_from_cards_js.py ext_modules) */
const FARM_EXT = { 'parcel-match': 'mod-farm-parcel', 'crop-cycle': 'mod-farm-cycle', 'house-count': 'mod-farm-house', 'farm-subsidy': 'mod-farm-subsidy' };
const modId = (key, m) => (key === 'farm' ? FARM_EXT[m.id] : null) || `mod-${key}-${m.id}`;

export const isTest = (d) => /-test(-\d+)?$/.test(d?.id || '') || /\(테스트\)|\btest\b/i.test(d?.name || '');
const baseOf = (src) => String(src || '').split(/[\\/]/).pop().replace(/\.(geo)?json$|\.pmtiles$|\.gpkg$/i, '');

/** 카드 목록(서버 모양 {id, name, scope, status, modules:{ext:{id:bool}}}) */
export async function loadCards(who) {
  if (who?.me?.realm === 'lx') {   // 기관 세션은 목록이 403(S-6 ?public=1 전) — 콘솔을 더럽히지 않게 부르지 않는다
    try { const j = await api('/registry/cards'); return { items: j.items || [], from: 'server' }; } catch { /* 아래 */ }
  } else if (await hasRoute('/registry/cards/{id}')) {   // S-6 이후: 게스트·기관 = 공개 목록
    try { const j = await api('/registry/cards?public=1'); return { items: j.items || [], from: 'server' }; } catch { /* 아래 */ }
  }
  const m = await seed();
  const items = m.CARDS.map((c) => ({
    id: c.id, name: c.name, scope: c.scope, status: c.status,
    modules: { ext: Object.fromEntries((m.EXT_MODULES[c.ext] || []).map((x) => [modId(c.ext, x), x.build === 'done'])) },
  }));
  return { items, from: 'seed' };
}

/** 카드 1장의 상세 — intro · 모듈 블록 재료 · 히어로 비주얼 */
export async function loadDetail(id, list, who) {
  let card = list.find((c) => c.id === id) || null;
  if (await hasRoute('/registry/cards/{id}')) {
    try { card = { ...(card || {}), ...(await api(`/registry/cards/${encodeURIComponent(id)}` + (who?.me?.realm === 'lx' ? '' : '?public=1'))) }; } catch { /* 목록 값 유지 */ }
  }
  if (!card) return null;
  const [m, intro, vis] = await Promise.all([seed(), intros(), visuals()]);
  const src = m.CARDS.find((c) => c.id === id) || {};
  const key = src.ext;
  const names = new Map((m.EXT_MODULES[key] || []).map((x) => [modId(key, x), x]));

  /* 모듈: 서버 ext(dict) 우선, 비어 있으면 카드 원천. 만들어진 것 먼저 */
  const ext = card.modules?.ext;
  const order = [...names.keys()];
  const extIds = ext && !Array.isArray(ext) && Object.keys(ext).length
    ? Object.keys(ext).sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99))
    : order;
  const built = (mid) => (ext && !Array.isArray(ext) && mid in ext ? !!ext[mid] : names.get(mid)?.build === 'done');
  /* 만든 정도: 만든 것(2) → 만드는 중(1) → 설계만(0) */
  const grade = (mid) => (built(mid) ? 2 : names.get(mid)?.build === 'wip' ? 1 : 0);
  const blocks = extIds.map((mid) => {
    const n = card.module_names?.[mid] || names.get(mid) || {};
    return { id: mid, name: n.name || n, desc: plain(n.desc), built: built(mid), grade: grade(mid), sets: vis.modules[id]?.[mid] || [] };
  }).filter((b) => typeof b.name === 'string' && b.name);
  const real = blocks.filter((b) => b.sets.length).map((b) => ({ ...b, kind: 'set' }));
  const pending = blocks.filter((b) => !b.sets.length).sort((a, b) => b.grade - a.grade).map((b) => ({ ...b, kind: 'empty' }));
  /* 공통 모듈(모든 카드가 갖는 기본 틀) — 전용 모듈이 모자랄 때만 · 사용자 업무에 닿는 것(visuals.core 순서) */
  const core = (vis.core || []).map((cid) => (m.CORE_MODULES || []).find((x) => x.id === cid)).filter(Boolean)
    .map((x) => ({ id: `core-${x.id}`, name: x.name, desc: plain(x.desc), built: true, grade: 2, sets: [], kind: 'empty', core: x.id }));

  /* 서버 intro 는 명세 모양(H2 2줄 = ' / ' 로 나뉜 헤드라인)일 때만 쓴다 — 지금 시드는 업무명(duty)·요약(summary)을 그대로 옮겨 2줄이 아니다 */
  const srv = card.intro && /\s\/\s/.test(card.intro.headline || '') ? card.intro : null;
  const it = srv || intro[id] || { headline: card.name, line: '' };
  const hero = { ...(vis.hero[id] || {}) };
  if (hero.img && !/^\/|^https?:/.test(hero.img)) hero.img = vis.own + hero.img;
  if (card.crop_url && !hero.img) hero.img = card.crop_url;   // 이 화면 전용 고해상 실결과 히어로가 없을 때만 서버 크롭
  return { card, intro: it, real, pending, core, hero, vis, key };
}

/** 교차 블록 3–5(항상 3 이상) — ① 실결과 모듈(크롭) → ② 결과 지도(그 배포본 결과 층 · 실시간)
    → ③ 3개가 될 때까지 크롭 없는 전용 모듈(만든 것 → 만드는 중 → 설계만 · K9 compact)
    → ④ 그래도 모자라면 공통 모듈(K9 compact · 결과 지도가 이미 있으면 지도 열람은 뺀다).
    정적 화면 캡처·다른 카드 화면으로 채우지 않는다. */
export function buildBlocks(D, live) {
  const MIN = 3, MAX = 5;
  const out = D.real.slice(0, MAX);
  if (live && out.length < MAX) out.push({ kind: 'live', id: 'core-map', name: '결과 지도', desc: '판독 결과를 그 지역 지도에 바로 올림', ...live });
  for (const b of D.pending) { if (out.length >= MIN) break; out.push(b); }
  for (const b of D.core || []) { if (out.length >= MIN) break; if (live && b.core === 'mapview') continue; out.push(b); }
  return out;
}

/** 모듈 문장(카드 원천)을 사용자 말로 — 괄호 속 영문 약어(코드 식별자) · 권한 꼬리말을 지운다 */
export function plain(s) {
  return String(s || '')
    .replace(/\s*\((?=[^)]*\b[A-Z]{2,}\b)[^)]*\)/g, '')
    .replace(/\s*[—-]\s*[A-Z]{2,}\s*권한\s*$/, '')
    .replace(/\s{2,}/g, ' ').trim();
}

/** 결과 세트의 지역(데이터 파일의 region_profile · 사용자 말 이름) */
export const regionOfSet = (vis, set) => ({ profile: vis.sets[set]?.region || '', name: vis.sets[set]?.where || '' });

/** 이 카드의 배포본(지역) — 로그인만. 게스트는 S-7 ?public=1 이 생기기 전까지 0. */
export async function loadDeploys(who) {
  if (!who) return [];
  try { const j = await api('/deploys'); return (j.items || []).filter((d) => !isTest(d)); } catch { return []; }
}

/** 결과 지도 재료 — 봉투가 있는 배포본 중 결과 층이 카탈로그에 있는 것(봉투 출처 이름 = 층 id). 없으면 null(블록을 뺀다). */
export async function liveLayer(deploys, who, scope) {
  const ds = deploys.filter((d) => isEnvelope(d.scale) && d.scale.source);
  if (!ds.length || scope === 'global') return null;
  let items = [];
  try {
    const j = await api('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build: who?.me?.realm === 'lx' ? 'lx' : 'tenant', locale: 'ko' }));
    items = (j.items || []).filter((i) => i.role === 'result' && i.kind === 'vector' && i.url && i.layer);
  } catch { return null; }
  for (const d of ds) {
    const it = items.find((i) => i.id === baseOf(d.scale.source));
    if (it) return { deploy: d, layer: it };
  }
  return null;
}

/** 크롭 URL */
export const cropUrl = (vis, set, frame, x2 = true) => `${vis.sets[set]?.own ? vis.own : vis.crops}${set}/${frame}${x2 ? '@2x' : ''}.jpg`;

/** 결과 세트 → 그 결과를 낸 배포본(봉투 출처가 세트 이름을 담는다) */
export function deployOfSet(deploys, set) {
  return deploys.find((d) => isEnvelope(d.scale) && baseOf(d.scale.source) === set) || deploys.find((d) => isEnvelope(d.scale) && String(d.scale.source || '').includes(set)) || null;
}

/* ── 착지(이 지역에서 열기) ───────────────────────────────── */
function ringHas(r, x, y) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
export function geomHas(g, x, y) {
  if (!g) return false;
  if (g.type === 'Polygon') return ringHas(g.coordinates[0], x, y) && !g.coordinates.slice(1).some((h) => ringHas(h, x, y));
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => ringHas(p[0], x, y) && !p.slice(1).some((h) => ringHas(h, x, y)));
  if (g.type === 'Feature') return geomHas(g.geometry, x, y);
  if (g.type === 'FeatureCollection') return g.features.some((f) => geomHas(f.geometry, x, y));
  return false;
}
const norm = (s) => String(s || '').replace(/\s+/g, '');
/* XI맵이 지역을 찾는 그 파일(시군구 경계) — 같은 코드로 넘겨야 그 지역에 착지한다 */
const sgg = once(() => fetch('/landxi/assets/data/geo/sigungu.geojson').then((r) => r.json())
  .then((j) => (j.features || []).map((f) => ({ code: String(f.properties.code), name: f.properties.name, full: `${f.properties.sido} ${f.properties.name}`, geom: f.geometry, bbox: bboxOf(f) })))
  .catch(() => []));
const cropPts = once(() => import('/landxi/assets/data/crops.js').then((m) => m.CROPS || {}).catch(() => ({})));
const world = once(() => fetch('/landxi/global/data/lx-countries.json').then((r) => r.json()).then((j) => j.world?.features || []).catch(() => []));
const admCache = {};

function sggByName(list, nm) {
  const toks = String(nm || '').trim().split(/\s+/).filter(Boolean);
  for (let n = toks.length; n >= 2; n--) { const q = norm(toks.slice(0, n).join(' ')); const r = list.find((x) => norm(x.full) === q); if (r) return r; }
  for (const tk of toks) { const c = list.filter((x) => x.name === tk); if (c.length === 1) return c[0]; }
  return null;
}
function sggByPoints(list, pts) {
  const n = new Map();
  for (const [x, y] of pts) {
    const r = list.find((s) => s.bbox && x >= s.bbox[0] && x <= s.bbox[2] && y >= s.bbox[1] && y <= s.bbox[3] && geomHas(s.geom, x, y))
      || list.find((s) => s.bbox && x >= s.bbox[0] && x <= s.bbox[2] && y >= s.bbox[1] && y <= s.bbox[3]);
    if (r) n.set(r, (n.get(r) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
const centerOf = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
function samples(aoi, k = 12) {
  const b = bboxOf(aoi); if (!b) return [];
  const out = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const x = b[0] + ((i + 0.5) / k) * (b[2] - b[0]), y = b[1] + ((j + 0.5) / k) * (b[3] - b[1]);
    if (geomHas(aoi, x, y)) out.push([x, y]);
  }
  return out.length ? out : [centerOf(b)];
}

/** 배포본 → 시군구(코드 · 이름) — sgg_cd → 지역 이름 → 결과 위치(크롭 좌표) → 배포 범위 중심 */
async function sggOf(d) {
  const list = await sgg();
  let r = (d.sgg_cd && list.find((x) => x.code === String(d.sgg_cd))) || sggByName(list, d.region_name?.ko);
  if (!r && isEnvelope(d.scale)) {
    const set = baseOf(d.scale.source);
    const pts = ((await cropPts())[set] || []).map((c) => c.lnglat).filter(Boolean);
    if (pts.length) r = sggByPoints(list, pts);
  }
  if (!r && d.aoi) r = sggByPoints(list, [centerOf(bboxOf(d.aoi))]);
  return r;
}

/* ── 큰 숫자 = 실태조사 '현장 확인 필요'(명세 §2.14 `GET /survey/stats?by=deploy&card=` · §4-7 허용 라벨) ──
   서버에 by=deploy 가 생기면(게이트웨이 openapi 에 `card` 인자) 그 봉투를 쓰고, 아직이면 XI맵 HUD 와 **같은 조회**로 만든다:
   그 배포본 시군구의 읍면동(/survey/stats?by=emd) → /survey/findings?priority=A&state=open,assigned&emd_cd=… → 서로 다른 필지 수.
   필지 대조 모듈이 켜진 배포본만(영업 성과 띠와 같은 조건). 없으면 null = 숫자 없이 `{지역} · {기준일} 기준`만. */
const hasParcel = (d) => Object.entries(d?.modules?.ext || {}).some(([k, v]) => v && /-parcel$/.test(k));
const byDeploy = once(() => fetch(API.prefix + '/openapi.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null))
  .then((j) => (j?.paths?.['/api/v1/survey/stats']?.get?.parameters || []).some((p) => p.name === 'card')).catch(() => false));
const surveyEmds = once(() => api('/survey/stats?by=emd').then((j) => (j.items || []).filter((i) => i.cd)).catch(() => null));
const byRegion = new Map();
const byCard = new Map();
export async function surveyOf(d) {
  if (!d || !hasParcel(d)) return null;
  if (await byDeploy()) {
    const c = d.card_id || '';
    if (!byCard.has(c)) byCard.set(c, api('/survey/stats?' + new URLSearchParams({ by: 'deploy', card: c })).catch(() => null));
    const j = await byCard.get(c);
    const it = (j?.items || []).find((x) => (x.deploy_id || x.key || x.id) === d.id);
    const env = it && [it.need, it.field_check, it.n].find(isEnvelope);
    if (env) return +env.value > 0 ? env : null;
  }
  const r = await sggOf(d);
  if (!r) return null;
  if (!byRegion.has(r.code)) byRegion.set(r.code, (async () => {
    const emds = (await surveyEmds() || []).filter((e) => String(e.cd).startsWith(r.code));
    if (!emds.length) return null;
    const p = new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score', emd_cd: emds.map((e) => e.cd).join(',') });
    const j = await api('/survey/findings?' + p).catch(() => null);
    if (!j?.items?.length) return null;
    const pnus = new Set(j.items.map((f) => f.pnu));
    const total = j.total?.value ?? j.items.length, exact = j.items.length >= total;
    const need = exact ? pnus.size : Math.round(pnus.size * (total / Math.max(1, j.items.length)));
    return { value: need, unit: '필지', basis: exact ? (j.total?.basis || 'inferred') : 'estimate', as_of: j.as_of || '', source: 'AI 실태조사 결과', note: '현장 확인 전' };
  })());
  return byRegion.get(r.code);
}

/** 배포본 → 착지 { home:'xi-clean'|'global', qs } */
export async function landingOf(d, vis) {
  const b = bboxOf(d.aoi);
  const kr = b && b[0] >= 124 && b[2] <= 132.5 && b[1] >= 32.5 && b[3] <= 39.5;
  if (b && !kr) {
    const c = centerOf(b);
    const iso = (await world()).find((f) => geomHas(f.geometry, c[0], c[1]))?.properties?.iso3 || '';
    const qs = new URLSearchParams(); if (iso) qs.set('country', iso);
    const A = vis.globalAdm?.[iso];
    if (A) {
      const fc = await (admCache[iso] ||= fetch(A.file).then((r) => r.json()).catch(() => null));
      const feats = (fc?.features || []).filter((f) => !A.keep || Object.entries(A.keep).every(([k, v]) => f.properties?.[k] === v)).filter((f) => f.properties?.level !== 'bbox');
      const pts = samples(d.aoi);
      let best = null, hit = 0;
      for (const f of feats) { const n = pts.filter(([x, y]) => geomHas(f.geometry, x, y)).length; if (n > hit) { best = f; hit = n; } }
      if (!best && feats.length === 1) best = feats[0];
      if (best) qs.set('district', (A.prefix || '') + (A.id.map((k) => best.properties[k]).find((v) => v != null) ?? ''));
    }
    return { home: 'global', qs: qs.toString() };
  }
  const r = await sggOf(d);
  const qs = new URLSearchParams();
  qs.set('region', r ? r.code : (d.sgg_cd || d.region_name?.ko || ''));
  if (d.id) qs.set('deploy', d.id);
  return { home: 'xi-clean', qs: qs.toString(), name: r?.full || '' };
}

/** 결과 지도의 두 번째 카메라 — 그 결과 세트의 크롭 좌표 중 가장 촘촘한 곳(±반경) · 없으면 null */
export async function focusOf(set, r = 0.0055) {
  const pts = ((await cropPts())[set] || []).map((c) => c.lnglat).filter(Boolean);
  if (!pts.length) return null;
  let best = pts[0], bn = -1;
  for (const p of pts) { const n = pts.filter((q) => Math.abs(q[0] - p[0]) < 0.02 && Math.abs(q[1] - p[1]) < 0.02).length; if (n > bn) { bn = n; best = p; } }
  return [best[0] - r * 1.25, best[1] - r, best[0] + r * 1.25, best[1] + r];
}
