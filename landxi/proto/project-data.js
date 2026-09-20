/* 프로젝트 = LX 의 AI 모델 개발 작업실 — 시드 + 세션 저장.
   원판  design-canvas/v2/renders/B5-Project*.png · B7-Project*.png · B7-Projects-*.png · B7-State-*.png
   기록  design-canvas/v2/notes/B7-project-states.md · 역할 docs/superpowers/specs/2026-09-20-platform-roles.md
   역할  LX = AI 모델 개발 · 학습 · 분석 실행 · 분석 결과 수정/삭제. 끝에 `카드 발행 요청` 으로 나간다.

   수치는 실측만 — models.js(모델 10) · results.js(실 결과 2벌) · imagery.js(도엽 11) · crops.js(크롭 44) ·
   services.js · cards.js(카드 9 · 배포본 6). 원본 시드는 `시연`, 우리가 이은 값은 `추정`.
   사람 이름을 지어내지 않는다 — 구성원은 `내 계정`(본인) + `편집자 A · B`(시연). (감사 A12 안)
   변경(만들기 · 수정 · 삭제 · 파일 추가 · 데이터셋 · 학습 · 분석 결과 편집)은 메모리 + sessionStorage —
   새로 고치면 시드로 돌아간다. */
import { MODELS } from '../assets/data/models.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { RESULTS } from '../assets/data/results.js';
import { CROPS } from '../assets/data/crops.js';
import { serviceById } from '../assets/data/services.js';
import { cardsOfService, CARDS } from '../assets/data/cards.js';

export const CROP = '../assets/proto/crops/';
export const GEO = '../assets/data/geo/results/';
const model = (id) => MODELS.find((m) => m.id === id) || null;
const img = (id) => IMAGERY.find((i) => i.id === id) || null;
export const resultOf = (id) => RESULTS.find((r) => r.id === id) || null;

/* 크롭 풀 — 결과 오버레이가 그려진 크롭(file)과 무오버레이 원본(clean). 화면이 필요한 만큼 돌려 쓴다. */
const pool = (key, clean = false) => (CROPS[key] || []).map((c) => CROP + (clean && c.clean ? c.clean : c.file).replace('assets/proto/crops/', ''));
export const CLEAN = { gh: pool('namwon-greenhouse-2025', true), fl: pool('namwon-farmland-2025', true), je: pool('jeju-illegal', true), ks: pool('kuksan-change'), ne: pool('namwon-epoch'), ma: pool('yeosu-marine-2025-aerial', true) };
export const MARK = { gh: pool('namwon-greenhouse-2025'), fl: pool('namwon-farmland-2025'), je: pool('jeju-illegal') };
const ring = (a, i) => a[((i % a.length) + a.length) % a.length];

/* ── 1. 파일(아카이브) ─────────────────────────────────────────────────────
   데이터 관리 아카이브 = imagery.js 도엽 11 + 원본 목록에 있던 공간정보(shp) 1 · 이미지셋 1(`시연`). */
const KIND = { ortho: '정사영상', landcover: '공간정보', imageset: '이미지셋' };
const cm = (g) => (g >= 1 ? `${g} m` : `${(g * 100).toFixed(2)} cm`);
export const ARCHIVE = [
  ...IMAGERY.map((i, n) => ({
    id: i.id, name: i.label.replace(' · ', ' '), kind: KIND[i.kind] || '정사영상', captured: i.captured, gsd: i.gsd, gsdLabel: cm(i.gsd),
    bounds: i.bounds, tiles: i.tiles, thumb: ring([...CLEAN.gh, ...CLEAN.fl, ...CLEAN.je, ...CLEAN.ks], n),
    sizeGB: [55.4, 51.0, 48.2, 44.6, 12.8, 11.9, 30.4, 8.2, 26.7, 62.1, 58.3][n] ?? 20, demo: true,
  })),
  { id: 'shp-roadfault-2604', name: '남원 도로파손 라벨 셰입 2026-04', kind: '공간정보', captured: '2026-04', gsd: null, gsdLabel: '—', thumb: null, sizeGB: 0.047, demo: true },
  { id: 'set-patrol-2604', name: '순찰차량 도로영상 2026-04', kind: '이미지셋', captured: '2026-04', gsd: null, gsdLabel: '4,820장', thumb: ring(CLEAN.fl, 5), sizeGB: 18.7, demo: true },
];
export const archiveById = (id) => ARCHIVE.find((a) => a.id === id) || null;

/* ── 2. 프로젝트 8 ─────────────────────────────────────────────────────────
   models.js 실측 10 중 범용 사전학습 2(yolo11n · yolo11x-obb)를 뺀 8 = 개발 과제.
   service = 이 모델이 어느 분석 서비스로 나갔는가(services.js). 이은 값은 inferred → `추정`.
   card 역추적은 service 와 cards.js 의 projectId 두 갈래로 찾는다(R5 — 카드를 더해도 화면 코드는 그대로). */
const SEED = [
  { id: 'pj-greenhouse', mid: 'best-vinylhouse', service: 'greenhouse', result: 'namwon-greenhouse-2025', crop: 'gh',
    files: ['namwon_2504', 'namwon_2506', 'namwon_2508', 'namwon_2510', 'namwon_city_2504', 'namwon_city_2510', 'kuksan_a68', 'kuksan_a71', 'jeju_2022', 'jeju_2020'],
    created: '2025-06-12 14:30', reco: '≤ 0.02 m/px', full: true },
  { id: 'pj-road', mid: 'best-road', service: null, result: null, crop: 'fl',
    files: ['namwon_city_2504', 'namwon_city_2510', 'kuksan_a68', 'kuksan_a71'], created: '2025-08-04 10:05', reco: '≤ 0.06 m/px' },
  { id: 'pj-car', mid: 'best-car', service: null, result: null, crop: 'je',
    files: ['namwon_city_2510', 'jeju_2022'], created: '2025-07-18 09:40', reco: '≤ 0.10 m/px' },
  { id: 'pj-change', mid: 'model-segformer-land', service: null, result: null, crop: 'ks',
    files: ['jeju_2022', 'jeju_landcover', 'kuksan_a68', 'kuksan_a71'], created: '2023-12-11 16:20', reco: '≤ 0.12 m/px' },
  { id: 'pj-building', mid: 'best-house', service: 'building', inferred: true, result: null, crop: 'ks',
    files: ['kuksan_a68', 'kuksan_a71', 'namwon_city_2510'], created: '2025-07-22 11:15', reco: '≤ 0.06 m/px' },
  { id: 'pj-greenbelt', mid: 'model-yolo-illegal', service: 'greenbelt', result: null, crop: 'je',
    files: ['jeju_2020', 'jeju_2022'], created: '2023-12-04 13:50', reco: '≤ 0.12 m/px' },
  { id: 'pj-illegal-building', mid: 'model-yolo-illegal-building', service: 'farmland', inferred: true, result: null, crop: 'je',
    files: ['jeju_2020', 'jeju_2022', 'jeju_landcover'], created: '2023-12-04 14:10', reco: '≤ 0.12 m/px' },
  { id: 'pj-landuse', mid: 'model-landuse-epoch000', service: 'farmland', result: 'namwon-farmland-2025', crop: 'fl',
    files: ['namwon_2504', 'namwon_2506', 'namwon_city_2504', 'namwon_city_2510', 'kuksan_a68', 'jeju_2022', 'jeju_2020', 'jeju_landcover'],
    created: '2023-12-04 15:30', reco: '≤ 0.12 m/px', half: true },
];

export const TASK = { detect: '객체 탐지', segment: '세그멘테이션', obb: '회전 객체 탐지' };
export const DET = { detect: 'Object Detection', segment: 'Segmentation' };

function hydrate(s, n) {
  const m = model(s.mid), r = s.result ? resultOf(s.result) : null, sv = s.service ? serviceById(s.service) : null;
  const classes = r ? Object.entries(r.stats.classes).map(([k, v]) => ({ name: k, n: v })) : m.classes.map((c) => ({ name: c, n: null }));
  const marked = MARK[s.crop] || MARK.gh, clean = CLEAN[s.crop] || CLEAN.gh;
  return {
    id: s.id, name: m.name, model: m, task: m.task, taskLabel: TASK[m.task] || m.task, detLabel: DET[m.task] || 'Object Detection',
    sizeMB: m.sizeMB, file: m.file, trainedAt: m.trainedAt, inferredModel: m.inferred,
    service: s.service, serviceName: sv ? sv.name : null, serviceInferred: !!s.inferred,
    resultId: s.result, result: r, classes, reco: s.reco, created: s.created,
    dataType: '정사영상 (ortho)', hero: ring(marked, 2), heroClean: ring(clean, 2),
    thumb: ring(marked, n), thumbs: marked.length ? marked : clean,
    files: s.files.map((f) => archiveById(f)).filter(Boolean), full: !!s.full, half: !!s.half,
  };
}
const BASE = SEED.map(hydrate);
export const ALL = () => [...added().map((a) => a.p), ...BASE];
export const byId = (id) => ALL().find((p) => p.id === id) || null;

/* ── 3. 구성원 — 지어낸 이름 0. 소유자 = 내 계정(본인) · 편집자는 A · B(`시연`) ── */
export function membersOf(pid) {
  const p = byId(pid); if (!p) return [];
  const me = { key: 'me', name: '내 계정', initial: 'A', role: '소유자', self: true, labels: null, last: null };
  if (!p.full) return [me, ...store().invited(pid)];
  return [me,
    { key: 'ed-a', name: '편집자 A', initial: 'A', role: '편집자', demo: true, labels: 1469, last: '2026-06-06' },
    { key: 'ed-b', name: '편집자 B', initial: 'B', role: '편집자', demo: true, labels: 205, last: '2026-06-06' },
    ...store().invited(pid)];
}

/* ── 4. 라벨링 데이터 ──────────────────────────────────────────────────────
   합계 2,002 = 240 + 1,674 + 88 (B7-Project-Dataset-Create · Dataset-Detail 의 값).
   1,674 만 실측(results.js namwon-greenhouse-2025) — 240 · 88 은 원본 pid 6 시드 `시연`. */
const LABEL_SEED = {
  'pj-greenhouse': [
    { file: 'namwon_2506', labels: 1674, last: '2026-06-06', state: '라벨링됨', real: true },
    { file: 'namwon_2504', labels: 240, last: '2026-05-18', state: '마감', demo: true },
    { file: 'namwon_2508', labels: 88, last: '2026-06-02', state: '라벨링됨', demo: true },
  ],
  'pj-landuse': [
    { file: 'namwon_city_2504', labels: 2098, last: '2026-06-08', state: '라벨링됨', real: true },
  ],
};
export function labelingOf(pid) {
  const p = byId(pid); if (!p) return [];
  return (LABEL_SEED[pid] || []).map((l) => ({ ...l, img: archiveById(l.file), cls: p.classes }));
}
export const labelTotal = (pid) => labelingOf(pid).reduce((a, l) => a + l.labels, 0);

/* 라벨 행 — 실 GeoJSON 의 클래스 분포를 그대로 편 목록(첫 15행 + 총계). 도형은 실 결과에서 온다. */
export function labelRows(pid, fileId) {
  const p = byId(pid), l = labelingOf(pid).find((x) => x.file === fileId); if (!p || !l) return { rows: [], total: 0 };
  const shape = ['사각형', '사각형', '폴리곤'];
  const rows = []; let i = 0;
  for (const c of p.classes) {
    const n = c.n != null ? c.n : Math.round(l.labels / p.classes.length);
    for (let k = 0; k < Math.min(n, 12); k++) rows.push({ i: ++i, cls: c.name, shape: ring(shape, i) });
  }
  return { rows: rows.slice(0, 15), total: l.labels };
}

/* ── 5. 데이터셋 ── */
const DATASET_SEED = {
  'pj-greenhouse': [
    { id: 'ds-gh-1', name: '비닐하우스 단동 라벨셋', ver: 'v1.0', created: '2026-06-06', labels: 1469, cls: '비닐하우스_단동', items: ['namwon_2506'], gsd: 1.69, tile: 1024, overlap: 20, inferred: true },
    { id: 'ds-gh-2', name: '비닐하우스 다동 라벨셋', ver: 'v1.0', created: '2026-06-06', labels: 205, cls: '비닐하우스_다동', items: ['namwon_2506'], gsd: 1.69, tile: 1024, overlap: 20, inferred: true },
  ],
};
export const datasetsOf = (pid) => [...store().datasets(pid), ...(DATASET_SEED[pid] || [])];

/* 데이터셋 설정 자동 제안 — 선택 영상 GSD 의 중앙값을 기준 해상도로. 타일 1024 px · 겹침 20 %. */
export function suggest(fileIds) {
  const gs = fileIds.map((f) => archiveById(f)).filter((a) => a && a.gsd).map((a) => a.gsd * 100).sort((a, b) => a - b);
  if (!gs.length) return null;
  const mid = gs.length % 2 ? gs[(gs.length - 1) / 2] : (gs[gs.length / 2 - 1] + gs[gs.length / 2]) / 2;
  return { gsd: +mid.toFixed(2), tile: 1024, overlap: 20, list: gs.map((g) => +g.toFixed(2)), min: gs[0], max: gs[gs.length - 1] };
}

/* ── 6. 학습 ──────────────────────────────────────────────────────────────
   원본 pid 6 시드를 옮긴 `시연`. 곡선 형태는 견본(notes ⑥) — loss/precision 은 식에서 그린다. */
const TRAIN_SEED = {
  'pj-greenhouse': [
    { id: 'tr-6', name: '비닐하우스 v2.1', state: '완료', epoch: 100, total: 100, labels: 3842, iou: 0.82, f1: 0.87, at: '2026-05-18 07:40', took: '1시간 35분',
      base: 'XI-VFM v2.1', dataset: '남원 농경지 2025.04 · 06 · 08', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25',
      classF1: [['전체', 0.87], ['비닐하우스_단동', 0.89], ['비닐하우스_다동', 0.74]], cm: [[1318, 41], [29, 176]], prev: 0.83 },
    { id: 'tr-5', name: '비닐하우스 v2.0', state: '진행 중', epoch: 58, total: 100, labels: 2800, iou: null, f1: null, at: '2026-05-10 14:30', base: 'XI-VFM v2.1', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25' },
    { id: 'tr-4', name: '학습 #4', state: '진행 중', epoch: 12, total: 100, labels: 4200, iou: null, f1: null, at: '2026-06-11 21:45', base: 'XI-VFM v2.1', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25', loss: 0.64, prec: 0.52, took: '11분' },
    { id: 'tr-3', name: '학습 #5', state: '대기', epoch: 0, total: 100, labels: 4200, iou: null, f1: null, at: '2026-06-11 22:30', base: 'XI-VFM v2.1', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25' },
    { id: 'tr-1', name: '비닐하우스 v1.0', state: '대기 · 재학습', epoch: 0, total: 100, labels: 1560, iou: 0.71, f1: 0.76, at: '2026-04-15 11:10', base: 'XI-VFM v2.1', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25' },
  ],
  'pj-landuse': [
    { id: 'tr-lu-1', name: '토지이용 v1.0', state: '완료', epoch: 100, total: 100, labels: 2098, iou: null, f1: null, at: '2023-12-04 15:30', took: '—',
      base: 'XI-VFM v1.0', dataset: '남원 전역 2025.04', size: '640 × 640', ratio: '80 : 20', batch: 16, thr: '0.5 · 0.25' },
  ],
};
export const trainsOf = (pid) => [...store().trains(pid), ...(TRAIN_SEED[pid] || [])];
export const lastTrain = (pid) => trainsOf(pid).find((t) => t.state === '완료') || null;
export const TRAIN_STATES = ['대기', '진행 중', '완료', '실패'];
export function trainCounts(pid) {
  const t = trainsOf(pid);
  return { 대기: t.filter((x) => x.state.startsWith('대기')).length, '진행 중': t.filter((x) => x.state === '진행 중').length, 완료: t.filter((x) => x.state === '완료').length, 실패: t.filter((x) => x.state === '실패').length };
}
/* 곡선 — 학습 이력에 실측 곡선이 없다. 형태 견본(`견본`)을 식으로 그린다. epoch → [loss, precision] */
export function curve(total = 100, endLoss = 0.19, endPrec = 0.87) {
  const pts = [];
  // 시작값 → 끝값에 정확히 닿도록 지수 감쇠를 정규화한다(마지막 눈금이 학습 이력의 값과 같아야 한다).
  const decay = (k, t) => (Math.exp(-k * t) - Math.exp(-k)) / (1 - Math.exp(-k));
  for (let e = 0; e <= total; e++) {
    const t = e / total;
    pts.push({ e, loss: +(endLoss + (0.95 - endLoss) * decay(3.4, t)).toFixed(4), prec: +(endPrec - (endPrec - 0.18) * decay(4.2, t)).toFixed(4) });
  }
  return pts;
}

/* ── 7. 분석 실행 ─────────────────────────────────────────────────────────
   완료 건만 실 결과 GeoJSON 을 가진다 — 손 배치 폴리곤 금지. */
const RUN_SEED = {
  'pj-greenhouse': [
    { id: 'an-1', name: '비닐하우스 탐지 #1', file: 'namwon_2506', state: '완료', step: 5, of: 5, at: '2026-06-06 13:42', took: '82분', result: 'namwon-greenhouse-2025', model: '비닐하우스 v2.1' },
    { id: 'an-3', name: '비닐하우스 탐지 #3', file: 'namwon_2504', state: '분석중', step: 3, of: 5, at: '2026-06-08 09:15', model: '비닐하우스 v2.1' },
    { id: 'an-4', name: '비닐하우스 탐지 #4', file: 'namwon_2510', state: '대기', step: 1, of: 5, at: '2026-06-08 09:20', model: '비닐하우스 v2.1' },
  ],
  'pj-landuse': [
    { id: 'an-lu-1', name: '남원시 농지이용 현황', file: 'namwon_city_2504', state: '완료', step: 5, of: 5, at: '2026-06-08 10:05', took: '—', result: 'namwon-farmland-2025', model: '토지이용 v1.0' },
  ],
};
export const RUN_STEPS = ['대기', '전처리', '분석', '후처리', '완료'];
export const runsOf = (pid) => [...store().runs(pid), ...(RUN_SEED[pid] || [])];
export const runById = (pid, id) => runsOf(pid).find((r) => r.id === id) || null;

/* 필지 행정정보 — 원본 admin-info-data.js FL_ROWS 5행(`시연`). 면적만 편집 대상. */
export const PARCELS = [
  { i: 1, sido: '전북', sgg: '남원시', emd: '동충동', bon: 222, bu: 3, cls: '경작', area: 1820 },
  { i: 2, sido: '전북', sgg: '남원시', emd: '동충동', bon: 356, bu: null, cls: '경작, 비경작', area: 2460 },
  { i: 3, sido: '전북', sgg: '남원시', emd: '동충동', bon: 387, bu: 6, cls: '경작', area: 980 },
  { i: 4, sido: '전북', sgg: '남원시', emd: '동충동', bon: 419, bu: 5, cls: '비경작', area: 1560 },
  { i: 5, sido: '전북', sgg: '남원시', emd: '동충동', bon: 426, bu: 8, cls: '경작', area: 2110 },
  { i: 6, sido: '전북', sgg: '남원시', emd: '금지면', bon: 512, bu: 1, cls: '경작', area: 3040 },
  { i: 7, sido: '전북', sgg: '남원시', emd: '금지면', bon: 514, bu: null, cls: '비경작', area: 1180 },
  { i: 8, sido: '전북', sgg: '남원시', emd: '주생면', bon: 88, bu: 2, cls: '경작', area: 2270 },
  { i: 9, sido: '전북', sgg: '남원시', emd: '주생면', bon: 91, bu: 4, cls: '경작', area: 1640 },
  { i: 10, sido: '전북', sgg: '남원시', emd: '주생면', bon: 103, bu: null, cls: '비경작', area: 2890 },
];

/* 결과 판이 서는 자리 — 실 필지가 몰린 곳(publish-data.js REAL 과 같은 값) */
export const VIEW = {
  'namwon-greenhouse-2025': { center: [127.321168, 35.37436], km: 0.25, place: '주생면',
    classes: [{ key: '비닐하우스_단동', label: '비닐하우스(단동)', dash: false }, { key: '비닐하우스_다동', label: '비닐하우스(다동)', dash: true }] },
  'namwon-farmland-2025': { center: [127.301575, 35.353139], km: 0.25, place: '금지면',
    classes: [{ key: '경작지', label: '경작지', dash: false }, { key: '비경작지', label: '비경작지', dash: true }] },
};
export const geoUrl = (rid) => GEO + rid + '.geojson';

/* ── 8. 배포 — 모델 등록 + 카드 발행 요청 ── */
const DEPLOY_SEED = {
  'pj-greenhouse': [{ id: 'rq-1', card: '비닐하우스 탐지 v2.1', train: 'tr-6', modelName: 'v2.1', kind: '신규 과제', state: '대기', at: '2026-06-08', demo: true }],
};
export const requestsOf = (pid) => [...store().requests(pid), ...(DEPLOY_SEED[pid] || [])];
export const modelsOf = (pid) => store().models(pid);

/* 카드 역추적 — 이 프로젝트의 모델이 어느 서비스 카드로 갔는가.
   service 로 한 번(cardsOfService), 카드가 적어 둔 projectId 로 한 번. 화면은 이 함수만 읽는다(R5). */
export function cardsOfProject(pid) {
  const p = byId(pid); if (!p) return [];
  const a = p.service ? cardsOfService(p.service) : [];
  const b = CARDS.filter((c) => c.projectId === pid);
  const seen = new Set(); const out = [];
  for (const c of [...b, ...a]) { if (seen.has(c.id)) continue; seen.add(c.id); out.push({ ...c, via: b.includes(c) ? 'project' : 'service' }); }
  return out;
}

/* ── 9. 세션 저장 — 새로 고치면 시드 복귀 ── */
const KEY = 'lx_project_v1';
let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { mem = null; }
  mem ||= { added: [], patch: {}, removed: [], files: {}, datasets: {}, trains: {}, runs: {}, requests: {}, models: {}, invited: {}, edits: {}, upload: {} };
  return mem;
}
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* 저장소 차단 */ } }
function added() {
  return load().added.map((a) => ({ p: { ...hydrate({ ...a, files: a.files || [] }, 0), id: a.id, name: a.name, created: a.created, reco: a.reco, added: true } }));
}
const store = () => ({
  invited: (pid) => (load().invited[pid] || []),
  datasets: (pid) => (load().datasets[pid] || []),
  trains: (pid) => (load().trains[pid] || []),
  runs: (pid) => (load().runs[pid] || []),
  requests: (pid) => (load().requests[pid] || []),
  models: (pid) => (load().models[pid] || []),
});

export function patchOf(pid) { return load().patch[pid] || {}; }
export function patchProject(pid, patch) { const s = load(); s.patch[pid] = { ...(s.patch[pid] || {}), ...patch }; save(); }
export function removeProject(pid) { const s = load(); if (!s.removed.includes(pid)) s.removed.push(pid); s.added = s.added.filter((a) => a.id !== pid); save(); }
export const removed = () => load().removed;
export function addProject(o) {
  const s = load(); const id = `pj-new-${s.added.length + 1}`;
  s.added.unshift({ ...o, id, mid: o.mid || 'best-vinylhouse', crop: o.crop || 'gh', service: null, result: null }); save(); return id;
}
export function addFiles(pid, ids) { const s = load(); s.files[pid] = [...new Set([...(s.files[pid] || []), ...ids])]; save(); }
export const extraFiles = (pid) => (load().files[pid] || []).map((f) => archiveById(f)).filter(Boolean);
export function setUpload(pid, u) { const s = load(); if (u) s.upload[pid] = u; else delete s.upload[pid]; save(); }
export const uploadOf = (pid) => load().upload[pid] || null;
export function addDataset(pid, d) { const s = load(); s.datasets[pid] = [{ ...d, id: `ds-new-${(s.datasets[pid] || []).length + 1}` }, ...(s.datasets[pid] || [])]; save(); }
export function addTrain(pid, t) { const s = load(); s.trains[pid] = [{ ...t, id: `tr-new-${(s.trains[pid] || []).length + 1}` }, ...(s.trains[pid] || [])]; save(); }
export function addRun(pid, r) { const s = load(); s.runs[pid] = [{ ...r, id: `an-new-${(s.runs[pid] || []).length + 1}` }, ...(s.runs[pid] || [])]; save(); }
export function addRequest(pid, r) { const s = load(); s.requests[pid] = [{ ...r, id: `rq-new-${(s.requests[pid] || []).length + 1}` }, ...(s.requests[pid] || [])]; save(); }
export function addModel(pid, m) { const s = load(); s.models[pid] = [{ ...m, id: `md-${(s.models[pid] || []).length + 1}` }, ...(s.models[pid] || [])]; save(); }
export function dropModel(pid, id) { const s = load(); s.models[pid] = (s.models[pid] || []).filter((m) => m.id !== id); save(); }
export function invite(pid, m) { const s = load(); s.invited[pid] = [...(s.invited[pid] || []), m]; save(); }

/* 분석 결과 편집 — LX 권한. 이동 · 삭제 · 면적 수정은 저장 전까지 여기에 쌓인다. */
export const editsOf = (pid, rid) => load().edits[`${pid}:${rid}`] || { moved: [], dropped: [], area: {} };
export function setEdits(pid, rid, e) { const s = load(); s.edits[`${pid}:${rid}`] = e; save(); }
export function clearEdits(pid, rid) { const s = load(); delete s.edits[`${pid}:${rid}`]; save(); }

/* ── 10. 목록 집계 ── */
export function list() {
  const gone = removed();
  return ALL().filter((p) => !gone.includes(p.id)).map((p) => {
    const pt = patchOf(p.id);
    return { ...p, ...pt, files: [...p.files, ...extraFiles(p.id)],
      nLabel: labelingOf(p.id).length, nTrain: trainsOf(p.id).length, nMember: membersOf(p.id).length,
      nDataset: datasetsOf(p.id).length, nDeploy: requestsOf(p.id).length + modelsOf(p.id).length, nRun: runsOf(p.id).length };
  });
}
export function detail(pid) {
  const p = byId(pid); if (!p || removed().includes(pid)) return null;
  return list().find((x) => x.id === pid) || null;
}
export const nf = new Intl.NumberFormat('ko-KR');
