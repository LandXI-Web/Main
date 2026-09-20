/* 분석 서비스 — 이 화면의 실행 대장과 세션 저장소.
   카드 · 모듈 · 이식의 정본은 assets/data/cards.js · registry.js 다(성장 규칙 R5 — 화면은 그 둘만 읽는다).
   여기 있는 것은 "분석 실행 / 실행중 / 완료"의 **실행 기록**뿐이다. 실측은 results.js 에서 그대로 오고,
   원본 시드(B5 · B7 원판의 실행 이름)는 `시연` 꼬리표를 달아 구분한다.
   변경(실행 추가 · 이식 요청 · 공유 · 결과 편집)은 sessionStorage — 새로고침하면 시드로 돌아간다. */
import { RESULTS, resultById } from '../assets/data/results.js';
import { serviceById } from '../assets/data/services.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { MODELS } from '../assets/data/models.js';
import { CROPS } from '../assets/data/crops.js';
import { cardsOfService, cardById, modelsOfCard, deploysOfCard } from '../assets/data/cards.js';

export const AS_OF = '2026-06-08';

/* ── 세션 저장소 — 새로고침 = 시드 복귀(콘티) ───────────────────────────── */
const KEY = (n) => `lx-analysis-v1:${n}`;
try { if (performance.getEntriesByType('navigation')[0]?.type === 'reload') ['runs', 'deploys', 'edits', 'shares'].forEach((k) => sessionStorage.removeItem(KEY(k))); } catch { /* 저장소 차단 */ }
function load(name, seed) {
  try { const raw = sessionStorage.getItem(KEY(name)); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v; } } catch { /* 손상 → 시드 */ }
  return structuredClone(seed);
}
function save(name, v) { try { sessionStorage.setItem(KEY(name), JSON.stringify(v)); } catch { /* 저장소 차단 */ } }

/* ── 정사영상 아카이브 — imagery.js 11세트 그대로. 썸네일은 crops.js 의 실크롭. ── */
const CROP_OF = (im) => {
  if (/^namwon_25/.test(im.id)) return (CROPS['namwon-epoch'] || []).find((c) => c.epoch === im.captured);
  if (/^kuksan_/.test(im.id)) return (CROPS['kuksan-change'] || []).find((c) => String(c.epoch).startsWith(im.id.split('_')[1]));
  if (/^jeju_/.test(im.id)) return (CROPS['jeju-illegal'] || [])[im.id === 'jeju_2020' ? 0 : im.id === 'jeju_landcover' ? 2 : 1];
  if (/^namwon_city_/.test(im.id)) return (CROPS['namwon-farmland-2025'] || [])[im.id.endsWith('2504') ? 1 : 6];
  return null;
};
const areaKm2 = (b) => Math.abs((b[2] - b[0]) * 88.8) * Math.abs((b[3] - b[1]) * 111.0);   // 위도 35°의 근사 — 표시용 소수 2자리
export const ARCHIVE = IMAGERY.map((im) => ({
  id: im.id, label: im.label, kind: im.kind, gsd: im.gsd, captured: im.captured, bounds: im.bounds,
  sensor: im.coverage === 'city' ? '항공' : /^jeju_/.test(im.id) ? '항공' : '드론',
  coverage: im.coverage || 'aoi', km2: +areaKm2(im.bounds).toFixed(2),
  thumb: CROP_OF(im)?.file ? '../' + CROP_OF(im).file : null,
  mine: !/^jeju_/.test(im.id), recent: /^namwon_25/.test(im.id),
}));
export const archiveById = (id) => ARCHIVE.find((a) => a.id === id) || null;

/* ── 모델 — models.js 9종. 카드가 묶은 AI 모델(services.js)과는 층이 다르다(카드 = 업무, 모델 = 가중치). ── */
export const MODEL_LIST = MODELS.map((m) => ({ id: m.id, name: m.name, task: m.task, classes: m.classes, sizeMB: m.sizeMB, trainedAt: m.trainedAt, inferred: m.inferred }));
/** 과제(services.js 모델)에 맞는 학습 모델 후보 — 클래스 이름이 겹치는 것 우선, 없으면 전부. */
const MODEL_HINT = {
  greenhouse: ['best-vinylhouse'], farmland: ['model-segformer-land', 'model-landuse-epoch000'],
  pothole: ['best-road', 'best-car'], building: ['best-house', 'model-yolo-illegal-building'],
  change: ['model-landuse-epoch000', 'model-segformer-land'], greenbelt: ['model-yolo-illegal'],
  marine: ['yolo11x-obb', 'yolo11n'],
};
export const modelsForService = (sid) => { const hint = MODEL_HINT[sid]; return hint ? MODEL_LIST.filter((m) => hint.includes(m.id)) : MODEL_LIST; };

/* ── 실행 대장 ───────────────────────────────────────────────────────────
   state: 'wait' 대기 중 · 'run' 처리 중 · 'fail' 처리 실패 · 'done' 완료
   resultId 가 있으면 results.js 의 실측(필지 수 · 면적 · 클래스 · 신뢰도)을 그대로 쓴다. 없으면 `시연`. */
const realRun = (r, i) => ({
  id: r.id, name: r.title, resultId: r.id, serviceId: r.service,
  cardId: cardsOfService(r.service)[0]?.id || null,
  imageryId: r.service === 'marine' ? null : r.sensor === 'drone' ? 'namwon_2506' : 'namwon_city_2510',
  state: 'done', at: r.stats.analyzedAt, mins: null, owner: i % 3 === 2 ? 'shared' : 'mine',
  demo: false, count: r.stats.count, unit: r.unit, region: r.region,
  share: ['lx-admin', r.region.includes('남원') ? 'nw-admin' : 'jn-admin'],
});
const demoRun = (o) => ({ mins: null, owner: 'mine', demo: true, resultId: null, count: null, unit: '건', share: ['lx-admin'], ...o });

export const SEED_RUNS = [
  ...RESULTS.map(realRun),
  demoRun({ id: 'run-road-2604', name: '2026년 4월 도통동 도로 정기 점검', serviceId: 'pothole', cardId: 'card-road', imageryId: 'namwon_city_2510', state: 'done', at: '2026-04-18', region: '전북 남원시' }),
  demoRun({ id: 'run-feed-2604', name: '2026년 4월 운봉읍 사료작물 생육 현황', serviceId: 'feedcrop', cardId: 'card-farm', imageryId: 'namwon_2504', state: 'done', at: '2026-04-16', region: '전북 남원시', owner: 'shared' }),
  demoRun({ id: 'run-trash-2603', name: '2026년 3월 사매면 방치 쓰레기 탐지', serviceId: 'trash', cardId: 'card-living', imageryId: 'namwon_city_2504', state: 'done', at: '2026-04-11', region: '전북 남원시' }),
  demoRun({ id: 'run-green-2604', name: '2026년 4월 주천면 비닐하우스 현황 조사', serviceId: 'greenhouse', cardId: 'card-farm', imageryId: 'namwon_2506', state: 'run', at: '2026-04-09', region: '전북 남원시', step: 1, pct: 72, doneN: 3, totalN: 5 }),
  demoRun({ id: 'run-farm-2603', name: '2026년 3월 아영면 농지 활용 분석', serviceId: 'farmland', cardId: 'card-farm', imageryId: 'namwon_2508', state: 'fail', at: '2026-04-08', region: '전북 남원시', why: '입력 영상 좌표계 없음 — 데이터 관리에서 좌표계를 지정한 뒤 다시 실행' }),
  demoRun({ id: 'run-silage-2603', name: '2026년 3월 금지면 사료작물 생산 현황', serviceId: 'silage', cardId: 'card-farm', imageryId: 'namwon_2510', state: 'wait', at: '2026-04-03', region: '전북 남원시', step: 0, pct: 0, doneN: 1, totalN: 5 }),
];

let runs = load('runs', SEED_RUNS);
export const allRuns = () => runs;
export const runById = (id) => runs.find((r) => r.id === id) || null;
export const runsByState = (s) => runs.filter((r) => (s === 'done' ? r.state === 'done' : r.state !== 'done'));
export function addRun(run) { runs = [run, ...runs]; save('runs', runs); return run; }
export function patchRun(id, patch) { const r = runById(id); if (r) { Object.assign(r, patch); save('runs', runs); } return r; }
export function dropRun(id) { runs = runs.filter((r) => r.id !== id); save('runs', runs); }

export const RUN_STATE = { wait: '대기 중', run: '처리 중', fail: '처리 실패', done: '완료' };
export const RUN_STEPS = ['전처리', '추론', '후처리', '벡터화', '저장'];

/* ── 이식 배포본 — 마법사가 더한 줄. 정본 DEPLOYS(cards.js)는 손대지 않는다(R3). ── */
let extraDeploys = load('deploys', []);
export const addedDeploys = () => extraDeploys;
export const addedDeploysOf = (cardId) => extraDeploys.filter((d) => d.cardId === cardId);
export function addDeploy(d) { extraDeploys = [...extraDeploys, d]; save('deploys', extraDeploys); return d; }

/* ── 결과 편집 · 공유 — 저장하면 세션에 남는다 ──────────────────────────── */
let edits = load('edits', []);
export const editsOf = (runId) => edits.find((e) => e.runId === runId) || null;
export function saveEdit(runId, moved, removed) {
  edits = edits.filter((e) => e.runId !== runId).concat([{ runId, moved, removed }]);
  save('edits', edits);
}

/* ── 공유 기관 · 역할 9(원판 B7-Analysis-Share 의 목록 그대로) ──────────── */
export const SHARE_ORGS = [
  { id: 'lx', name: 'LX 한국국토정보공사', roles: [{ id: 'lx-admin', name: 'LX 관리자' }, { id: 'lx-user', name: 'LX 일반 사용자' }] },
  { id: 'nw', name: '남원시청', roles: [{ id: 'nw-admin', name: '남원시청 관리자' }, { id: 'nw-feed', name: '사료작물 분석' }, { id: 'nw-land', name: '농지 활용 분석' }, { id: 'nw-farm', name: '영농 정보 분석' }, { id: 'nw-user', name: '일반사용자' }] },
  { id: 'jn', name: '전라남도', roles: [{ id: 'jn-admin', name: '전라남도 관리자' }, { id: 'jn-user', name: '전라남도 사용자' }] },
];
export const SHARE_N = SHARE_ORGS.reduce((a, o) => a + o.roles.length, 0);
export const roleName = (id) => SHARE_ORGS.flatMap((o) => o.roles).find((r) => r.id === id)?.name || id;

/* ── 카드 썸네일 — 카드가 묶은 모델의 **실제 결과 산출물**이 있을 때만 그림을 건다.
      결과가 없는 카드(준비 중 · 산출물 전)는 점선 무채 — 원판 B7-Analysis-List 의 규칙이다. ── */
/** 배포 지역의 정사영상 크롭 — 결과 산출물이 없는 운영 카드의 대체 그림. 결과라고 말하지 않는다. */
const REGION_CROP = [
  [/국산리/, 'kuksan-change', 0, '국산리 드론 정사영상'],
  [/남원/, 'namwon-epoch', 2, '남원 농경지 정사영상'],
  [/광주전남|여수|전남/, 'yeosu-marine-2025-aerial', 3, '해안 항공영상'],
];
export function cardCrop(card) {
  if (card.status === '준비 중') return null;                 // 준비 중 = 무채 + 점선(원판 B7-Analysis-List)
  for (const m of modelsOfCard(card)) for (const rid of m.results || []) {
    const c = (CROPS[rid] || [])[0];
    if (c) return { src: '../' + c.file, of: resultById(rid)?.title || '', kind: 'result' };
  }
  for (const d of deploysOfCard(card.id)) for (const [re, set, i, label] of REGION_CROP) {
    if (!re.test(d.region)) continue;
    const c = (CROPS[set] || [])[i]; if (c) return { src: '../' + c.file, of: label, kind: 'region' };
  }
  return null;
}
/** 실행 행의 썸네일 — 입력 영상 크롭이 없으면 그 실행이 낸 결과의 실크롭. 둘 다 없으면 null(점선). */
export function runThumb(run) {
  const im = archiveById(run.imageryId);
  if (im?.thumb) return im.thumb;
  const c = run.resultId ? (CROPS[run.resultId] || [])[0] : null;
  return c ? '../' + c.file : null;
}
/** 이 카드의 결과 산출물. 준비 중 카드는 같은 모델을 묶었더라도 **제 결과가 아니다** — 빈 배열. */
export function cardResults(card) {
  if (card.status === '준비 중') return [];
  return modelsOfCard(card).flatMap((m) => (m.results || []).map(resultById)).filter(Boolean);
}
/** 카드 소관 — 묶은 모델(services.js)의 부처. 레지스트리에 카드 소관 필드가 없어 모델에서 올린다. */
export const cardMinistries = (card) => [...new Set(modelsOfCard(card).map((m) => m.ministry))];
/** 카드가 실제로 쓰인 실행 기록. */
export const runsOfCard = (cardId) => runs.filter((r) => r.cardId === cardId);

export { resultById, serviceById, cardById };
