// Ops Atlas — 데이터 조립층.
// 원칙(클라이언트 정정 2건):
//  1) 이것은 "운영 중인 시스템 현황"이 아니라 **Land-XI 신규 개발 콘티**다.
//     그래서 운영 서사(대기 일수 드라마·담당자 이름·활동 이력)를 만들지 않는다.
//     실제로 존재하는 것만 쓴다 — results.js(분석 결과 4건) · models.js(모델 10종)
//     · imagery.js(정사영상 11세트) · crops.js(증거 크롭) · assets/tiles(실타일).
//  2) 기능을 새로 만들지 않는다. 기존 Land-XI 기능을 **지도 위에 올리는 것**이 전부다.
//     추론 현황 = 분석 실행/워크플로우 상태 · 학습데이터 = 데이터 관리
//     · 결과 누적 = 분석 결과/XI맵. 대시보드의 기존 기능(처리 대기 큐·KPI·
//     방문/저장소 차트·전국 커버리지)은 원형 목업(dashboard.js)을 **시연 데이터**로
//     그대로 두고 원장(ledger) 행으로 흡수한다.
// 시뮬레이션에는 `모의 실행`, 원형 목업 유래 수치에는 `시연`/`추정` 꼬리표를 단다.
import { DASH } from '../assets/data/dashboard.js';
import { SURVEYS } from '../assets/data/surveys.js';
import { RESULTS } from '../assets/data/results.js';
import { MODELS } from '../assets/data/models.js';
import { IMAGERY } from '../assets/data/imagery.js';

export const nf = new Intl.NumberFormat('ko-KR');
export const pct = (v, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const DAY = 86400000;
const d = (s) => new Date(s + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const ymd = (s) => s.replace(/-/g, '.');

/* ── 기준 시점 ───────────────────────────────────────────────────────
   "오늘"을 지어내지 않는다. 데이터 기준 시점 = results.js 의 마지막 분석일. */
export const EPOCHS = RESULTS
  .map((r) => ({ id: r.id, date: r.stats.analyzedAt, title: r.title, region: r.region, count: r.stats.count, unit: r.unit }))
  .sort((a, b) => (a.date < b.date ? -1 : 1));
export const T0 = EPOCHS[0].date;                       // 2026-04-27
export const T1 = EPOCHS[EPOCHS.length - 1].date;       // 2026-06-08
export const DATA_ASOF = T1.slice(0, 7);                // 2026-06
const SPAN = Math.max(DAY, d(T1) - d(T0));
export const at = (date) => Math.min(1, Math.max(0, (d(date) - d(T0)) / SPAN));
export const dateAt = (p) => iso(d(T0).getTime() + p * SPAN);

/* ── 헤드라인 수치 = 실제 데이터셋 총계 ─────────────────────────────── */
export const TOTAL_OBJECTS = RESULTS.reduce((a, r) => a + r.stats.count, 0);   // 7,707
export const TOTAL_AREA_HA = RESULTS.reduce((a, r) => a + (r.stats.areaHa || 0), 0);

/* ══ 레지스터 1 · 추론 현황 ═══════════════════════════════════════════
   기존 기능: 분석 실행(analysis-ai) 3탭 = 실행 / 실행중 / 완료.
   완료 = results.js 4건(실측). 실행중 = 실타일을 실제로 훑는 모의 실행 3건. */

const modelBy = (id) => MODELS.find((m) => m.id === id);
export const MODEL_LIST = MODELS;

/** 남원 전역 정사영상(2025.10) z14 실타일 격자. 스윕이 실제로 이 좌표를 훑는다. */
export const SWEEP_TILE = { set: 'namwon_city_2510', z: 14, x0: 13980, x1: 14000, y0: 6458, y1: 6472 };
export const SWEEP_TILE_URL = (z, x, y) => `../assets/tiles/namwon_city_2510/${z}/${x}/${y}.webp`;

/** 모의 실행 3건 — 실제 모델 카드 · 실제 타일셋 · 실제 결과 geojson 을 가리킨다.
 *  진행률·처리속도·ETA 는 브라우저가 타일을 실제로 훑은 결과에서 나온다(지어내지 않음). */
export const RUNS = [
  {
    id: 'run-vinylhouse',
    model: modelBy('best-vinylhouse'),
    task: '비닐하우스 탐지',
    region: '전북 남원시',
    regionCode: '52190',
    imagery: 'namwon_city_2510',
    detections: '../assets/data/geo/results/namwon-greenhouse-2025.geojson',
    center: [127.3903, 35.4106],
    zoom: 12.2,
  },
  {
    id: 'run-farmland',
    model: modelBy('model-segformer-land'),
    task: '농지이용 분류',
    region: '전북 남원시',
    regionCode: '52190',
    imagery: 'namwon_city_2510',
    detections: '../assets/data/geo/results/namwon-farmland-2025.geojson',
    center: [127.4210, 35.4320],
    zoom: 12.2,
  },
  {
    id: 'run-house',
    model: modelBy('best-house'),
    task: '건물 탐지',
    region: '전북 남원시',
    regionCode: '52190',
    imagery: 'namwon_city_2510',
    detections: '../assets/data/geo/results/namwon-greenhouse-2025.geojson',
    center: [127.3620, 35.3860],
    zoom: 12.2,
  },
];

/** 완료 = 실제 분석 결과 4건. 여기 수치는 전부 원본 GPKG 통계다. */
export const DONE = RESULTS.map((r) => ({
  id: r.id,
  title: r.title,
  region: r.region,
  sensor: r.sensor === 'drone' ? '드론' : '항공',
  unit: r.unit,
  count: r.stats.count,
  date: r.stats.analyzedAt,
  classes: r.stats.classes,
  conf: r.stats.confMean,
  areaHa: r.stats.areaHa,
  bbox: r.stats.bbox,
  geojson: '../' + r.geojson,
  service: SURVEYS.find((s) => s.id === r.service)?.name || r.service,
  emd: r.stats.emd || null,
}));

export const doneById = (id) => DONE.find((x) => x.id === id);

/* ══ 레지스터 2 · 학습데이터 ══════════════════════════════════════════
   기존 기능: 데이터 관리(dataset.html) — 업로드된 정사영상/라벨 인벤토리.
   지도에서는 "라벨 표본이 어디에 얼마나 쌓였는가"의 밀도로 보인다. */

export const IMG = IMAGERY.map((i) => ({
  ...i,
  gsdCm: i.gsd < 1 ? +(i.gsd * 100).toFixed(1) : null,
  gsdM: i.gsd >= 1 ? i.gsd : null,
  zSpan: `z${i.minzoom}–z${i.maxzoom}`,
}));
export const IMG_CITY = IMG.filter((i) => i.coverage === 'city');
export const IMG_AOI = IMG.filter((i) => i.coverage !== 'city');

/** 클래스 균형 — 실제 클래스명/건수만. 지역별로 묶는다. */
export const CLASS_BALANCE = DONE.map((r) => ({
  id: r.id,
  region: r.region,
  title: r.title,
  total: r.count,
  rows: Object.entries(r.classes)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, n, share: n / r.count })),
}));

/* ══ 레지스터 3 · 결과 누적 ═══════════════════════════════════════════
   기존 기능: 분석 결과 / XI맵 — 지역별로 무엇이 얼마나 쌓였는가.
   실측(측정) = results.js 의 시군구 2곳. 나머지 전북 14곳은 원형 목업의
   커버리지 시연값이라 `추정` 꼬리표를 달고 높이를 세우지 않는다. */

const SIGUNGU_CENTER = {
  '52190': [127.3903, 35.4106],   // 전북 남원시
  '46130': [127.6622, 34.7604],   // 전남 여수시
};

/** 실측 스택: 시군구 → epoch 순서대로 쌓이는 층. */
export const STACKS = (() => {
  const by = new Map();
  for (const r of DONE) {
    const code = r.region.includes('남원') ? '52190' : '46130';
    if (!by.has(code)) by.set(code, { code, region: r.region, center: SIGUNGU_CENTER[code], layers: [], total: 0 });
    const s = by.get(code);
    s.layers.push({ id: r.id, title: r.title, date: r.date, count: r.count, unit: r.unit, sensor: r.sensor });
    s.total += r.count;
  }
  for (const s of by.values()) {
    s.layers.sort((a, b) => (a.date < b.date ? -1 : 1));
    let base = 0;
    for (const l of s.layers) { l.base = base; base += l.count; l.top = base; }
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
})();

export const STACK_MAX = Math.max(...STACKS.map((s) => s.total));

/* ── 기존 대시보드 기능 → 원장 행 (시연 데이터, 원형 목업 그대로) ────── */

const QTYPE = { card: '카드 발행 승인', user: '가입 승인', inquiry: '문의' };
export const QUEUE = DASH.queue.map((q, i) => ({
  i,
  type: q.type,
  typeName: QTYPE[q.type],
  title: q.title,
  sub: q.sub,
  status: q.status,
  lnglat: q.pin.lnglat,
}));
export const QUEUE_BY_TYPE = ['card', 'user', 'inquiry'].map((t) => ({
  type: t, name: QTYPE[t], n: QUEUE.filter((q) => q.type === t).length,
}));

export const KPI = DASH.kpis.map((k) => ({ ...k, demo: true }));
export const VISITS = DASH.visits;
export const VISITS_TOTAL = VISITS.reduce((a, v) => a + v.count, 0);
export const STORAGE = DASH.storage;
export const PROJECTS = DASH.projects;
export const BACKBONE = DASH.backbone;

export const SHORT = (s) => s.replace(/\s*실태조사$/, '');
export const COLS = SURVEYS.map((s) => ({ ...s, short: SHORT(s.name) }));
export const COVERAGE = DASH.coverage.map((r) => ({
  ...r,
  done: r.done.filter((id) => COLS.some((c) => c.id === id)),
  measured: r.code === '52190',           // 남원만 실측 결과가 붙어 있다
}));
export const CELLS = COVERAGE.length * COLS.length;
export const DONE_CELLS = COVERAGE.reduce((a, r) => a + r.done.length, 0);

/* ── 레지스터 정의 ──────────────────────────────────────────────────── */
export const REGISTERS = [
  { id: 'infer', idx: '01', name: '추론 현황', sub: '분석 실행 · 워크플로우 상태', tally: () => `실행 ${RUNS.length} · 완료 ${DONE.length}` },
  { id: 'train', idx: '02', name: '학습데이터', sub: '데이터 관리 · 라벨 인벤토리', tally: () => `영상 ${IMG.length}세트` },
  { id: 'results', idx: '03', name: '결과 누적', sub: '분석 결과 · XI맵', tally: () => `${nf.format(TOTAL_OBJECTS)}건` },
];
export const REG_IDS = REGISTERS.map((r) => r.id);

export const META = {
  asof: DATA_ASOF,
  sources: 'results.js · models.js · imagery.js · crops.js · assets/tiles',
  plate: 'V-WORLD 위성 정사영상',
};
