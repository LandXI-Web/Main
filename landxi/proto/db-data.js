// 대시보드 리포트 — 데이터 조립층.
// 화면에 나오는 모든 숫자는 리포 안의 실제 데이터 파일에서만 온다.
//   운영 목업: assets/data/dashboard.js   실태조사 7종: assets/data/surveys.js
//   실제 분석 결과 4건: assets/data/results.js   모델 10종/타일 11세트: models.js·imagery.js
// 지어낸 숫자·로렘 금지(취향 프로필 §3-6).
import { DASH } from '../assets/data/dashboard.js';
import { SURVEYS } from '../assets/data/surveys.js';
import { RESULTS } from '../assets/data/results.js';
import { MODELS } from '../assets/data/models.js';
import { IMAGERY } from '../assets/data/imagery.js';

/** 리포트 기준시점. 대기 일수(DASH.queue[].age)가 이 날짜에 대해 계산된 값이다. */
export const NOW = '2026-08-25';
const DAY = 86400000;
// 날짜 산술은 UTC 로만 한다 — 로컬 오프셋이 하루를 밀지 않게.
const d = (s) => new Date(s + 'T00:00:00Z');
const iso = (t) => new Date(t).toISOString().slice(0, 10);
/** age(일) → 접수 일자. 대기 일수를 날짜 축 위에 올리기 위한 역산. */
export const dateFromAge = (age) => iso(d(NOW).getTime() - age * DAY);

export const nf = new Intl.NumberFormat('ko-KR');
export const shortSurvey = (s) => s.name.replace(/\s*실태조사$/, '');

/* ── 처리 대기 큐 ────────────────────────────────────────────────────
   type 은 세 가지뿐이다(card·user·inquiry). 60일 이상은 hot. */
const TYPE = {
  card: { full: '분석 카드', act: '검토', href: 'card-review' },
  user: { full: '가입 승인', act: '승인', href: 'user-approve' },
  inquiry: { full: '문의', act: '답변', href: 'inquiry-reply' },
};
export const HOT_DAYS = 60;

export const QUEUE = DASH.queue.map((q, i) => ({
  i,
  type: q.type,
  typeName: TYPE[q.type].full,
  act: TYPE[q.type].act,
  title: q.title,
  sub: q.sub,
  status: q.status,
  age: q.age,
  date: dateFromAge(q.age),
  lnglat: q.pin.lnglat,
  hot: q.age >= HOT_DAYS,
})).sort((a, b) => b.age - a.age);

/** 유휴 앰비언트는 화면당 하나뿐이다(§5-10) — 가장 오래 기다린 hot 한 줄. */
export const BREATH = QUEUE.find((q) => q.hot) || QUEUE[0];

/* ── KPI 4 ───────────────────────────────────────────────────────────
   dashboard.js 의 5개 중 '가입 승인 대기'는 큐 캡션으로 내리고 4개만 초대형으로 세운다.
   앞 둘은 124px, 뒤 둘은 52px — 굵기가 아니라 크기로 위계를 만든다(Vantor §2.2). */
const kpiBy = (label) => DASH.kpis.find((k) => k.label === label);
export const KPI = [
  { ...kpiBy('전체 사용자'), size: 'lg', tab: null },
  { ...kpiBy('발행 분석 카드'), size: 'lg', tab: 'projects' },
  { ...kpiBy('카드 발행 승인 대기'), size: 'sm', tab: null },
  { ...kpiBy('미답변 문의'), size: 'sm', tab: null },
].map((k, i) => ({ ...k, i }));

/* ── 전국 커버리지 ───────────────────────────────────────────────────
   행 14 시군 × 열 7 실태조사 = 98칸. 실경계는 sigungu.geojson(249개)에서 온다. */
export const COLS = SURVEYS.map((s) => ({ ...s, short: shortSurvey(s) }));
export const COVERAGE = DASH.coverage.map((r) => ({
  ...r,
  done: r.done.filter((id) => COLS.some((c) => c.id === id)),
}));
export const CELLS = COVERAGE.length * COLS.length;          // 98
export const DONE_CELLS = COVERAGE.reduce((a, r) => a + r.done.length, 0);

/* ── 차트 ────────────────────────────────────────────────────────────
   ECharts 를 쓰지 않는다. 축·격자 최소, 데이터 잉크만, 단일 액센트(§4 차트). */
export const VISITS = DASH.visits;
export const VISITS_TOTAL = VISITS.reduce((a, v) => a + v.count, 0);
export const STORAGE = DASH.storage;
export const PROJECTS = DASH.projects;

/* ── 활동 기록 ───────────────────────────────────────────────────────
   데이터 신선도 = 온기(Palantir P13). 모든 줄에 날짜와 행위자가 있다. */
const byResult = (id) => RESULTS.find((r) => r.id === id);
const resultLine = (id, verb) => {
  const r = byResult(id);
  return {
    date: r.stats.analyzedAt,
    who: '시스템',
    text: `${r.title} ${verb} · ${nf.format(r.stats.count)}${r.unit}`,
    meta: `${r.region} · ${r.sensor === 'drone' ? '드론' : '항공'} · ${SURVEYS.find((s) => s.id === r.service)?.service || r.service}`,
    event: true,
    n: r.stats.count,
  };
};

export const LOG = [
  {
    date: DASH.backbone.applied.replace(/\./g, '-'),
    who: '시스템',
    text: `백본 ${DASH.backbone.name} ${DASH.backbone.ver} 적용 · 과제 ${DASH.backbone.tasks}건 재학습`,
    meta: `모델 카드 ${MODELS.length}종`,
    event: true,
  },
  {
    date: DASH.notice.date,
    who: '관리자',
    text: `공지 발행 — "${DASH.notice.title}"`,
    meta: '전체 사용자 공개',
    event: true,
  },
  resultLine('yeosu-marine-2025-aerial', '분석 완료'),
  resultLine('yeosu-marine-2026-drone', '분석 완료'),
  resultLine('namwon-greenhouse-2025', '분석 완료'),
  resultLine('namwon-farmland-2025', '분석 완료'),
  ...QUEUE.map((q) => ({
    date: q.date,
    who: q.type === 'user' ? q.title.split(' · ')[0] : q.sub.split(' · ')[0],
    text:
      q.type === 'card' ? `카드 발행 신청 '${q.title}'`
        : q.type === 'user' ? `계정 신청 — ${q.title.split(' · ')[1] || q.title}`
          : `문의 접수 — ${q.title}`,
    meta: q.sub,
    event: false,
    queue: q.i,
  })),
  {
    date: NOW,
    who: '시스템',
    text: `정사영상 타일 ${IMAGERY.length}세트 · 모델 ${MODELS.length}종 동기화`,
    meta: '03:58 KST',
    event: false,
  },
].sort((a, b) => (a.date < b.date ? 1 : -1));

/* ── 시간 자[ruler] ──────────────────────────────────────────────────
   자동 재생하되 사건에서 스스로 멈춘다(Palantir P4). 축의 양 끝은 실제 데이터가 정한다. */
export const EVENTS = LOG.filter((l) => l.event)
  .map((l) => ({ date: l.date, label: l.text, meta: l.meta }))
  .sort((a, b) => (a.date < b.date ? -1 : 1));

export const T0 = EVENTS[0].date;
export const T1 = NOW;
export const span = d(T1).getTime() - d(T0).getTime();
/** 날짜 → 축 위 0~1. 축 밖은 잘라낸다. */
export const at = (date) => Math.min(1, Math.max(0, (d(date).getTime() - d(T0).getTime()) / span));
export const dateAt = (p) => iso(d(T0).getTime() + p * span);

/* ── 좌측 기둥의 124px 숫자 — 장이 바뀌면 숫자가 바뀐다 ─────────────── */
export const CHAPTERS = [
  {
    id: 'queue', idx: '01', name: '처리 대기', sec: 'sec-queue',
    tally: QUEUE.length,
    stat: String(QUEUE[0].age), label: '최장 대기 일수',
    sub: `처리 대기 ${QUEUE.length}건 · ${HOT_DAYS}일 초과 ${QUEUE.filter((q) => q.hot).length}건 · 오늘 도착 ${QUEUE.filter((q) => q.date === NOW).length}건`,
  },
  {
    id: 'kpi', idx: '02', name: '지표', sec: 'sec-kpi',
    tally: KPI.length,
    stat: nf.format(VISITS_TOTAL), label: '7일 누적 방문',
    sub: `최고 ${VISITS.reduce((a, v) => (v.count > a.count ? v : a)).day}요일 ${nf.format(Math.max(...VISITS.map((v) => v.count)))} · 스토리지 ${STORAGE.used}/${STORAGE.total} TB`,
  },
  {
    id: 'cov', idx: '03', name: '전국 커버리지', sec: 'sec-cov',
    tally: COVERAGE.length,
    stat: String(DONE_CELLS), label: 'AI 대체 완료 칸',
    sub: `${CELLS}칸 중 · 시군 ${COVERAGE.length} × 실태조사 ${COLS.length} · 전국 시군구 249`,
  },
  {
    id: 'log', idx: '04', name: '활동 기록', sec: 'sec-log',
    tally: LOG.length,
    stat: String(LOG.length), label: '기록된 활동',
    sub: `${T0} 이후 · 마지막 갱신 ${NOW} 03:58 KST`,
  },
];

export const META = {
  tiles: IMAGERY.length,
  models: MODELS.length,
  updated: '03:58',
  now: NOW,
  admin: '김현우',
  detections: RESULTS.reduce((a, r) => a + r.stats.count, 0),
};
