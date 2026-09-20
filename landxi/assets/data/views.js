// 요구 화면 — 카드 안에 들어가는 것들을 발주 없이 찍는다 (2026-09-20 발주자 정의)
//
//   "서비스 카드별로 들어가면 기본 구조는 같긴 하겠지만, 안에 **포트홀 통계 · 포트홀 조회
//    이력 시각화 표출** 등 요구사항이 **지자체별로 굉장히 다양**할 건데.
//    이걸 **하나하나 들어서 발주 내기가 부담스럽다.** 이런 걸 내가 하고 싶다는 뜻이다."
//
//   "특히 전남 해양쓰레기 27년 고도화 사업은 **해류 모델링 개발 시각화 · 해저지형도 기반
//    침적쓰레기 예측 지도** 등 굉장히 Geo-AI와 다른 요소들이 있는데,
//    **이것들을 직접 해야만 가성비가 나온다.**"
//
// ── 무엇이 바뀌나 ───────────────────────────────────────────────────────
// 틀린 접근: 요구 하나마다 화면 하나를 새로 만든다 → 요구마다 발주.
// 맞는 접근: 요구를 **선언 한 줄**로 적고, 렌더러가 그린다.
//
//   요구 "포트홀을 등급별로 세어 보여 달라"
//     → { src:'result', by:'class', measure:'count', viz:'bar' }   ← 새 코드 0줄
//
// 그래서 **발주 단위가 화면이 아니라 자료·모델로 내려간다.**
// 27년 해양쓰레기 고도화에서 밖에서 사야 하는 것은 해류 모델과 수심 자료이지 화면이 아니다.
// 화면은 LX 가 직접 찍는다 — 그게 가성비다.
//
// 새 표현이 필요하면 `VIZ` 에 한 줄 + 렌더러 하나를 더한다. 화면 코드는 고치지 않는다(R5).
import { RESULTS } from './results.js';
import { DEPLOYS, cardById } from './cards.js';

/* ══ 1. 원천 · 축 · 값 · 표현 ═══════════════════════════════════════ */

/** 무엇에서 끌어오나. AI 판독 결과만 있는 게 아니다 — 그게 이 파일의 요점이다. */
export const SRC = {
  result: { name: 'AI 판독 결과', what: '탐지 건·면적·분류·신뢰도', has: true },
  run: { name: '분석 실행 이력', what: '언제 무엇을 돌렸나 · 조회 이력', has: true },
  field: { name: '벡터장', what: '방향과 세기를 가진 격자 — 해류·바람', has: false },
  surface: { name: '연속 표면', what: '높이·깊이 격자 — 해저지형·표고', has: false },
  predict: { name: '예측 격자', what: '모델이 계산한 확률·농도 격자', has: false },
  ledger: { name: '행정 대장', what: '기관이 가진 대장·민원·보수 이력', has: false },
};

/** 무엇으로 나누나. 실데이터에 실제로 있는 축만 켠다. */
export const AXIS = {
  class: { name: '종류', from: 'stats.classes' },
  emd: { name: '행정구역', from: 'stats.emd' },
  conf: { name: '신뢰도', from: 'stats.confHist' },
  time: { name: '시점', from: '결과 여러 건의 연도' },
  sensor: { name: '촬영 수단', from: 'result.sensor' },
};

/** 무엇을 재나. */
export const MEASURE = {
  count: { name: '건수', unit: '건' },
  area: { name: '면적', unit: 'ha' },
  ratio: { name: '비중', unit: '%' },
  conf: { name: '평균 신뢰도', unit: '' },
};

/** 어떻게 그리나. 새 종류는 여기 한 줄 + 렌더러 하나. */
export const VIZ = {
  kpi: { name: '큰 숫자', for: '한 값' },
  bar: { name: '가로 막대', for: '분류별 크기 비교' },
  stack: { name: '누적 막대', for: '구성비' },
  line: { name: '꺾은선', for: '시점별 추이' },
  hist: { name: '분포', for: '신뢰도 같은 연속값' },
  table: { name: '표', for: '값을 정확히 읽어야 할 때' },
  map: { name: '지도 레이어', for: '어디에 있나' },
  timeline: { name: '이력 타임라인', for: '언제 무엇이 있었나' },
  // ── 판독 결과가 아닌 것들 — 27년 고도화가 요구하는 표현 ──
  flow: { name: '해류 벡터장', for: '방향·세기를 화살표와 유선으로', ext: true },
  contour: { name: '해저지형 등심선', for: '수심을 등고선과 색면으로', ext: true },
  predict: { name: '예측 확률 지도', for: '침적 확률 격자 + 임계선', ext: true },
  drift: { name: '이동 경로 추적', for: '시간에 따른 표류 궤적', ext: true },
};

/* ══ 2. 요구 유형 카탈로그 — 말로 고르면 선언이 나온다 ═══════════════ */
/** 지자체가 실제로 자주 말하는 것들. 운영자는 여기서 고르고 제목만 바꾼다. */
export const CATALOG = [
  { id: 'c-class', ask: '○○를 종류별로 세어 보여 달라', spec: { src: 'result', by: 'class', measure: 'count', viz: 'bar' } },
  { id: 'c-emd', ask: '읍·면·동별로 몇 건인지', spec: { src: 'result', by: 'emd', measure: 'count', viz: 'bar', top: 10 } },
  { id: 'c-area', ask: '종류별 면적 비중', spec: { src: 'result', by: 'class', measure: 'area', viz: 'stack' } },
  { id: 'c-conf', ask: '신뢰도가 낮은 건이 얼마나 되나', spec: { src: 'result', by: 'conf', measure: 'count', viz: 'hist' } },
  { id: 'c-time', ask: '연도별로 늘었나 줄었나', spec: { src: 'result', by: 'time', measure: 'count', viz: 'line' } },
  { id: 'c-top', ask: '가장 많은 구역 상위 몇 곳', spec: { src: 'result', by: 'emd', measure: 'count', viz: 'table', top: 5 } },
  { id: 'c-hist', ask: '언제 무엇을 돌렸는지 이력', spec: { src: 'run', by: 'time', measure: 'count', viz: 'timeline' } },
  { id: 'c-map', ask: '지도에 뿌려 달라', spec: { src: 'result', by: 'class', measure: 'count', viz: 'map' } },
];

/* ══ 3. 배포본에 얹힌 요구 화면들 ══════════════════════════════════ */
/**
 * 기관이 말한 것을 선언으로 적어 둔 자리. 화면 코드는 하나도 늘지 않는다.
 * `needs` 가 있으면 **그것만 발주한다** — 화면이 아니라 자료를.
 */
export const VIEWS = {
  'dp-nw-road-26': [
    { id: 'v-pothole-class', tab: 'stats', title: '포트홀 종류별 건수',
      src: 'result', by: 'class', measure: 'count', viz: 'bar',
      from: '남원시 건설과 — 등급별로 몇 개인지 한눈에' },
    { id: 'v-pothole-emd', tab: 'stats', title: '읍·면·동별 포트홀',
      src: 'result', by: 'emd', measure: 'count', viz: 'bar', top: 10,
      from: '남원시 건설과 — 어느 동네가 심한지' },
    { id: 'v-pothole-hist', tab: 'result', title: '포트홀 조회 이력',
      src: 'run', by: 'time', measure: 'count', viz: 'timeline',
      from: '남원시 건설과 — 언제 무엇을 조회했는지 남겨 달라' },
    { id: 'v-pothole-conf', tab: 'result', title: '신뢰도 분포',
      src: 'result', by: 'conf', measure: 'count', viz: 'hist',
      from: '남원시 건설과 — 낮은 건은 사람이 다시 본다' },
  ],
  'dp-nw-farm-25': [
    { id: 'v-farm-class', tab: 'stats', title: '경작 · 비경작 필지',
      src: 'result', by: 'class', measure: 'count', viz: 'bar', from: '남원시 농정과' },
    { id: 'v-farm-area', tab: 'stats', title: '이용 구분별 면적 비중',
      src: 'result', by: 'class', measure: 'area', viz: 'stack', from: '남원시 농정과' },
    { id: 'v-farm-emd', tab: 'stats', title: '읍·면·동별 필지',
      src: 'result', by: 'emd', measure: 'count', viz: 'bar', top: 12, from: '남원시 농정과' },
  ],
  'dp-gj-marine-25': [
    { id: 'v-marine-class', tab: 'stats', title: '쓰레기 종류별 건수',
      src: 'result', by: 'class', measure: 'count', viz: 'bar', from: '광주전남특별시 해양항만과' },
    { id: 'v-marine-time', tab: 'stats', title: '연도별 수거 대상 추이',
      src: 'result', by: 'time', measure: 'count', viz: 'line', from: '광주전남특별시 해양항만과' },
  ],

  /* ── 27년 고도화 — Geo-AI 와 다른 요소들 ─────────────────────────
   * 발주자: "해류 모델링 개발 시각화 · 해저지형도 기반 침적쓰레기 예측 지도 등
   *          굉장히 Geo-AI와 다른 요소들이 있는데 이것들을 직접 해야만 가성비가 나온다."
   * 판독 결과가 아니라 **시뮬레이션 산출물**이다. 그래서 src 가 다르고 viz 가 다르다.
   * 밖에서 사는 것은 `needs` 에 적힌 자료·모델뿐이고, 화면은 LX 가 찍는다. */
  'dp-gj-marine-27': [
    { id: 'v-current-flow', tab: 'map', title: '해류 모델 시각화',
      src: 'field', by: 'time', measure: 'count', viz: 'flow',
      from: '27년 고도화 — 표층 해류의 방향과 세기를 시각에 따라',
      needs: ['해류 수치모델 산출(격자 u·v 성분 · 시간축)', '조위·조류 관측 자료'],
      note: '쓰레기가 어디서 와서 어디로 가는지 설명하는 근거가 된다' },
    { id: 'v-bathy', tab: 'map', title: '해저지형 등심선',
      src: 'surface', by: 'class', measure: 'count', viz: 'contour',
      from: '27년 고도화 — 수심을 바탕에 깔아야 침적 예측이 선다',
      needs: ['해저지형도(수심 격자)', '해도 기준면·측량 시점'],
      note: '골과 둔덕이 쓰레기가 가라앉는 자리를 만든다' },
    { id: 'v-deposit', tab: 'map', title: '침적쓰레기 예측 지도',
      src: 'predict', by: 'class', measure: 'ratio', viz: 'predict',
      from: '27년 고도화 — 어디를 먼저 수거할지 확률로',
      needs: ['해류 모델 산출', '해저지형(수심) 격자', '표층 탐지 결과(기존 카드)', '침적 실측 표본(검증용)'],
      note: '표층 판독 + 해류 + 지형을 합쳐 계산한다 — 세 가지가 다 있어야 선다' },
    { id: 'v-drift', tab: 'result', title: '표류 경로 추적',
      src: 'field', by: 'time', measure: 'count', viz: 'drift',
      from: '27년 고도화 — 유입원 추정',
      needs: ['해류 모델 산출', '입자 추적 계산'],
      note: '역방향으로 돌리면 어디서 왔는지가 나온다' },
  ],
};

export const viewsOf = (deployId) => VIEWS[deployId] || [];
export const viewsOfTab = (deployId, tab) => viewsOf(deployId).filter((v) => v.tab === tab);

/* ══ 4. 컴파일 — 선언을 실제 값으로 ════════════════════════════════ */
const num = (v) => (Number.isFinite(v) ? v : 0);

/** 이 배포본이 끌어 쓸 수 있는 실결과. */
export function resultsFor(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return [];
  const card = cardById(d.cardId); if (!card) return [];
  return RESULTS.filter((r) => (card.services || []).includes(r.service));
}

/**
 * 선언 한 줄 → 그릴 수 있는 값.
 * 실데이터가 없으면 **지어내지 않는다** — 무엇이 없어 못 그리는지 돌려준다(콘티 원칙).
 */
export function compileView(deployId, view) {
  const src = SRC[view.src] || SRC.result;
  const base = { view, viz: view.viz, title: view.title, axis: AXIS[view.by]?.name || '', measure: MEASURE[view.measure]?.name || '' };
  const rs = resultsFor(deployId);

  // 판독 결과가 아닌 원천 — 자료가 붙기 전에는 무엇이 필요한지만 말한다
  if (!src.has) {
    return { ...base, rows: [], ready: false,
      gap: `${src.name} 자료가 아직 없다`, needs: view.needs || [], note: view.note || src.what };
  }
  if (!rs.length) {
    return { ...base, rows: [], ready: false,
      gap: '이 서비스의 분석 결과가 아직 없다 — 사업 시작 전이거나 첫 분석 전이다',
      needs: ['정사영상 수급', '첫 분석 실행'], note: view.note || '' };
  }

  let rows = [], unit = MEASURE[view.measure]?.unit || '건';

  if (view.src === 'run') {
    rows = rs.map((r) => ({ k: `${r.year} · ${r.title}`, v: num(r.stats?.count), sub: r.stats?.analyzedAt || '', tag: r.sensor }))
      .sort((a, b) => String(b.sub).localeCompare(String(a.sub)));
    unit = rs[0]?.unit || '건';
  } else if (view.by === 'class') {
    const agg = {};
    rs.forEach((r) => {
      const srcMap = view.measure === 'area' ? r.stats?.classAreaM2 : r.stats?.classes;
      Object.entries(srcMap || {}).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + num(v); });
    });
    rows = Object.entries(agg).map(([k, v]) => ({ k, v: view.measure === 'area' ? +(v / 10000).toFixed(1) : v }));
    unit = view.measure === 'area' ? 'ha' : rs[0]?.unit || '건';
  } else if (view.by === 'emd') {
    const agg = {};
    rs.forEach((r) => Object.entries(r.stats?.emd || {}).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + num(v); }));
    rows = Object.entries(agg).map(([k, v]) => ({ k, v }));
    unit = rs[0]?.unit || '건';
  } else if (view.by === 'conf') {
    const bins = rs[0]?.stats?.confBins || [];
    const hist = rs.reduce((a, r) => (r.stats?.confHist || []).map((v, i) => num(a[i]) + num(v)), []);
    rows = hist.map((v, i) => ({ k: `${(bins[i] ?? 0).toFixed(1)}–${(bins[i + 1] ?? 1).toFixed(1)}`, v }));
  } else if (view.by === 'time') {
    const agg = {};
    rs.forEach((r) => { agg[r.year] = (agg[r.year] || 0) + num(r.stats?.count); });
    rows = Object.entries(agg).map(([k, v]) => ({ k, v })).sort((a, b) => a.k.localeCompare(b.k));
    unit = rs[0]?.unit || '건';
  } else if (view.by === 'sensor') {
    const agg = {};
    rs.forEach((r) => { agg[r.sensor] = (agg[r.sensor] || 0) + num(r.stats?.count); });
    rows = Object.entries(agg).map(([k, v]) => ({ k, v }));
  }

  if (view.by !== 'conf' && view.by !== 'time' && view.src !== 'run') rows.sort((a, b) => b.v - a.v);
  const total = rows.reduce((a, r) => a + r.v, 0);
  if (view.measure === 'ratio' && total) rows = rows.map((r) => ({ ...r, v: +((r.v / total) * 100).toFixed(1) }));
  if (view.top) rows = rows.slice(0, view.top);

  return { ...base, rows, unit, total, ready: rows.length > 0,
    gap: rows.length ? null : '집계할 값이 없다', needs: [], note: view.note || '',
    from: rs.map((r) => r.title).join(' · ') };
}

/* ══ 5. 검증 · 조달 — 발주는 화면이 아니라 자료에만 낸다 ═════════════ */

/** 선언이 말이 되는가. 없는 축·없는 표현을 막는다. */
export function validate(view) {
  const bad = [];
  if (!SRC[view.src]) bad.push(`원천 '${view.src}' 없음`);
  if (!AXIS[view.by]) bad.push(`축 '${view.by}' 없음`);
  if (!MEASURE[view.measure]) bad.push(`값 '${view.measure}' 없음`);
  if (!VIZ[view.viz]) bad.push(`표현 '${view.viz}' 없음`);
  if (!view.title) bad.push('제목 없음');
  return { ok: !bad.length, bad };
}

/**
 * **조달 목록** — 요구 화면을 세우려고 밖에서 사야 하는 것들.
 * 화면은 여기에 없다. 그것이 이 구조의 값어치다.
 */
export function procurement(deployId) {
  const need = new Map();
  viewsOf(deployId).forEach((v) => (v.needs || []).forEach((n) => {
    const cur = need.get(n) || { what: n, forViews: [] };
    cur.forViews.push(v.title); need.set(n, cur);
  }));
  const rows = [...need.values()];
  return { deployId, rows,
    line: rows.length
      ? `발주할 것은 자료·모델 ${rows.length}종 — 화면은 발주 목록에 없다`
      : '밖에서 살 것 없음 — 있는 결과로 다 선다' };
}

/** 전체 요약 — 요구 화면을 몇 개나 이 방식으로 감당하고 있나. */
export function viewsSummary() {
  const all = Object.entries(VIEWS).flatMap(([id, vs]) => vs.map((v) => ({ ...v, deployId: id })));
  const compiled = all.map((v) => ({ v, c: compileView(v.deployId, v) }));
  const ext = all.filter((v) => VIZ[v.viz]?.ext);
  return {
    요구화면: all.length,
    바로_서는것: compiled.filter((x) => x.c.ready).length,
    자료_대기: compiled.filter((x) => !x.c.ready).length,
    판독밖_표현: ext.length,
    표현종류: Object.keys(VIZ).length,
    새로짠_화면코드: 0,
    조달항목: [...new Set(all.flatMap((v) => v.needs || []))].length,
    line: '요구는 선언 한 줄로 는다 — 늘어나는 것은 화면 코드가 아니라 선언이다',
  };
}
