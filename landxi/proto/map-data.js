/* 지도 서비스(XI맵) · 통계 · 보고서 — 데이터 층.
   화면은 여기만 읽고, 여기는 `assets/data/*.js` 와 `assets/data/geo/**` 만 읽는다(카드 구조 R5).
   손 배치 수치 0 — 읍면동 집계 · 클래스 집계 · 5분위 · 창 안 건수는 전부 실 GeoJSON 에서 계산한다.
   원본 내부 키(cls 값 · 파일명 · 확장자)는 화면 글자로 내보내지 않는다(전수 검토 X5m). */
import { RESULTS, resultById } from '../assets/data/results.js';
import { SERVICES, serviceById } from '../assets/data/services.js';
import { CARDS, cardById, cardsOfService, scopeById } from '../assets/data/cards.js';
import { CHANGE } from '../assets/data/change.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { PROFILES } from '../assets/data/registry.js';

export const TEAL = '#0FA9A0';
export const GEO = '../assets/data/geo/';
export const CROP = '../assets/proto/crops/';
export const nf = new Intl.NumberFormat('ko-KR');
export const fx = (n, d = 1) => Number(n || 0).toFixed(d);
export const ha = (m2) => Number(m2 || 0) / 10000;

/* ══ 0. 지도 속성 — 서비스 관리(admin-map.js)가 저장한 값을 실제 렌더에 반영한다 ══
   키·기본값은 admin-map.js 와 1:1(원본 map-props.js 와 같은 localStorage 키). */
export const MAP_PROPS_KEY = 'lx-map-props';
export const MAP_PROP_DEFAULTS = {
  lxColor: '#FFF59D', lxWidth: 1, baseMap: 'satellite',
  searchStrokeColor: '#FFFFFF', searchWidth: 2, searchFillColor: '#FFFFFF', searchFillOpacity: 12,
  polyWidth: 2, updater: '', updatedAt: '',
};
export function mapProps() {
  try {
    const o = JSON.parse(localStorage.getItem(MAP_PROPS_KEY) || 'null');
    if (o && typeof o === 'object') return { ...MAP_PROP_DEFAULTS, ...o };
  } catch { /* 저장소 차단 · 손상 */ }
  return { ...MAP_PROP_DEFAULTS };
}
export const BASE_MAPS = [
  { id: 'base', name: '일반' }, { id: 'gray', name: '흑백' }, { id: 'night', name: '야간' },
  { id: 'satellite', name: '위성' }, { id: 'none', name: '빈화면' },
];
export const baseName = (id) => BASE_MAPS.find((b) => b.id === id)?.name || id;

/* ══ 1. 이름 — 원본 분류 키를 사람이 읽는 말로 ═════════════════════════════ */
const CLS_LABEL = {
  '비닐하우스_단동': '비닐하우스 · 단동', '비닐하우스_다동': '비닐하우스 · 다동',
  Styrofoam: '스티로폼', styrofoam: '스티로폼',
  buoy_bottle: '부표 · 병', buoy_blue: '부표 · 청색', buoy_red: '부표 · 적색',
  plastic_box: '플라스틱 상자', other_debris: '기타 쓰레기', rope: '밧줄', net: '어망',
  veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '신축', other: '기타',
};
export const clsLabel = (c) => CLS_LABEL[c] || String(c ?? '');
/** 면을 채우지 않고 점선 윤곽만 그리는 클래스(원본의 "둘째 클래스" 표현). */
const DASH_CLS = new Set(['비경작지', '비닐하우스_다동', 'veg_loss', 'other']);
export const isDashCls = (c) => DASH_CLS.has(c);

/* 행정 이름 — 지역 프로파일(registry.js)에서 편다. PNU 앞 5자리 ↔ 프로파일 code. */
const ADMIN = PROFILES.filter((p) => /^\d{5}$/.test(p.code)).map((p) => {
  const w = p.region.split(' ');
  return { code: p.code, sido: w[0], sgg: w[1] || '', unitLabel: p.unitLabel, crs: p.crs, area: p.area };
});
export const adminOf = (pnu) => ADMIN.find((a) => String(pnu || '').startsWith(a.code.slice(0, 2)))
  || { code: '', sido: '전북특별자치도', sgg: '남원시', unitLabel: '읍·면·동', crs: 'EPSG:5186' };

/** PNU 19자리 → 시도(2) 시군구(3) 읍면동(3) 리(2) 산(1) 본번(4) 부번(4). */
export function pnuParts(pnu) {
  const s = String(pnu || '').replace(/\D/g, '').padStart(19, '0');
  return { sidoCd: s.slice(0, 2), sggCd: s.slice(2, 5), emdCd: s.slice(5, 8), ri: s.slice(8, 10),
    san: s[10] === '2' ? '산' : '—', bon: parseInt(s.slice(11, 15), 10), bu: parseInt(s.slice(15, 19), 10) };
}

/* ══ 2. 결과 레이어 목록 — 카드 › 모델 › 결과 ══════════════════════════════
   왼쪽 `AI 분석 결과` 카드의 순서는 CARDS 순서 × card.services 순서다(손으로 적은 목록이 아니다).
   카드가 늘어도 이 함수는 그대로다. */
const EPOCH = IMAGERY.filter((i) => /^namwon_25\d\d$/.test(i.id));
const CHANGE_MAIN = CHANGE.find((c) => c.pair === '2504-2510') || CHANGE[0];
/** 결과 ↔ 판독에 쓴 정사영상. 남원 2025 결과 2종은 6월 드론 정사영상(GSD 1.69 cm)에서 나왔다. */
const SRC_IMAGERY = { 'namwon-farmland-2025': 'namwon_2506', 'namwon-greenhouse-2025': 'namwon_2506' };

function layersOfService(sv) {
  if (sv.results?.length) {
    return sv.results.map((rid) => {
      const r = resultById(rid); if (!r) return null;
      const cls = Object.keys(r.stats.classes || {});
      const sensor = r.sensor === 'drone' ? '드론' : r.sensor === 'aerial' ? '항공' : '위성';
      // 판독에 쓴 원본 영상 — imagery.js 에 있는 것만 시점·GSD 를 적는다(없으면 연도·센서만).
      const im = IMAGERY.find((i) => i.id === SRC_IMAGERY[r.id]);
      return {
        id: r.id, kind: 'result', title: r.title, service: sv.id, geojson: '../' + r.geojson,
        meta: im ? `${im.captured.replace('-', '.')} · ${sensor} ${(im.gsd * 100).toFixed(2)} cm` : `${r.year} · ${sensor}`,
        count: r.stats.count, unit: r.unit, classes: cls, classCounts: r.stats.classes,
        classArea: r.stats.classAreaM2 || {}, areaM2: r.stats.areaM2, bbox: r.stats.bbox,
        camera: r.camera, thumb: `${CROP}${r.id}/1.jpg`, region: r.region, what: r.what,
        crs: r.stats.crsSrc, analyzedAt: r.stats.analyzedAt, fields: r.fields,
        shared: r.id !== 'namwon-farmland-2025',   // 공유 받은 것 — 원본 시드의 공유 아이콘 자리
      };
    }).filter(Boolean);
  }
  if (sv.id === 'change') {
    const c = CHANGE_MAIN;
    return [{
      id: 'namwon-change-' + c.pair, kind: 'change', title: '남원 농경지 변화 지수(비지도)', service: sv.id,
      geojson: '../' + c.polygons, pair: c.pair,
      meta: `${c.fromDate.replace('-', '.')} → ${c.toDate.replace('-', '.')}`,
      count: c.stats.n, unit: '건', classes: Object.keys(c.stats.byClass), classCounts: c.stats.byClass,
      classArea: {}, areaM2: c.stats.area_m2, bbox: c.bounds, method: c.method,
      camera: { center: [(c.bounds[0] + c.bounds[2]) / 2, (c.bounds[1] + c.bounds[3]) / 2], zoom: 15.2 },
      thumb: `${CROP}kuksan-change/1.jpg`, region: '전북 남원시', crs: 'EPSG:5186',
      analyzedAt: '2026-06-08', shared: false,
      filter: ['==', ['get', 'pair'], c.pair],
    }];
  }
  return [];
}

/* 결과 레이어가 없는 서비스에 **왜 없는지**를 붙인다 (2026-09-21).
   발주자: "준비 중 · 결과 레이어 없음 11 … 이런건 또 뭐지?" / "실제 오픈한다는 조건으로
            좀 프로페셔널하게 해야 한다."
   전에는 이름 옆에 `0` 만 달려 있었다 — 늘 0 이라 아무 말도 못 하는 숫자였고,
   켤 수 없는 줄이 열한 개 깔려 있어 미완성으로 보였다. 이유는 저마다 다르다:
   자료까지 있고 판독만 안 한 것 · 카드는 운영 중인데 그 모델이 없는 것 · 카드가 아직 검토인 것 ·
   카드조차 없는 전국 라인업. 지어내지 않고 카드 상태와 자산 보유에서 읽어 온다. */
function soonWhy(sv, card) {
  if (sv.asset) return '자료 보유 · 판독 전';
  if (!card) return '전국 라인업 · 배포 전';
  if (card.status === '운영') return `${card.name} 운영 · 모델 개발 전`;
  return `${card.name} ${card.status}`;
}

/** 결과가 있는 서비스 = 그룹, 없는 서비스 = `준비 중`. 둘 다 카드 순서를 따른다. */
export function resultGroups() {
  const seen = new Set(), live = [], soon = [];
  for (const card of CARDS) {
    for (const sid of card.services || []) {
      if (seen.has(sid)) continue; seen.add(sid);
      const sv = serviceById(sid); if (!sv) continue;
      const items = layersOfService(sv);
      (items.length ? live : soon).push({ service: sv.id, name: sv.name, card: card.name, cardId: card.id, scope: card.scope, items, gap: card.gap, why: items.length ? '' : soonWhy(sv, card) });
    }
  }
  for (const sv of SERVICES) {                    // 카드에 묶이지 않은 모델도 빠뜨리지 않는다
    if (seen.has(sv.id)) continue; seen.add(sv.id);
    const items = layersOfService(sv);
    (items.length ? live : soon).push({ service: sv.id, name: sv.name, card: null, cardId: null, scope: 'local', items, gap: null, why: items.length ? '' : soonWhy(sv, null) });
  }
  return { live, soon };
}
export const ALL_LAYERS = resultGroups().live.flatMap((g) => g.items);
export const layerById = (id) => ALL_LAYERS.find((l) => l.id === id) || null;
export const layersOfCard = (cardId) => {
  const card = cardById(cardId); if (!card) return [];
  return ALL_LAYERS.filter((l) => (card.services || []).includes(l.service));
};
export const cardOfLayer = (id) => { const l = layerById(id); return l ? (cardsOfService(l.service)[0] || null) : null; };

/** 분기 맥락 — 카드가 글로벌이면 행정단위·좌표계 표기가 SCOPES 정의를 따른다(구조는 같다). */
export function scopeCtx(cardId) {
  const card = cardById(cardId);
  const sc = scopeById(card?.scope || 'local');
  return { id: sc.id, name: sc.name, short: sc.short, unitLabel: sc.unitLabel, unitExample: sc.unitExample, crs: sc.crs, source: sc.source, global: sc.id === 'global' };
}

/* ══ 3. 시점 스트립 — LX 정사영상 4시점(실 타일) ═══════════════════════════ */
export const EPOCHS = EPOCH.map((im, i) => ({
  id: im.id, label: im.label.split(' · ').pop(), full: im.label, gsd: im.gsd,
  gsdCm: (im.gsd * 100).toFixed(2), captured: im.captured, bounds: im.bounds,
  tiles: '../' + im.tiles, minzoom: im.minzoom, maxzoom: im.maxzoom,
  thumb: `${CROP}namwon-epoch/${i + 1}.jpg`,
}));
export const CHANGE_PAIRS = CHANGE.map((c) => ({ pair: c.pair, from: c.from, to: c.to, label: c.label, method: c.method, stats: c.stats, bounds: c.bounds }));
export const epochById = (id) => EPOCHS.find((e) => e.id === id) || EPOCHS[0];

/* ══ 4. 레이어 탭 트리 — 발행된 레이어 12(원본 시드 · 시연) ════════════════ */
export const LAYER_TREE = [
  { name: '행정정보', groups: [
    { name: '사료작물 정보', leaves: [
      { id: 'lt-feed-1', date: '2025.10.31', name: '사료작물(하계) · 사매면' },
      { id: 'lt-feed-2', date: '2025.06.30', name: '사료작물(IRG · 호밀) · 1권역' }] },
    { name: '농지이용 정보', leaves: [
      { id: 'lt-farm-1', date: '2025.09.30', name: '농지이용현황 · 사매면' },
      { id: 'lt-farm-2', date: '2025.06.30', name: '농지이용현황 · 운봉읍' }] },
    { name: '영농시설 정보', leaves: [
      { id: 'lt-fac-1', date: '2025.10.31', name: '영농시설 · 사매면' },
      { id: 'lt-fac-2', date: '2025.09.30', name: '영농시설 · 금지면', shared: true }] },
  ] },
  { name: '데이터셋', groups: [
    { name: '정사영상', leaves: [
      { id: 'lt-ortho-1', date: '2025.10.31', name: '사매면 정사영상 · 10월' },
      { id: 'lt-ortho-2', date: '2025.08.31', name: '운봉읍 정사영상 · 8월' }] },
    { name: '공간정보', leaves: [
      { id: 'lt-sp-1', date: '2025.10.31', name: '도로망 · 전체' },
      { id: 'lt-sp-2', date: '2025.09.30', name: '지적도 · 전체', shared: true }] },
    { name: '이미지셋', leaves: [
      { id: 'lt-img-1', date: '2025.10.15', name: '사매면 순찰 이미지셋' },
      { id: 'lt-img-2', date: '2025.09.20', name: '운봉읍 순찰 이미지셋' }] },
  ] },
];
export const TREE_LEAVES = LAYER_TREE.flatMap((s) => s.groups.flatMap((g) => g.leaves));

/* ══ 5. 검색 시드 — 명칭 · 도로명 · 지번(시연) ═════════════════════════════
   총 건수는 원본 시드 그대로, 좌표는 실 위치. 실서비스는 V-World 검색 API 응답을 쓴다. */
export const SEARCH_TOTAL = 488364;
export const SEARCH_SEED = {
  q: '남원',
  groups: [
    { key: 'name', label: '명칭', total: 7842, rows: [
      { title: '광한루원', cat: '관광지 > 문화재', addr: '전북특별자치도 남원시 요천로 1447', lnglat: [127.38341, 35.40196] },
      { title: '춘향테마파크', cat: '관광지 > 테마파크', addr: '전북특별자치도 남원시 양림길 14', lnglat: [127.38863, 35.39834] },
      { title: '남원시청', cat: '공공기관 > 시청', addr: '전북특별자치도 남원시 시청로 60', lnglat: [127.39037, 35.41648] }] },
    { key: 'road', label: '도로명', total: 90844, rows: [
      { title: '시청로', cat: '도로명주소', addr: '전북특별자치도 남원시 시청로', lnglat: [127.39064, 35.41533] },
      { title: '광한북로', cat: '도로명주소', addr: '전북특별자치도 남원시 광한북로', lnglat: [127.38536, 35.40695] },
      { title: '요천로', cat: '도로명주소', addr: '전북특별자치도 남원시 요천로', lnglat: [127.38471, 35.40408] }] },
    { key: 'jibun', label: '지번', total: 389678, rows: [
      { title: '도통동 456', cat: '지번주소', addr: '전북특별자치도 남원시 도통동 456', lnglat: [127.39633, 35.41182] },
      { title: '향교동 78', cat: '지번주소', addr: '전북특별자치도 남원시 향교동 78', lnglat: [127.37652, 35.41961] }] },
  ],
};

/* ══ 6. GeoJSON — 한 번만 받고 나눠 쓴다 ═══════════════════════════════════ */
const cache = new Map();
export function loadGeo(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`geojson ${r.status} ${url}`); return r.json(); }));
  return cache.get(url);
}
export const loadLayer = (l) => loadGeo(l.geojson).then((g) => (l.filter ? { ...g, features: g.features.filter((f) => f.properties.pair === l.pair) } : g));
export const loadEmd = () => loadGeo(GEO + 'namwon-emd.geojson');

const ringOf = (g) => (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
export function centroid(f) { const r = ringOf(f.geometry); let x = 0, y = 0; for (const c of r) { x += c[0]; y += c[1]; } return [x / r.length, y / r.length]; }
export function bboxOf(features) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const eat = (c) => { if (typeof c[0] === 'number') b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; else c.forEach(eat); };
  features.forEach((f) => eat(f.geometry.coordinates));
  return b;
}
/** 구면 근사 면적(㎡) — 읍면동 경계처럼 area 속성이 없는 도형에 쓴다. */
export function ringAreaM2(ring) {
  let a = 0; const R = 6378137, rad = Math.PI / 180;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((a * R * R) / 2);
}

/* ══ 7. 집계 — 전부 실 GeoJSON 에서 ════════════════════════════════════════ */
/** 읍면동별: 건수 · 면적 · 클래스별 면적. 원판의 32 읍면동 · 315.9 ha 는 이 함수의 결과다. */
export function byEmd(geo) {
  const m = new Map();
  for (const f of geo.features) {
    const p = f.properties, k = p.emd || '미상';
    let e = m.get(k);
    if (!e) { e = { emd: k, n: 0, area: 0, cls: {}, clsN: {} }; m.set(k, e); }
    e.n++; e.area += p.area || 0;
    e.cls[p.cls] = (e.cls[p.cls] || 0) + (p.area || 0);
    e.clsN[p.cls] = (e.clsN[p.cls] || 0) + 1;
  }
  return [...m.values()].sort((a, b) => b.area - a.area).map((e, i) => ({ ...e, rank: i + 1 }));
}
/** 클래스별: 면적 · 건수 · 비율(%). */
export function byClass(geo) {
  const m = new Map(); let total = 0;
  for (const f of geo.features) {
    const p = f.properties, k = p.cls;
    let e = m.get(k); if (!e) { e = { cls: k, label: clsLabel(k), n: 0, area: 0 }; m.set(k, e); }
    e.n++; e.area += p.area || 0; total += p.area || 0;
  }
  return [...m.values()].sort((a, b) => b.area - a.area).map((e) => ({ ...e, pct: total ? (e.area / total) * 100 : 0 }));
}
export const totalArea = (geo) => geo.features.reduce((a, f) => a + (f.properties.area || 0), 0);
/** 5분위 — 값이 큰 쪽이 5. 지역 구분 채움의 단계. */
export function quintile(values) {
  const s = [...values].filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return () => 0;
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]);
  return (v) => (v <= 0 ? 0 : v <= q[0] ? 1 : v <= q[1] ? 2 : v <= q[2] ? 3 : v <= q[3] ? 4 : 5);
}
export const QUINT_FILL = ['rgba(15,169,160,.16)', 'rgba(15,169,160,.26)', 'rgba(15,169,160,.38)', 'rgba(15,169,160,.52)', 'rgba(15,169,160,.66)'];

/** 표 행(탐지 정보 10열) — 실 feature 에서 편다. */
export function detectRows(geo, layer) {
  return geo.features.map((f, i) => {
    const p = f.properties, a = adminOf(p.pnu), q = pnuParts(p.pnu);
    return { i, id: p.id, sido: a.sido, sgg: a.sgg, emd: p.emd || '—', ri: q.ri, san: q.san, bon: q.bon || '—', bu: q.bu || 0,
      cls: p.cls, clsLabel: clsLabel(p.cls), area: p.area || 0, pnu: p.pnu || '', nobj: p.nobj || 0,
      lnglat: centroid(f), layer: layer.id, act: actOf(p.id) };
  });
}

/* ══ 8. 조치 상태 — 변경은 sessionStorage(새로고침하면 시드 복귀) ══════════ */
export const ACT_STEPS = [{ k: 'found', label: '발견' }, { k: 'doing', label: '조치중' }, { k: 'done', label: '처리 완료' }];
const ACT_KEY = 'lx-map-acts';
const acts = (() => { try { return JSON.parse(sessionStorage.getItem(ACT_KEY) || '{}'); } catch { return {}; } })();
export const actOf = (id) => acts[id] || 'found';
export const actMemo = (id) => acts[id + ':memo'] || '';
export function setAct(id, step, memo) {
  acts[id] = step; if (memo != null) acts[id + ':memo'] = memo;
  try { sessionStorage.setItem(ACT_KEY, JSON.stringify(acts)); } catch { /* 저장소 차단 */ }
}
export const actLabel = (k) => ACT_STEPS.find((s) => s.k === k)?.label || k;

/* ══ 9. 통계 기준 목록 — 최근 분석 결과 ════════════════════════════════════
   1건은 실 결과(results.js), 나머지는 원본 통계 기준 시드(권역) — `시연` 꼬리표를 단다. */
export function statsBasis(serviceId = 'farmland') {
  const real = RESULTS.filter((r) => r.service === serviceId).map((r) => ({
    id: r.id, title: r.title, at: r.stats.analyzedAt, model: 'XI-VFM v2.1', count: r.stats.count, unit: r.unit,
    scopeType: '농지이용 정보', scopeName: '남원시 전역', task: '농지 활용 분석',
    image: `남원 농경지 드론 정사영상 · ${r.stats.analyzedAt.slice(0, 7).replace('-', '.')}`, demo: false,
  }));
  const seed = [
    { id: 'seed-3', title: '남원시 3권역 · 농지활용 분석', at: '2026-04-07', scopeName: '남원시 3권역', image: '남원시 3권역 정사영상' },
    { id: 'seed-2', title: '남원시 2권역 · 농지활용 분석', at: '2026-03-21', scopeName: '남원시 2권역', image: '남원시 2권역 정사영상' },
    { id: 'seed-1', title: '남원시 1권역 · 농지활용 분석', at: '2026-03-05', scopeName: '남원시 1권역', image: '남원시 1권역 정사영상' },
  ].map((s) => ({ ...s, model: 'XI-VFM v2.1', count: null, unit: '필지', scopeType: '농지이용 정보', task: '농지 활용 분석', demo: true }));
  return [...real, ...seed];
}

/* ══ 10. 보고서 발급 내역 — 원본 시드(시연). 발급은 sessionStorage 에 쌓인다. ══ */
const REP_KEY = 'lx-map-reports';
const REP_SEED = [
  { id: 'rp-6', state: 'done', at: '2026-04-23 09:48:12', by: '관리자', dl: 4, title: '2026년 4월 농지 활용 현황 보고서', cls: ['경작지', '비경작지'], emds: [], all: true },
  { id: 'rp-5', state: 'done', at: '2026-04-20 14:12:08', by: '사용자', dl: 6, title: '2026년 1분기 농지 활용 종합 보고서', cls: ['경작지', '비경작지'], emds: ['주천면', '운봉읍'] },
  { id: 'rp-4', state: 'doing', at: '2026-04-15 16:45:22', by: '관리자', dl: 0, title: '2026년 4월 3주차 농지 활용 점검 보고서', cls: ['경작지'], emds: ['도통동', '죽항동'] },
  { id: 'rp-3', state: 'fail', at: '2026-04-11 11:08:40', by: '사용자', dl: 0, title: '2026년 4월 상순 농지 활용 현황', cls: ['경작지', '비경작지'], emds: ['금지면', '송동면'] },
  { id: 'rp-2', state: 'done', at: '2026-03-28 10:02:55', by: '관리자', dl: 2, title: '2026년 3월 농지 활용 현황 보고서', cls: ['경작지', '비경작지'], emds: ['사매면', '덕과면'] },
  { id: 'rp-1', state: 'done', at: '2026-03-12 15:31:07', by: '사용자', dl: 1, title: '2026년 1분기 비경작지 점검 보고서', cls: ['비경작지'], emds: ['아영면'] },
];
export const REPORT_STATES = [
  { k: 'all', label: '전체' }, { k: 'done', label: '처리 완료' }, { k: 'doing', label: '처리중' },
  { k: 'wait', label: '접수' }, { k: 'fail', label: '처리 실패' },
];
export const repStateLabel = (k) => REPORT_STATES.find((s) => s.k === k)?.label || k;
export function reports() {
  let mine = [];
  try { mine = JSON.parse(sessionStorage.getItem(REP_KEY) || '[]'); } catch { /* 저장소 차단 */ }
  return [...mine, ...REP_SEED];
}
export function addReport(r) {
  let mine = []; try { mine = JSON.parse(sessionStorage.getItem(REP_KEY) || '[]'); } catch { /* 저장소 차단 */ }
  mine.unshift(r);
  try { sessionStorage.setItem(REP_KEY, JSON.stringify(mine)); } catch { /* 저장소 차단 */ }
}
export const isSeedReport = (id) => REP_SEED.some((r) => r.id === id);

/* ══ 11. 보안 서약서 원문 — 원본 문구 그대로 ═══════════════════════════════ */
export const PLEDGE_TEXT = '본인은 Land-XI 플랫폼의 공간정보 다운로드 환경을 사용함에 있어 해당 자료를 외부로 유출하지 않을 것이며, 업무(과제) 수행에 한해 사용하고 이를 임의로 가공·편집·유출하지 않으며, 신청한 본인 외 제3자 또는 기관 내 타 사용자에게 공유하지 않고, 자료의 사용 및 활용, 목적 외 사용금지, 자료 보호조치, 자료오용방지 등에 대한 책임이 있음을 서약하고 이에 본 서약서를 제출합니다.';
export const PLEDGE_ERR = { agree: '보안 서약 내용에 동의해 주셔야 합니다.', name: '요청명을 입력해 주세요.', purpose: '사용 목적을 입력해 주세요.' };

export const today = () => new Date('2026-08-27T00:00:00+09:00');
export const ymd = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
export const plusMonth = (d, n = 1) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
export const stamp = () => { const d = today(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(new Date().getHours())}:${p(new Date().getMinutes())}:${p(new Date().getSeconds())}`; };
