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
import { DASH } from '../../assets/data/dashboard.js';
import { RESULTS } from '../../assets/data/results.js';
import { MODELS } from '../../assets/data/models.js';
import { IMAGERY } from '../../assets/data/imagery.js';
import { CHANGE } from '../../assets/data/change.js';
import { SERVICES } from '../../assets/data/services.js';

export const nf = new Intl.NumberFormat('ko-KR');
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

/* ── 모델 카드 — B9 백본이 거느린 실제 .pt 목록 ───────────────────── */
export const MODEL_LIST = MODELS;
/** 모델 10종이 거느린 클래스의 총수 — 백본 출처 줄에 쓴다(세어서 적는다). */
export const CLASS_COUNT = MODELS.reduce((a, m) => a + (m.classes ? m.classes.length : 0), 0);

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
  confHist: r.stats.confHist || null,
  confMin: r.stats.confMin,
  confMax: r.stats.confMax,
  areaHa: r.stats.areaHa,
  bbox: r.stats.bbox,
  geojson: '../' + r.geojson,
  service: r.service,
  emd: r.stats.emd || null,
}));

export const doneById = (id) => DONE.find((x) => x.id === id);

/* ── 정사영상 카탈로그 11종 — 어디까지가 실제 촬영 범위인지 ──────── */
export const IMG = IMAGERY.map((i) => ({
  ...i,
  gsdCm: i.gsd < 1 ? +(i.gsd * 100).toFixed(2) : null,
  gsdM: i.gsd >= 1 ? i.gsd : null,
  zSpan: `z${i.minzoom}–z${i.maxzoom}`,
}));
/** GSD 표기 — cm 는 소수 둘째, m 는 그대로. */
export const gsdText = (i) => (!i ? '—' : i.gsdCm != null ? `${i.gsdCm} cm/px` : `${i.gsdM} m/px`);
/** 좌표계 — 원본 GPKG 는 EPSG:5186, 웹 배포본은 4326 으로 변환되어 있다. */
export const CRS = 'EPSG:5186 → EPSG:4326';

/* ── 원본 대시보드 기능 → 원장 행 ────────────────────────────────────
   대조표: docs/superpowers/proto/2026-08-26-dashboard-parity.md
   원본 = https://mini531.github.io/namwon-smart-village/landxi7/dashboard.html
   여기서는 **원본에 있는 것만** 옮긴다. 값도 원본 화면의 값 그대로 쓴다. */

/* A. 좌측 내비게이션 레일 — include/header.html 의 aside.app-sidebar 그대로.
   원본 페이지들은 이 콘티 저장소에 없다. 링크를 지어내는 대신 같은 데이터를
   담고 있는 우리 자리로 보낸다(레지스터 전환 `tab` 또는 원장 스크롤 `to`). */
export const NAV = [
  { menu: 'dashboard', name: '대시보드', href: 'dashboard.html', icon: 'dash' },
  { menu: 'media', name: '데이터 관리', href: 'dataset.html', icon: 'data', to: 'b-store' },
  { menu: 'project', name: '프로젝트', href: 'ai-project.html', icon: 'proj', to: 'b-proj' },
  { menu: 'analysis', name: '분석 서비스', href: 'analysis-ai.html', icon: 'run', to: 'b-bb' },
  { menu: 'map', name: '지도 서비스', href: 'ximap.html', icon: 'map', to: 'b-proj' },
];
export const NAV_FOOT = [
  { menu: 'support', name: '서비스 지원', href: 'notice.html', icon: 'help', to: 'b-notice' },
  { menu: 'publish-admin', name: '카드 발행 관리', href: 'admin-publish.html', icon: 'stack', to: 'b-approve' },
  { menu: 'admin', name: '서비스 관리', href: 'admin-notice.html', icon: 'gear', to: 'ad-rows' },
];
/** MY 플라이아웃 — 원본과 항목·동작이 같다(로그아웃은 lx_logged_in 삭제 후 home). */
export const NAV_MY = [
  { name: '마이 페이지', href: '../mypage.html' },
  { name: '로그아웃', action: 'logout' },
];

/* B3. 공지 스트립 — 원본은 SP_NOTICES 를 고정 우선·날짜 역순으로 정렬해 첫 건을 쓴다.
   그 첫 건이 dashboard.js 의 notice 와 같다(id 8, 2026-04-15, urgent). */
export const NOTICE = { ...DASH.notice, id: 8, more: '../../notice.html' };

/* B13. 카드 발행 승인 대기 — 원본 CARD_APPROVALS 2건. 요청자·요청시각까지 원본 값.
   행 클릭은 원본의 `admin-publish.html?open=<id>` 자리다(우리는 지도 핀으로 간다). */
// 카드 ↔ 지역 연결은 원본에 없다 — A5 과제명에서 되짚은 **연결 추정**이며 화면이 그렇게 말한다.
// sgg 는 그 emd 가 속한 시군구다 — 결과 폴리곤에 그 emd 가 없어 범위를 그릴 수 없고(D.1),
// 카드 ↔ 지역 연결 자체가 우리가 되짚은 주장이므로 화면에 `추정` 으로 표기한다.
const APPROVAL_META = {
  '도로안전 정사영상 v2.1': { id: 'pa-1', at: '2026.06.10 14:30', sgg: '남원시', emd: '도통동' },
  '농지 활용 분석 v2.0': { id: 'pa-6', at: '2026.05.15 08:50', sgg: '남원시', emd: '시 중앙권' },
};
export const APPROVALS = DASH.queue
  .filter((q) => APPROVAL_META[q.title])
  .map((q, i) => ({ i, title: q.title, sub: q.sub, ...APPROVAL_META[q.title], lnglat: q.pin.lnglat }));

/* B14. 사용자·콘텐츠 관리 타일 4 — 원본 support-grid 그대로. */
// `ref` = Outage Center 규칙(§12.1 #10): 같은 수치를 두 번 말하지 않는다.
// 사용자·문의 수치는 KPI 띠에 이미 있으므로 여기서는 어디에 있는지만 가리킨다.
export const ADMIN_TILES = [
  { name: '사용자 관리', short: '사용자 관리', desc: '전체 21명 · 가입 대기 1', ref: '수치는 KPI ① · ④에', href: 'admin-users.html' },
  { name: '공지사항 관리', short: '공지사항 관리', desc: '전체 12건 · 긴급 2', ref: '전체 12건 · 긴급 2', href: 'admin-notice.html' },
  { name: '문의 관리', short: '문의 관리', desc: '미답변 6 · 전체 12', ref: '수치는 KPI ⑤에', href: 'admin-inquiry.html' },
  { name: '자주 묻는 질문 관리', short: '자주 묻는 질문', desc: '전체 15건', ref: '전체 15건', href: 'admin-faq.html' },
];

/* B4–B8. KPI 5 — 원본 화면의 값·부제·링크를 그대로 쓴다(우리 목업값으로 갈아치우지 않는다). */
export const KPI = [
  { label: '전체 사용자', value: 21, unit: '명', sub: '정상 19 · 가입 승인 대기 1', href: 'admin-users.html' },
  { label: '발행 분석 카드', value: 8, unit: '건', sub: '공개 7 · 비공개 1', href: 'ai-card.html' },
  { label: '카드 발행 승인 대기', value: APPROVALS.length, unit: '건', sub: '검토 필요', href: 'admin-publish.html?status=대기', to: 'b-approve' },
  { label: '가입 승인 대기', value: 1, unit: '건', sub: '승인 필요', href: 'admin-users.html' },
  { label: '미답변 문의', value: 6, unit: '건', sub: '전체 12 · 답변 필요', href: 'admin-inquiry.html' },
];
/* B10 · B12 — 원본 대시보드 ECharts 시드를 그대로 쓴다(우리 목업값으로 갈아치우지 않는다).
   원본 주석이 "사용량=데모"라고 밝힌 값이므로 화면에는 [추정] 꼬리표를 단다. */
export const PROJECTS = [
  { name: '도로안전 정사영상', gb: 412 },
  { name: '농지 활용 분석', gb: 318 },
  { name: '비닐하우스 탐지', gb: 256 },
  { name: '사료작물(생육기) 탐지', gb: 198 },
  { name: '도로안전 카메라', gb: 142 },
];
export const STORAGE = {
  total: 184,
  used: 44.5,
  parts: [
    { label: '정사영상', tb: 18.2 },
    { label: '공간데이터', tb: 9.6 },
    { label: '학습데이터', tb: 7.4 },
    { label: 'AI 분석', tb: 5.1 },
    { label: '행정정보', tb: 2.8 },
    { label: '기타', tb: 1.4 },
  ],
};

export const VISITS = DASH.visits;
export const VISITS_TOTAL = VISITS.reduce((a, v) => a + v.count, 0);
export const BACKBONE = DASH.backbone;


/* ── B9 `연결된 분석 과제 14개` 의 지도 표현 ─────────────────────────
   원본 A5 analysis-ai.html 의 시드 10건(page-analysis-{running,done}.js)을 그대로 옮긴다.
   값을 지어내지 않는다: id · 상태 · 과제명 · 시각은 원본 그대로이고,
   AOI(읍면동)는 과제명에 적힌 지역을 실제 결과 폴리곤의 `emd` 로 되짚어 만든다.
   원본 B9 는 14개라고 말하지만 실측 목록은 10건이다 → 그 차이를 화면이 자백한다. */
export const JOBS = [
  { id: 'JOB-2026-039', st: 'run', task: '비닐하우스 탐지', name: '2026년 4월 주천면 비닐하우스 현황 조사', emd: ['주천면'], at: '2026.04.09 09:30', step: 3 },
  { id: 'JOB-2026-038', st: 'fail', task: '농지 활용 분석', name: '2026년 3월 아영면 농지 활용 분석', emd: ['아영면'], at: '2026.04.08 14:10', why: 'GPU 자원 부족' },
  { id: 'JOB-2026-035', st: 'wait', task: '사료작물(생산기) 탐지', name: '2026년 3월 금지면 사료작물 생산 현황', emd: ['금지면'], at: '—' },
  { id: 'JOB-2026-044', st: 'done', task: '농지 활용 분석', name: '2026년 4월 시 중앙권 농지 활용 현황 분석', emd: ['도통동'], at: '2026.04.22 10:36' },
  { id: 'JOB-2026-043', st: 'done', task: '비닐하우스 탐지', name: '2026년 4월 운봉읍·인월면 비닐하우스 현황 분석', emd: ['운봉읍', '인월면'], at: '2026.04.20 09:48' },
  { id: 'JOB-2026-042', st: 'done', task: '도로안전 정사영상', name: '2026년 4월 도통동 도로 정기 점검', emd: ['도통동'], at: '2026.04.15 11:22' },
  { id: 'JOB-2026-041', st: 'done', task: '도로안전 카메라', name: '2026년 4월 춘기 차량 순찰 점검', emd: [], at: '2026.04.12 15:05' },
  { id: 'JOB-2026-040', st: 'done', task: '사료작물(생육기) 탐지', name: '2026년 4월 운봉읍 사료작물 생육 현황', emd: ['운봉읍'], at: '2026.04.10 09:15' },
  { id: 'JOB-2026-037', st: 'done', task: '방치 쓰레기 탐지', name: '2026년 3월 사매면 방치 쓰레기 탐지', emd: ['사매면'], at: '2026.04.07 14:08' },
  { id: 'JOB-2026-036', st: 'done', task: '곤포사일리지 탐지', name: '(교육용)곤포사일리지 분석_사매면_10월', emd: ['사매면'], at: '2026.04.05 12:25' },
];
export const JOB_ST = { done: '완료', run: '실행중', wait: '대기', fail: '실패' };
export const JOB_TALLY = ['done', 'run', 'wait', 'fail'].map((k) => ({ k, name: JOB_ST[k], n: JOBS.filter((j) => j.st === k).length }));
/** 원본 B9 는 과제 14개라고 말하지만 실측 목록(A5)은 10건이다 — 그 차를 화면이 자백한다. */
export const JOB_UNMAPPED = Math.max(0, BACKBONE.tasks - JOBS.length);

/** 실자산이 있는 시군구만 채운다. 나머지는 무채 — 자산 없는 곳을 칠하지 않는다. */
export const ASSET_SGG = ['52190', '46130', '50110', '52710'];

/* ── D01 취득 밀도 스캔 스트립의 눈금 ────────────────────────────────
   축 = 남원 농경지 정사영상 4시점(실제 촬영월). 무채 틱 = 취득, 앰버 틱 = 변화 급변.
   변화는 change.js 의 비지도 변화 지수이지 모델 탐지가 아니다 — 표기를 그대로 지킨다. */
export const AOI_EPOCHS = IMG
  .filter((i) => /^namwon_25/.test(i.id))
  .sort((a, b) => (a.captured < b.captured ? -1 : 1));
export const CHANGE_PAIRS = CHANGE.map((c) => ({
  pair: c.pair, label: c.label, method: c.method, to: c.toDate, bounds: c.bounds,
  polygons: '../' + c.polygons,
}));

/* ══════════════════════════════════════════════════════════════════════
   판 12.8 — 0.25° 셀 집계 (NOTES.md §12.8)
   손 값 금지. 셀 등급은 전부 여기서 계산한다:
     ai   = 그 셀과 겹치는 **결과 footprint** 건수
     data = 그 셀과 겹치는 **정사영상 시점(captured)** 수
   footprint 출처 = results.js(stats.bbox) · change.js(bounds) · jeju-illegal.geojson.
   `marine-debris*.geojson`(전남 실태조사)은 넣지 않았다 — 결과 대장(results.js)에
   레코드가 없고, 원판 §12.8 의 셀 목록(남원·여수·제주·국산리·울주)에도 없다.
   ══════════════════════════════════════════════════════════════════════ */

export const CELL = 0.25;
/** 판이 그리는 그리드 범위 — §12.8 "0.25° 셀 GeoJSON(124–131 / 33–39)". */
export const GRID = { w: 124, s: 33, e: 131, n: 39 };
/** 판 카메라 — 원판 캡처 bounds. 572×254(2.2520:1)에 fitBounds 한다. */
export const PLATE_BOUNDS = [119.536, 33.0, 135.964, 38.9];

const r2 = (v) => Math.round(v * 100) / 100;
/** 값이 속한 셀의 남서 모서리. */
export const cellOf = (v) => r2(Math.floor(v / CELL + 1e-9) * CELL);
export const cellKey = (lon, lat) => `${r2(lon).toFixed(2)}|${r2(lat).toFixed(2)}`;

/** bbox 가 실제로 **면적을 나누어 갖는** 셀만 센다.
    상한이 셀 경계에 정확히 닿는 경우(e = 34.75)는 그 셀을 세지 않는다 — 겹침이 0 이다. */
export function cellsOfBBox(b) {
  if (!b || b.length < 4) return [];
  const [w, s, e, n] = b;
  const span = (lo, hi) => {
    const a = Math.floor(lo / CELL + 1e-9);
    let z = Math.ceil(hi / CELL - 1e-9) - 1;
    if (z < a) z = a;
    return [a, z];
  };
  const [x0, x1] = span(w, e);
  const [y0, y1] = span(s, n);
  const out = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([r2(x * CELL), r2(y * CELL)]);
  return out;
}

const geoBBox = (g) => {
  let w = 9e9; let s = 9e9; let e = -9e9; let n = -9e9;
  const eat = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < w) w = c[0];
      if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
    } else for (const k of c) eat(k);
  };
  for (const f of (g && g.features) || []) if (f.geometry) eat(f.geometry.coordinates);
  return w > e ? null : [w, s, e, n];
};

/** 결과 표시명 — 대장의 제목에서 지역·행위어를 덜어낸다(`남원시 농지이용 현황` → `농지이용`). */
const shortTitle = (t) => String(t).replace(/^\S+?[시군도]\s+/, '').replace(/\s*(현황|조사)(?=\(|$)/, '');
/** 서비스가 이 결과 하나만 가리키면 서비스 대장의 집계값을 쓴다(비닐하우스 = 9,664동). */
function serviceValue(id) {
  const s = SERVICES.find((x) => Array.isArray(x.results) && x.results.length === 1 && x.results[0] === id);
  return s ? { value: s.count, unit: s.unit } : null;
}

/** 결과 footprint — 판이 세는 단위. bbox 는 전부 데이터에서 온다. */
export function baseFootprints() {
  const out = RESULTS.map((r) => {
    const sv = serviceValue(r.id);
    return {
      id: r.id,
      name: shortTitle(r.title),
      value: sv ? sv.value : r.stats.count,
      unit: sv ? sv.unit : r.unit,
      // 라벨 연결 줄은 대장의 원값(필지 수)을 쓴다 — 서비스 집계값(동)이 아니다.
      count: r.stats.count,
      countUnit: r.unit,
      bbox: r.stats.bbox,
      region: r.region,
      ledger: true, // 결과 대장(results.js)에 레코드가 있다 = 라벨셋
      note: '',
      tag: '',
    };
  });
  // 변화 지수(비지도) — 학습 모델 탐지가 아니다. 대장이 아니므로 라벨 연결에서 제외한다.
  const cb = CHANGE[0] && CHANGE[0].bounds;
  if (cb) {
    out.push({
      id: 'namwon-change',
      name: '변화지수',
      value: CHANGE.reduce((a, c) => a + c.stats.n, 0),
      unit: '폴리곤',
      bbox: cb,
      region: '전북 남원시',
      ledger: false,
      note: '비지도',
      tag: '',
    });
  }
  return out;
}

/** 제주 불법건축물 — 결과 대장에 없고 GeoJSON 으로만 있다. bbox 는 파일에서 센다.
    발행 카드 8건과의 매핑이 데이터에 없으므로 `추정` 태그를 단다(브리프 (c)). */
export const JEJU_URL = '../../assets/data/geo/jeju-illegal.geojson';
export function jejuFootprint(geo) {
  const bbox = geoBBox(geo);
  if (!bbox) return null;
  return {
    id: 'jeju-illegal',
    name: '불법건축물',
    value: geo.features.length,
    unit: '동',
    bbox,
    region: '제주',
    ledger: false,
    note: '',
    tag: '추정',
  };
}
export async function loadFootprints(get) {
  const out = baseFootprints();
  const g = get || ((u) => fetch(u));
  try {
    const geo = await g(JEJU_URL).then((r) => r.json());
    const f = jejuFootprint(geo);
    if (f) out.push(f);
  } catch { /* 파일 없음 → 제주 셀은 서지 않는다. 지어내지 않는다. */ }
  return out;
}

/** 영상 시점의 센서 — 라벨에 적혀 있으면 그것, 없으면 GSD 로 가른다(10 cm 미만 = 드론). */
export const sensorOfImg = (i) => (/드론/.test(i.label) ? '드론' : /항공/.test(i.label) ? '항공' : i.gsd < 0.1 ? '드론' : '항공');
/** 조사 예정 = 서비스 라인업에서 결과가 아직 0인 항목(services.js count 0). */
export const PLANNED_SERVICES = SERVICES.filter((s) => s.count === 0 && Array.isArray(s.lnglat));

/**
 * 판의 셀 목록. 손 값 0 — bbox ∩ 셀 만으로 만든다.
 * @returns {{lon:number,lat:number,ai:number,data:number,results:object[],imagery:object[],planned:string[]}[]}
 */
export function cellsFor(footprints, imagery, planned) {
  const fps = footprints || baseFootprints();
  const imgs = imagery || IMAGERY;
  const plan = planned || PLANNED_SERVICES;
  const by = new Map();
  const touch = (lon, lat) => {
    const k = cellKey(lon, lat);
    let c = by.get(k);
    if (!c) { c = { lon, lat, ai: 0, data: 0, results: [], imagery: [], planned: [] }; by.set(k, c); }
    return c;
  };
  for (const f of fps) for (const [lon, lat] of cellsOfBBox(f.bbox)) touch(lon, lat).results.push(f);
  for (const i of imgs) for (const [lon, lat] of cellsOfBBox(i.bounds)) touch(lon, lat).imagery.push(i);
  for (const s of plan) touch(cellOf(s.lnglat[0]), cellOf(s.lnglat[1])).planned.push(s.name);
  for (const c of by.values()) {
    c.ai = c.results.length;
    c.data = new Set(c.imagery.map((i) => i.captured)).size;
  }
  return [...by.values()].sort((a, b) => (b.lat - a.lat) || (a.lon - b.lon));
}

/** 등급 — 범례 행과 채움 표현식이 같은 규칙을 쓴다. */
export function gradeOf(cell, mode) {
  if (cell.planned.length) return 'plan';
  if (mode === 'data') return cell.data >= 4 ? 'd3' : cell.data >= 2 ? 'd2' : cell.data === 1 ? 'd1' : 'd0';
  return cell.ai >= 3 ? 'a3' : cell.ai === 2 ? 'a2' : cell.ai === 1 ? 'a1' : 'a0';
}

/** 범례 — 셀 수는 전부 집계값이다. */
export function legendFor(cells, mode) {
  const n = (g) => cells.filter((c) => gradeOf(c, mode) === g).length;
  return mode === 'data'
    ? {
      head: '그리드 0.25° · 흰 진하기 = 영상 시점 수',
      rows: [
        { g: 'd3', name: '영상 4시점 이상', n: n('d3') },
        { g: 'd2', name: '영상 2–3시점', n: n('d2') },
        { g: 'd1', name: '영상 1시점', n: n('d1') },
        { g: 'd0', name: '결과만 · 영상 없음', n: n('d0') },
        { g: 'plan', name: '조사 예정 · 시연', n: n('plan') },
      ],
    }
    : {
      head: '그리드 0.25° · 청록 진하기 = 결과 건수',
      rows: [
        { g: 'a3', name: '결과 3건 이상', n: n('a3') },
        { g: 'a2', name: '결과 2건', n: n('a2') },
        { g: 'a1', name: '결과 1건', n: n('a1') },
        { g: 'a0', name: '학습데이터만 · 결과 없음', n: n('a0') },
        { g: 'plan', name: '조사 예정 · 시연', n: n('plan') },
      ],
    };
}

/* ── 콜아웃 문구 (§12.8) ─────────────────────────────────────────────── */
const deg = (v) => v.toFixed(2);
export const cellBBox = (c) => [c.lon, c.lat, r2(c.lon + CELL), r2(c.lat + CELL)];
export const cellCoords = (c) => `${deg(c.lon)}–${deg(r2(c.lon + CELL))} E · ${deg(c.lat)}–${deg(r2(c.lat + CELL))} N`;
/** 지명은 데이터에 적힌 것만 쓴다 — 영상 라벨의 머리말, 없으면 결과의 region. */
export function placeOf(c) {
  const img = [...c.imagery].sort((a, b) => a.gsd - b.gsd)[0];
  if (img) return String(img.label).split(' ')[0];
  const r = c.results.find((x) => x.region);
  return r ? r.region.split(' ').pop().replace(/[시군]$/, '') : '';
}
/** 시점 목록 — `2025-04 · 06 · 08 · 10`(연이 같으면 월만). */
function epochText(list) {
  let year = '';
  return list.map((s) => {
    const [y, m] = s.split('-');
    if (y === year) return m;
    year = y;
    return s;
  }).join(' · ');
}
/** GSD — 1 m 미만은 cm, 그 이상은 m. */
function gsdRange(vals) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const one = (v) => (v < 1 ? `${+(v * 100).toFixed(2)} cm` : `${v.toFixed(2)} m`);
  if (lo === hi) return `GSD ${one(lo)}`;
  if (hi < 1) return `GSD ${+(lo * 100).toFixed(2)}–${+(hi * 100).toFixed(2)} cm`;
  return `GSD ${one(lo)}–${one(hi)}`;
}

/**
 * 셀 콜아웃. 없는 연결은 쓰지 않는다 — 0 을 지어내지 않는다.
 * @returns {{place:string,coords:string,head:string,headTone:string,lines:object[]}}
 */
export function calloutFor(c, mode) {
  const place = placeOf(c);
  const coords = cellCoords(c);
  if (c.planned.length) {
    return {
      place,
      coords,
      headTone: 'plan',
      head: '조사 예정 · 시연',
      lines: [{ t: c.planned.join(' · ') }, { t: '결과 0건 · 준비 중', tone: 'mute' }],
    };
  }
  if (mode === 'data') {
    const eps = [...new Set(c.imagery.map((i) => i.captured))].sort();
    // 시점마다 그 셀에서 가장 고해상인 취득을 대표로 삼는다.
    const best = eps.map((e) => c.imagery.filter((i) => i.captured === e).sort((a, b) => a.gsd - b.gsd)[0]);
    const lines = [];
    if (eps.length) lines.push({ t: `${epochText(eps)} · ${gsdRange(best.map((i) => i.gsd))}` });
    else lines.push({ t: '정사영상 없음', tone: 'mute' });
    // 라벨 연결 = 이 셀에 서 있는 결과 대장의 라벨셋.
    // 영상 시점 ↔ 결과의 연결은 데이터에 없으므로 시점을 적지 않는다(0 을 지어내지 않는다).
    const lab = c.results.filter((r) => r.ledger);
    if (lab.length) {
      const byUnit = new Map();
      for (const r of lab) byUnit.set(r.countUnit, [...(byUnit.get(r.countUnit) || []), r.count]);
      lines.push({
        t: `라벨 연결 ${[...byUnit].map(([u, v]) => `${v.map((x) => nf.format(x)).join(' + ')}${u}`).join(' · ')}`,
        tone: 'mute',
      });
    }
    const sens = [...new Set(best.map(sensorOfImg))];
    return {
      place,
      coords,
      headTone: 'data',
      head: `학습데이터 <b>${eps.length}시점</b>${sens.length ? ` · ${sens.join(' · ')}` : ''}`,
      lines,
    };
  }
  const led = c.results.filter((r) => r.ledger);
  const rest = c.results.filter((r) => !r.ledger);
  const lines = [];
  const val = (r) => `${r.name} ${nf.format(r.value)}${r.unit}`;
  if (led.length) lines.push({ t: led.map(val).join(' · ') });
  for (const r of rest) lines.push({ t: val(r) + (r.note ? ` <i>· ${r.note}</i>` : ''), tag: r.tag });
  if (!c.results.length) lines.push({ t: `학습데이터 ${c.data}시점 · 결과 없음`, tone: 'mute' });
  return {
    place,
    coords,
    headTone: 'ai',
    head: `AI 분석 결과 <b>${c.ai}건</b>`,
    lines,
  };
}
