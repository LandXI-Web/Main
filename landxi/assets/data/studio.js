// 화면 스튜디오 — 서비스 카드별 화면을 LX 가 찍어낸다 (2026-09-20 발주자 정의)
//
//   "지자체 **서비스 카드별로 디자인을 LX에서 클로드 코드로 만들어냈으면** 좋겠다.
//    그래야만 적극적으로 지자체에서 **요구사항을 수시로 피드백 보완** 할 수 있거든."
//
// 화면을 용역으로 만들면 한 번 납품하고 끝난다. 기관이 "여기 이 칸을 바꿔 달라" 해도
// 다음 사업까지 못 고친다. 그래서 **화면을 손으로 짜지 않고 명세에서 생성**한다.
//
//   요구 접수 → **명세 한 줄 수정** → 생성기가 화면을 다시 찍음 → 배포 → 기관이 확인
//        (몇 주가 아니라 같은 날 안에 도는 고리)
//
// 명세는 두 겹이다.
//   기본 명세  카드 선언(kind)에서 **자동으로 나온다** — 사람이 쓰지 않는다.
//   기관 보완  그 기관이 요구한 것만 얹는다(REQUESTS). 기본은 건드리지 않는다.
//
// 생성기: tools/gen/portal-gen.mjs — 이 파일을 읽어 landxi/proto/portal-*.html 을 쓴다.
import { DEPLOYS, cardById, needsOf, extModules } from './cards.js';

/* ══ 1. 블록 사전 — 화면을 이루는 부품. 생성기가 아는 종류는 이것뿐이다 ══ */
export const BLOCKS = {
  kpi: { name: '머리 숫자', what: '탐지 건수 · 최근 분석일 · 처리 대기' },
  cards: { name: '서비스 카드 격자', what: '내 지역에 깔린 서비스 진입점' },
  map: { name: '지도', what: '결과 레이어 · 속성 조회' },
  heatmap: { name: '밀도 격자', what: '격자 집계를 색으로' },
  timeline: { name: '시간 축', what: '시각을 끌어 결과를 되감는다' },
  player: { name: '영상 플레이어', what: '드론 영상 위에 탐지 상자' },
  grade: { name: '구간 등급', what: '선을 구간으로 끊어 등급 색칠' },
  parcel: { name: '필지 표', what: '필지별 결과 · 대장 대조' },
  chart: { name: '추이 차트', what: '기간별 변화' },
  table: { name: '결과 목록', what: '건별 목록 · 검수 · 신고' },
  stats: { name: '행정구역 통계', what: `단위별 집계 · 엑셀` },
  report: { name: '보고서 발급', what: '공문 서식 · 발급 내역' },
};

/** 카드 선언(kind) → 기본 블록. **사람이 고르지 않는다.** */
export function baseSpec(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return null;
  const card = cardById(d.cardId) || {}; const n = needsOf(card);
  const dash = ['kpi'];
  if (n.timeAxis) dash.push('chart');
  const result = ['table'];
  if (n.videoPlayer) result.unshift('player');
  if (n.timeAxis) result.push('timeline');
  const map = ['map'];
  if (n.grid) map.push('heatmap');
  if (n.lineRef) map.push('grade');
  if (n.parcelRef) map.push('parcel');
  return {
    deployId, cardId: card.id, name: card.name, region: d.region, year: d.year,
    tabs: [
      { id: 'dash', name: '현황', blocks: dash },
      { id: 'result', name: '분석 결과', blocks: result },
      { id: 'map', name: '지도', blocks: map },
      { id: 'stats', name: '통계', blocks: ['stats'] },
      { id: 'report', name: '보고서', blocks: ['report'] },
    ],
    ext: extModules(card.ext).filter((m) => m.owner === 'local').map((m) => m.name),
    from: 'kind 선언에서 자동 생성',
  };
}

/* ══ 2. 기관 요구 — 수시로 들어오고, 명세 한 줄로 반영된다 ════════════ */
/**
 * op: add(블록 추가) · drop(블록 제거) · order(순서) · label(말 바꾸기) · opt(옵션)
 * 상태: 접수 → 반영 → 배포. 배포까지 걸린 날이 이 고리의 성적표다.
 */
export const REQUESTS = [
  { id: 'rq-01', deployId: 'dp-nw-farm-25', from: '남원시 농정과', got: '2026-07-02', done: '2026-07-02',
    want: '필지 표에서 대장 불일치만 먼저 보고 싶다', op: 'opt', at: 'map/parcel', val: { filter: 'mismatch' }, state: '배포' },
  { id: 'rq-02', deployId: 'dp-nw-living-23', from: '남원시 환경과', got: '2026-07-19', done: '2026-07-22',
    want: '현황에 읍·면별 건수 막대를 넣어 달라', op: 'add', at: 'dash', val: 'chart', state: '배포' },
  { id: 'rq-03', deployId: 'dp-gj-marine-25', from: '광주전남특별시 해양항만과', got: '2026-09-04', done: '2026-09-05',
    want: '해안선 구간 등급을 지도 첫 화면에 바로', op: 'order', at: 'map', val: ['grade', 'map'], state: '배포' },
  { id: 'rq-04', deployId: 'dp-nw-road-26', from: '남원시 건설과', got: '2026-09-15', done: null,
    want: "'분석 결과'를 '점검 대상'으로 부르고 싶다", op: 'label', at: 'result', val: '점검 대상', state: '반영' },
  { id: 'rq-05', deployId: 'dp-gj-marine-25', from: '광주전남특별시 해양항만과', got: '2026-09-18', done: null,
    want: '수거 계획 표를 보고서에 붙여 달라', op: 'add', at: 'report', val: 'table', state: '접수' },
];

export const requestsOf = (deployId) => REQUESTS.filter((r) => r.deployId === deployId);

/** 기본 명세 + 반영된 요구 = 실제로 찍히는 명세. */
export function specOf(deployId) {
  const spec = baseSpec(deployId); if (!spec) return null;
  const applied = [];
  requestsOf(deployId).filter((r) => r.state !== '접수').forEach((r) => {
    const [tabId, blockId] = String(r.at).split('/');
    const tab = spec.tabs.find((t) => t.id === tabId); if (!tab) return;
    if (r.op === 'add' && !tab.blocks.includes(r.val)) tab.blocks.push(r.val);
    if (r.op === 'drop') tab.blocks = tab.blocks.filter((b) => b !== r.val);
    if (r.op === 'order') tab.blocks = [...r.val, ...tab.blocks.filter((b) => !r.val.includes(b))];
    if (r.op === 'label') tab.name = r.val;
    if (r.op === 'opt') { tab.opts = { ...(tab.opts || {}), [blockId]: r.val }; }
    applied.push(r.id);
  });
  return { ...spec, applied, pending: requestsOf(deployId).filter((r) => r.state === '접수').map((r) => r.id) };
}

/* ══ 3. 고리의 성적 — 이 방식이 실제로 빠른가 ═══════════════════════ */
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function loopStats() {
  const done = REQUESTS.filter((r) => r.done);
  const turn = done.map((r) => days(r.got, r.done));
  return {
    접수: REQUESTS.length, 배포완료: done.length,
    반영중: REQUESTS.filter((r) => r.state === '반영').length,
    대기: REQUESTS.filter((r) => r.state === '접수').length,
    평균소요일: turn.length ? +(turn.reduce((a, b) => a + b, 0) / turn.length).toFixed(1) : 0,
    최장: Math.max(0, ...turn),
    line: '화면을 명세에서 찍기 때문에 요구 하나가 같은 주 안에 배포된다 — 다음 사업을 기다리지 않는다',
  };
}

/** 생성기가 이번에 다시 찍어야 할 화면들. */
export function genQueue() {
  const touched = new Set(REQUESTS.filter((r) => r.state === '반영').map((r) => r.deployId));
  return DEPLOYS.map((d) => ({
    deployId: d.id, region: d.region, card: cardById(d.cardId)?.name,
    reason: touched.has(d.id) ? '요구 반영' : '변경 없음', rebuild: touched.has(d.id),
  }));
}

/** LX 가 이 방식으로 유지하는 화면의 총량 — 생산화의 규모. */
export function studioScale() {
  const specs = DEPLOYS.map((d) => specOf(d.id)).filter(Boolean);
  const blocks = specs.reduce((a, s) => a + s.tabs.reduce((x, t) => x + t.blocks.length, 0), 0);
  return {
    화면: specs.length * 5, 명세: specs.length, 블록: blocks,
    블록종류: Object.keys(BLOCKS).length,
    손으로짠화면: 0,
    line: `배포본 ${specs.length}개 × 5탭 = ${specs.length * 5}개 화면을 블록 ${Object.keys(BLOCKS).length}종으로 찍는다`,
  };
}
