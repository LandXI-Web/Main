// 실자산 로더 — 이 프로토가 화면에 그리는 숫자는 전부 여기서 온 실제 파일값이다.
// 원칙: 없는 것을 만들어내지 않는다. 로드가 실패하면 그 항목은 화면에서 사라지고,
//       추정/합성인 항목은 synthetic:true 를 달아 UI 가 반드시 라벨을 붙이게 한다.

import { cssVar } from '../assets/js/tokens.js';

export const BASE = '../';           // landxi/proto/ → landxi/
const url = (rel) => BASE + rel;

export async function loadJSON(rel) {
  const r = await fetch(url(rel));
  if (!r.ok) throw new Error(rel + ' ' + r.status);
  return r.json();
}

/* ── 클래스 → 색 고정 매핑 (Roboflow ColorLookup.CLASS) ───────────────────
   화면이 바뀌어도 같은 클래스는 같은 색. 값의 단일 출처는 tokens.css 의 --det-*. */
const DET_SLOT = {
  marine_debris: 2, styrofoam: 2, Styrofoam: 2,
  buoy_blue: 6, buoy_red: 1, buoy_bottle: 4, plastic_box: 9,
  rope: 7, net: 8, other_debris: 0,
  비닐하우스_단동: 1, 비닐하우스_다동: 4, 불법건축물: 3, 경작지: 5, 비경작지: 8,
  veg_gain: 5, veg_loss: 1, built_new: 3, other: 0,
  Vinylhouse: 1, House: 5, Road: 8, Car: 4, Bus: 6, Truck: 9, People: 7,
};
let slotCursor = 0;
const assigned = new Map();
export function classColor(cls) {
  if (assigned.has(cls)) return assigned.get(cls);
  const slot = DET_SLOT[cls] ?? ((slotCursor = (slotCursor + 3) % 10));
  const c = cssVar('--det-' + slot, '#6675FF');
  assigned.set(cls, c);
  return c;
}
export const CLASS_KO = {
  marine_debris: '해양쓰레기(스티로폼)', styrofoam: '스티로폼', Styrofoam: '스티로폼(항공)',
  buoy_blue: '부표(청)', buoy_red: '부표(적)', buoy_bottle: '부표(병형)',
  plastic_box: '플라스틱 상자', rope: '로프', net: '어망', other_debris: '기타 쓰레기',
  veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '나지/구조물 신규', other: '기타',
  불법건축물: '불법건축물', 경작지: '경작지', 비경작지: '비경작지',
};
export const ko = (c) => CLASS_KO[c] || c;

/* ── 검출 세트 ────────────────────────────────────────────────────────────
   전남 해양쓰레기 = 실제 3개 산출물의 합집합. 각 피처에 출처(src)를 박아 둔다. */
const SETS = [
  { id: 'marine-5k', file: 'assets/data/geo/marine-debris.geojson',
    label: '해양쓰레기 폴리곤 5,000', src: 'marine-debris.geojson',
    grid: 'assets/data/geo/marine-debris-grid.geojson', required: true },
  { id: 'yeosu-drone', file: 'assets/data/geo/results/yeosu-marine-2026-drone.geojson',
    label: '여수 해양쓰레기(드론) 8클래스', src: 'yeosu-marine-2026-drone.geojson', required: false },
  { id: 'yeosu-aerial', file: 'assets/data/geo/results/yeosu-marine-2025-aerial.geojson',
    label: '여수 해양쓰레기(항공)', src: 'yeosu-marine-2025-aerial.geojson', required: false },
];

const num = (v) => (Number.isFinite(+v) ? +v : null);

// 스키마가 세트마다 다르다(confidence/conf, class/cls, area_m2/area). 한 번만 정규화한다.
function normalize(fc, set) {
  const out = [];
  for (const f of fc.features || []) {
    if (!f || !f.geometry) continue;
    const p = f.properties || {};
    const conf = num(p.confidence ?? p.conf ?? p.score);
    if (conf === null) continue;                         // 신뢰도 없는 피처는 슬라이더 대상이 아니다
    const cls = String(p.class ?? p.cls ?? p.label ?? 'other');
    out.push({
      type: 'Feature',
      id: out.length + set.idBase,
      properties: {
        cls, conf: Math.round(conf * 1000) / 1000,
        area: num(p.area_m2 ?? p.area) ?? 0,
        set: set.id, src: set.src,
      },
      geometry: f.geometry,
    });
  }
  return out;
}

// 스키마가 세트마다 달라 Point/Polygon/MultiPolygon 이 섞여 들어온다. 깊이를 보지 말고 좌표만 걷는다.
function centroid(geom) {
  let x = 0, y = 0, n = 0;
  const walk = (a) => {
    if (!Array.isArray(a)) return;
    if (typeof a[0] === 'number') { x += a[0]; y += a[1]; n++; return; }
    for (const b of a) walk(b);
  };
  walk(geom.coordinates);
  return n ? [x / n, y / n] : null;      // 좌표가 없으면 null. [0,0] 을 돌려주면 bbox 가 기니 만 앞바다까지 늘어난다.
}

export async function loadDetections(onNote) {
  const feats = [];
  const sources = [];
  let idBase = 0;
  for (const s of SETS) {
    try {
      onNote?.(s.label + ' 로드');
      const fc = await loadJSON(s.file);
      const part = normalize(fc, { ...s, idBase });
      idBase += 100000;
      feats.push(...part);
      sources.push({ ...s, n: part.length });
    } catch (e) {
      if (s.required) throw e;                            // 5,000 폴리곤은 이 화면의 전제다
      console.info('[wf] 선택 산출물 없음:', s.file);
    }
  }
  // 중심점·bbox 를 한 번만 계산해 둔다(호버 크롭·격자 집계가 매 프레임 쓰는 값).
  let lo = 1, hi = 0, area = 0;
  const bbox = [180, 90, -180, -90];
  const classes = new Map();
  const good = [];
  for (const f of feats) {
    const p = f.properties;
    p.c = centroid(f.geometry);
    if (!p.c) continue;                                   // 좌표가 없는 피처는 지도에 올리지 않는다
    good.push(f);
    bbox[0] = Math.min(bbox[0], p.c[0]); bbox[1] = Math.min(bbox[1], p.c[1]);
    bbox[2] = Math.max(bbox[2], p.c[0]); bbox[3] = Math.max(bbox[3], p.c[1]);
    lo = Math.min(lo, p.conf); hi = Math.max(hi, p.conf); area += p.area;
    classes.set(p.cls, (classes.get(p.cls) || 0) + 1);
  }
  feats.length = 0; feats.push(...good);
  return {
    fc: { type: 'FeatureCollection', features: feats },
    feats, sources, area, bbox,
    conf: { lo: Math.floor(lo * 20) / 20, hi },
    classes: [...classes.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ cls: k, n, color: classColor(k) })),
  };
}

export async function loadGrid() {
  const g = await loadJSON('assets/data/geo/marine-debris-grid.geojson');
  let mx = 0;
  for (const f of g.features) mx = Math.max(mx, f.properties.count || 0);
  return { fc: g, max: mx, n: g.features.length };
}

/* ── 샘플 타일 ↔ 실제 탐지 결과 매핑 ──────────────────────────────────────
   여수 해안에는 우리 정사영상 타일이 없다. 그래서 노드 썸네일은 "샘플 도엽 즉시 추론"
   패턴으로 간다(Roboflow: 전체를 돌리기 전에 임계값을 눈으로 맞춘다).
   각 도엽에 실제로 존재하는 산출물만 연결한다. 없으면 없다고 쓴다. */
export const SAMPLES = {
  namwon_2508: { file: 'assets/data/geo/namwon-change.geojson', confKey: 'score', clsKey: 'cls',
                 label: '남원 변화지수(비지도) · score', note: '학습 모델 탐지가 아니라 4시점 영상 차분이다' },
  namwon_2504: { file: 'assets/data/geo/namwon-change.geojson', confKey: 'score', clsKey: 'cls',
                 label: '남원 변화지수(비지도) · score', note: '학습 모델 탐지가 아니라 4시점 영상 차분이다' },
  jeju_2020:   { file: 'assets/data/geo/jeju-illegal.geojson', confKey: null, clsKey: null,
                 cls: '불법건축물', label: '제주 불법건축물 실탐지 폴리곤', note: '원본에 신뢰도 값이 없다' },
  jeju_2022:   null,
  kuksan_a68:  null,
  kuksan_a71:  null,
};

const sampleCache = new Map();
export async function loadSample(imgId) {
  const spec = SAMPLES[imgId];
  if (!spec) return { feats: [], spec: null };
  if (sampleCache.has(imgId)) return sampleCache.get(imgId);
  const fc = await loadJSON(spec.file);
  const feats = (fc.features || []).map((f) => {
    const p = f.properties || {};
    return {
      geometry: f.geometry,
      cls: spec.clsKey ? String(p[spec.clsKey]) : spec.cls,
      conf: spec.confKey ? Number(p[spec.confKey]) : null,
      area: Number(p.area_m2 ?? p.area ?? 0),
    };
  });
  const out = { feats, spec };
  sampleCache.set(imgId, out);
  return out;
}

/* ── 학습 곡선 ────────────────────────────────────────────────────────────
   실제 학습 로그(results.csv)가 저장소에 없다. 그러므로 그리는 곡선은 예시다.
   숫자를 진짜처럼 보이게 하지 않기 위해 (a) 축 라벨에 "예시"를 박고,
   (b) 모델 id 로 시드를 고정해 새로고침마다 값이 달라지지 않게 한다. */
export function exampleCurve(modelId, epochs = 100) {
  let s = 0;
  for (let i = 0; i < modelId.length; i++) s = (s * 31 + modelId.charCodeAt(i)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const loss = [], map50 = [];
  let l = 2.4 + rnd() * 0.6, m = 0.05;
  const ceiling = 0.68 + rnd() * 0.22;
  for (let e = 0; e < epochs; e++) {
    l = Math.max(0.22, l * (0.958 + rnd() * 0.02));
    m = m + (ceiling - m) * (0.055 + rnd() * 0.03);
    loss.push(l); map50.push(Math.min(ceiling, m + (rnd() - 0.5) * 0.012));
  }
  return { loss, map50, synthetic: true, ceiling };
}
