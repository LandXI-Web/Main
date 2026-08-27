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
import { RESULTS } from '../assets/data/results.js';
import { MODELS } from '../assets/data/models.js';
import { IMAGERY } from '../assets/data/imagery.js';
import { CHANGE } from '../assets/data/change.js';

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
  objTotal: r.stats.objTotal || null,
  year: r.year,
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
export const NOTICE = { ...DASH.notice, id: 8, more: '../notice.html' };

/* B13. 카드 발행 승인 대기 — 원본 CARD_APPROVALS 2건. 요청자·요청시각까지 원본 값.
   행 클릭은 원본의 `admin-publish.html?open=<id>` 자리다(우리는 지도 핀으로 간다). */
// 카드 ↔ 지역 연결은 원본에 없다 — A5 과제명에서 되짚은 **연결 추정**이며 화면이 그렇게 말한다.
const APPROVAL_META = {
  '도로안전 정사영상 v2.1': { id: 'pa-1', at: '2026.06.10 14:30', emd: '도통동' },
  '농지 활용 분석 v2.0': { id: 'pa-6', at: '2026.05.15 08:50', emd: '시 중앙권' },
};
export const APPROVALS = DASH.queue
  .filter((q) => APPROVAL_META[q.title])
  .map((q, i) => ({ i, title: q.title, sub: q.sub, ...APPROVAL_META[q.title], lnglat: q.pin.lnglat }));

/* B14. 사용자·콘텐츠 관리 타일 4 — 원본 support-grid 그대로. */
export const ADMIN_TILES = [
  { name: '사용자 관리', short: '사용자 관리', desc: '전체 21명 · 가입 대기 1', href: 'admin-users.html' },
  { name: '공지사항 관리', short: '공지사항 관리', desc: '전체 12건 · 긴급 2', href: 'admin-notice.html' },
  { name: '문의 관리', short: '문의 관리', desc: '미답변 6 · 전체 12', href: 'admin-inquiry.html' },
  { name: '자주 묻는 질문 관리', short: '자주 묻는 질문', desc: '전체 15건', href: 'admin-faq.html' },
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
