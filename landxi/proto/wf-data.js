/* wf-data.js — 국토 조사 보드 v3 · 실자산 로더
   원칙 하나: 화면에 뜨는 모든 숫자·픽셀·좌표는 저장소의 실제 파일에서 온다.
   없는 것은 만들지 않는다. 없으면 "없음"을 무채색으로 표시한다(FUI: 결손은 무채).

   여기서 오는 것들
   · IMAGERY   landxi/assets/data/imagery.js   — 정사영상 타일 카탈로그(남원 전역 2시점 + AOI 4시점)
   · MODELS    landxi/assets/data/models.js    — 실제 .pt 파일 stat
   · RESULTS   landxi/assets/data/results.js   — gpkg 원본 통계(건수·면적·신뢰도 히스토그램)
   · CHANGE    landxi/assets/data/change.js    — 4시점 변화지수(비지도) 건수
   · geojson   landxi/assets/data/geo/results/ — 실제 탐지 폴리곤
*/

import { IMAGERY } from '../assets/data/imagery.js';
import { MODELS } from '../assets/data/models.js';
import { RESULTS } from '../assets/data/results.js';
import { CHANGE } from '../assets/data/change.js';

export const BASE = '../';
export const url = (rel) => BASE + rel;

/* ── 색 — UI 는 무채색, 채도는 결과에만 (D15b / 취향규칙 6) ─────────────── */
export const C = {
  bg: '#010102', fg: '#FFFFFF', grey: '#CCCCCC', grey2: '#686868',
  line: '#272727', line2: '#3A3A3A',
  teal: '#0FA9A0', teal2: '#7FDCD6', teal3: '#0B6E69',   // 단일 액센트(AI 결과) 한 계열
  amber: '#FFB633',                                       // 탐지 "순간" 전용
  blue: '#006DF7',
};

// 클래스 → 단일 청록 계열 안에서만 명도로 구분한다. 무지개 팔레트는 즉시 "AI 슬롭"으로 읽힌다.
const TEAL_RAMP = ['#0FA9A0', '#7FDCD6', '#0B6E69', '#B7EDE9', '#14837E', '#5AC7C0', '#086561', '#9BE0DB'];
const clsOrderCache = new Map();
export function classColor(cls, order) {
  if (order != null) clsOrderCache.set(cls, order);
  const i = clsOrderCache.get(cls) ?? 0;
  return TEAL_RAMP[i % TEAL_RAMP.length];
}

export const CLASS_KO = {
  '비닐하우스_단동': '비닐하우스 단동', '비닐하우스_다동': '비닐하우스 다동',
  styrofoam: '스티로폼', Styrofoam: '스티로폼(항공)', buoy_blue: '부표(청)', buoy_red: '부표(적)',
  buoy_bottle: '부표(병형)', plastic_box: '플라스틱 상자', rope: '로프', net: '어망',
  other_debris: '기타 쓰레기', veg_gain: '식생 증가', veg_loss: '식생 감소',
  built_new: '나지·구조물 신규', other: '기타',
};
export const ko = (c) => CLASS_KO[c] || c;

export async function loadJSON(rel) {
  const r = await fetch(url(rel));
  if (!r.ok) throw new Error(rel + ' ' + r.status);
  return r.json();
}

const byId = (arr, id) => arr.find((x) => x.id === id) || null;
export const imagery = (id) => byId(IMAGERY, id);
export const model = (id) => byId(MODELS, id);
export const result = (id) => byId(RESULTS, id);

/* ── 시점 축 — 남원 정사영상 4시점 ────────────────────────────────────────
   전역(city) 정사영상은 04·10 두 시점만 존재한다. 06·08 은 금지 AOI 도엽에만 있다.
   타임라인은 이 사실을 숨기지 않고 "결손은 무채"로 그린다. */
export const EPOCHS = [
  { key: '2504', label: '2025-04', aoi: 'namwon_2504', city: 'namwon_city_2504' },
  { key: '2506', label: '2025-06', aoi: 'namwon_2506', city: null },
  { key: '2508', label: '2025-08', aoi: 'namwon_2508', city: null },
  { key: '2510', label: '2025-10', aoi: 'namwon_2510', city: 'namwon_city_2510' },
];

// 시점 사이 구간의 변화지수 건수 — 타임라인 이벤트 밀도 스파크의 실값.
export const SPANS = ['2504-2506', '2506-2508', '2508-2510'].map((pair) => {
  const c = CHANGE.find((x) => x.pair === pair);
  return c ? { pair, label: c.label, n: c.stats.n, by: c.stats.byClass, area: c.stats.area_m2, method: c.method }
           : { pair, label: pair, n: 0, by: {}, area: 0, method: '변화 지수(비지도)' };
});

/* ── 프리셋 ───────────────────────────────────────────────────────────── */
export const PRESETS = [
  {
    id: 'namwon-greenhouse',
    label: '남원시 비닐하우스',
    place: '전북 남원시 금지·송동',
    resultId: 'namwon-greenhouse-2025',
    imageryId: 'namwon_city_2510',
    modelId: 'best-vinylhouse',
    slice: 640, overlap: 0.2,
    conf0: 0.5,
    detZoom: 17,
    epochs: true,                    // 4시점 축을 가진 유일한 과업
    region: '남원시',
    humanScale: [54, '비닐하우스 1동'],
  },
  {
    id: 'yeosu-marine',
    label: '여수시 해양쓰레기',
    place: '전남 여수시 연안',
    resultId: 'yeosu-marine-2026-drone',
    imageryId: null,                 // 이 해안에는 우리 정사영상 타일이 없다 → 위성 크롭으로 대체
    modelId: null,                   // 저장소에 해양쓰레기 .pt 가 없다 → 모델 노드는 결손(무채)
    slice: 512, overlap: 0.2,
    conf0: 0.5,
    detZoom: 17,
    epochs: false,                   // 단일 시점(2026-05-13) — 시간축이 없다
    region: '여수시',
    humanScale: [25, '어선 1척'],
  },
];

/* ── 폴리곤 로드 ──────────────────────────────────────────────────────── */
function centroid(geom) {
  let x = 0, y = 0, n = 0;
  const walk = (a) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number') { x += a[0]; y += a[1]; n++; return; }
    for (const b of a) walk(b);
  };
  walk(geom.coordinates);
  return n ? [x / n, y / n] : null;
}

function bboxOf(geom) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (a) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number') {
      if (a[0] < w) w = a[0]; if (a[0] > e) e = a[0];
      if (a[1] < s) s = a[1]; if (a[1] > n) n = a[1];
      return;
    }
    for (const b of a) walk(b);
  };
  walk(geom.coordinates);
  return [w, s, e, n];
}

/** 프리셋 하나를 통째로 읽어 화면이 쓰는 형태로 정규화한다. */
export async function loadPreset(presetId, onNote) {
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const res = result(preset.resultId);
  const img = preset.imageryId ? imagery(preset.imageryId) : null;
  const mdl = preset.modelId ? model(preset.modelId) : null;

  onNote?.(res.title + ' 폴리곤 로드');
  const fc = await loadJSON(res.geojson);

  const classes = new Map();
  const feats = [];
  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i];
    if (!f || !f.geometry) continue;
    const p = f.properties || {};
    const conf = Number(p.conf ?? p.confidence ?? p.score);
    if (!Number.isFinite(conf)) continue;
    const cls = String(p.cls ?? p.class ?? 'other');
    const c = centroid(f.geometry);
    if (!c) continue;
    const obj = Number(p.nobj) || 1;                 // 필지 안의 실제 탐지 객체 수(비닐하우스 "동")
    feats.push({
      type: 'Feature', id: i,
      properties: { cls, conf: Math.round(conf * 1000) / 1000, area: Number(p.area) || 0,
                    pnu: p.pnu || null, emd: p.emd || null, nobj: obj, c, bb: bboxOf(f.geometry) },
      geometry: f.geometry,
    });
    classes.set(cls, (classes.get(cls) || 0) + 1);
  }

  const clsList = [...classes.entries()].sort((a, b) => b[1] - a[1])
    .map(([cls, n], i) => ({ cls, n, ko: ko(cls), color: classColor(cls, i) }));

  const st = res.stats;
  const data = {
    preset, res, img, mdl,
    fc: { type: 'FeatureCollection', features: feats },
    feats,
    classes: clsList,
    bbox: st.bbox,
    unit: res.unit,
    objTotal: st.objTotal ?? feats.reduce((a, f) => a + f.properties.nobj, 0),
    count: feats.length,
    areaHa: st.areaHa,
    confHist: st.confHist, confBins: st.confBins, confMean: st.confMean,
    analyzedAt: st.analyzedAt, src: res.src,
    emd: st.emd || null,
  };
  data.core = img?.core?.bounds || st.bbox;
  // 고해상 도엽(z16~17)이 실제로 존재하는 범위. 액자 크롭은 반드시 이 안에서만 잡는다 —
  // 밖으로 나가면 액자 절반이 검게 빈다(그것이야말로 목업으로 읽히는 방식이다).
  const inset = 0.006;
  data.detail = [data.core[0] + inset, data.core[1] + inset * 0.8,
                 data.core[2] - inset, data.core[3] - inset * 0.8];
  data.anchors = pickAnchors(feats, data.detail, 6);
  data.cells = densityCells(feats, data.detail, 0.005);
  data.cellsAll = densityCells(feats, null, 0.005);
  data.maxObj = data.cellsAll.length ? data.cellsAll[0].obj : 1;

  // 탐지 캐스케이드용 순위 r(0~1) — 코어 중심에서 바깥으로 물결치게 하는 실제 거리 순위.
  const cc = [(data.core[0] + data.core[2]) / 2, (data.core[1] + data.core[3]) / 2];
  const ranked = feats.map((f) => ({ f, d: Math.hypot(f.properties.c[0] - cc[0], (f.properties.c[1] - cc[1]) * 1.24) }))
    .sort((a, b) => a.d - b.d);
  ranked.forEach((x, i) => { x.f.properties.r = ranked.length > 1 ? i / (ranked.length - 1) : 0; });
  return data;
}

/* ── 노드 앵커 — 설계자가 찍은 좌표가 아니라 실제 탐지 밀도에서 뽑는다 ──── */
export function densityCells(feats, box, cell = 0.005) {
  const m = new Map();
  for (const f of feats) {
    const [x, y] = f.properties.c;
    if (box && (x < box[0] || x > box[2] || y < box[1] || y > box[3])) continue;
    const k = Math.floor(x / cell) + ':' + Math.floor(y / cell);
    const e = m.get(k) || m.set(k, { n: 0, obj: 0, sx: 0, sy: 0, conf: 0 }).get(k);
    e.n++; e.obj += f.properties.nobj; e.sx += x; e.sy += y; e.conf += f.properties.conf;
  }
  return [...m.values()].map((e) => ({ n: e.n, obj: e.obj, conf: e.conf / e.n, c: [e.sx / e.n, e.sy / e.n] }))
    .sort((a, b) => b.obj - a.obj);
}

function pickAnchors(feats, box, want) {
  const cells = densityCells(feats, box, 0.005);
  const out = [];
  const far = (c) => out.every((o) => Math.hypot(o.c[0] - c[0], (o.c[1] - c[1]) * 1.24) > 0.0085);
  for (const cell of cells) { if (out.length >= want) break; if (far(cell.c)) out.push(cell); }
  // 밀도 셀이 모자라면(작은 데이터셋) 코어 범위를 균등 분할해 채운다.
  let k = 0;
  while (out.length < want) {
    const t = (k + 0.5) / want;
    out.push({ n: 0, obj: 0, conf: 0, c: [box[0] + (box[2] - box[0]) * t, box[1] + (box[3] - box[1]) * (0.25 + 0.5 * t)] });
    k++;
  }
  return out.sort((a, b) => a.c[0] - b.c[0]).slice(0, want);
}

/* ── 선택(lasso/클릭) — 실제 폴리곤 bbox 로만 판정한다 ──────────────────── */
export function pickInBox(feats, box) {
  const [w, s, e, n] = box;
  const ids = [];
  for (const f of feats) {
    const b = f.properties.bb;
    if (b[2] < w || b[0] > e || b[3] < s || b[1] > n) continue;
    ids.push(f.id);
  }
  return ids;
}

/* ── 남원시 경계 (미니맵 = 영토, D12) ───────────────────────────────────── */
let sigunguCache = null;
export async function loadSigungu(name = '남원시') {
  if (sigunguCache) return sigunguCache;
  const g = await loadJSON('assets/data/geo/sigungu.geojson');
  const f = g.features.find((x) => x.properties && x.properties.name === name);
  sigunguCache = f || null;
  return sigunguCache;
}

export { MODELS, IMAGERY, RESULTS, CHANGE };
