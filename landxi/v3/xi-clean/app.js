/* xi-clean app.js — XI맵(직원 · 영업 · 기관 공용). 명세 LANDXI-FINAL-SPEC §2.8.
   같은 엔진(xi/engine · xi/fx)과 공용 키트(K1 셸 · K2 관문 · K3 무대 · K4 지역 · K5 서랍 · K6 큰 숫자 · K9 빈 상태 · K10 에이전트 · K12 · K13 · K14)를
   조합만 한다. 지역은 변수(URL ?region= · 기관 세션 · 검색 · 전국 지도에서 고르기) — 지역 문자열 하드코딩 0.
   큰 숫자(LX 직원 · 영업 · 기관) = AI 분석 결과(GET /summary · 업무 결과로 센 것만 · 셈 단위 = 필지 · 동 · 건) — 원칙 135(LX 10-09 · 기관 10-10 확인 8 ⓐ).
   예전 실태조사 흐름(S.fc — 우선순위 필지 · 규칙 · 목록 · 대조)은 코드만 남기고 어느 계정도 켜지 않는다. 기관 계정은 지도에서 필지를 눌러 필지 카드 → 검토 요청.
   기관 계정 = 관할 시군구만(원칙 39): 지역 목록 · 검색 제안 · 경계는 서버가 준 관할 목록(GET /regions?geom=1)에서만 — 전국 시군구 파일을 받지 않는다.
   광역 기관은 관할 전체로 도착하고 시군구는 사용자가 고른다(화면이 대신 고르지 않는다).
   읍면동 경계 = GET /regions/{sgg}/emd(전국 · 그 시군구 것만) · 결과 층 = GET /regions/{sgg}/results(그 시군구에 결과가 있는 모든 세트 + 전역 분석 결과). */
import * as K from '../kit/index.js';
import { api, session } from '../kit/util.js';
import { sse, API, tileUrl } from '../../shared/api-v1.js';
import { sourceSpec, EXT_OK, warmPm } from '../../xi/engine/sources.js';
import { addResultLayers, setVis, TEAL, TEAL_DEEP, INK, SLATE } from '../../xi/fx/arrive.js';
import { excludeClasses, hideResults } from '../../xi/fx/result-filter.js';   // 클래스 켜기/끄기 · 고친 자리가 대신 그리는 원래 객체 숨김(10-15)
import { analyzer } from './analyze.js';
import { mountNation } from './nation.js';   // 사업 나라 고르기 · 해외 장면(바퀴 4 · XI맵-해외)
import { reviewAction, canRequest } from '../kit/notify.js';   // 필지 카드 '검토 요청'(기관 · 구현 2차)
import { aiResult, AI_LABEL } from '../lx-console/summary.js';   // AI 분석 결과(원칙 135 · 요약 한 출처)
import { staffMenu } from '../kit/lx-menu.js';                    // 왼쪽 = LX 직원 메뉴 그대로(바퀴 5 · 원칙 191 · 196 18:52 고침)
import { govRail } from '../gov-select/menu.js';                  // 기관 계정 = 기관 메뉴 그대로
import { createBoard, boardPromise, nationalPromise, taskOf } from './board.js';   // 열자마자 서버에 있는 모든 결과(10-14 XI맵 3차 구조 · 원칙 229 · 237)
import { NCLS, NCOLOR } from './national.js';                    // 전국 분석 자산마다 보이는 분류(겹쳐 세지 않게) · 분류 색
import { createEditor } from './edit.js';                         // 그 자리 고치기(바퀴 5)
import { createDash, setUserColors } from './dash.js';
import { colors as colorPanel, colorState, paintLayers, RAMPS } from '../kit/colors.js';   // 색 바꾸기(원칙 264 · 지도 서비스와 같은 공용 칸)                           // 융합 대시보드(10-14 11:02 · 원칙 241 · 245 — XI ChatGEO 대시보드 도구가 준 사양을 그린다)
import { createOnMap } from './onmap.js';                         // 같은 사양을 지도 위에서(10-15 원칙 258 — 기본 · '통계' 단추로 대시보드와 바꿔 볼 수 있다)
import { createShowcase } from './showcase.js';
import { mountChatAnswer } from './chat-answer.js';   // XI ChatGEO 답 띠 + 대화 서랍(원칙 290)
import { createChatHL } from './chat-hl.js';           // XI ChatGEO 답 ↔ 지도 강조(원칙 292)
import { createParcels } from './parcel.js';                      // 지적 층 · 필지 카드 · 객체 소속 필지(10-15 원칙 266 · 123)                   // 왼쪽 위 결과 표시 콘셉트 셋 A · B · C(10-15 원칙 259 · 시안 단추 · 기본은 지금 모양)

const { h, esc } = K;
const Q = new URLSearchParams(location.search);
const nf = (n) => Number(n).toLocaleString('ko-KR');
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = () => matchMedia('(max-width: 640px)').matches;
const AMBER = '#FFB633';
const ALL_RULES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const STALE_DAYS = 30;
const X = (window.__xc = { t0: performance.now(), boot: {} });
const mark = (k) => { X.boot[k] = Math.round(performance.now() - X.t0); document.documentElement.dataset.xc = k; };

/* ═══ 첫 도착 — 관문(/me)을 기다리지 않고 모듈이 뜨자마자 데이터를 함께 부른다 ═══
   카탈로그 · 읍면동/규칙 집계는 탭 저장소에 10분 캐시(다시 오면 캐시로 바로 그리고 뒤에서 새로 받는다).
   기관 화면의 실태조사 조회(findings)는 첫 지역이 정해지면 바로 미리 부르고, refresh 가 그 응답을 한 번 이어받는다(20초 안 · 한 번만). */
const SESS = session.get();
const SWR_MS = 10 * 60e3;
function swr(path) {
  const k = 'xc:' + (SESS?.realm || '') + ':' + (SESS?.tenant_id || SESS?.role || '') + ':' + path;
  let c = null; try { c = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { /* */ }
  // 실태조사 적재 중(state 'building')인 집계는 칸이 비어 있다 — 캐시에 두지 않는다(끝난 뒤 새로 열어도 빈 칸을 읽지 않게)
  const fresh = api(path).then((j) => { if (j?.state !== 'building') { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j })); } catch { /* 저장 불가 */ } } return j; });
  if (c && Date.now() - c.t < SWR_MS && c.j?.state !== 'building') { fresh.catch(() => {}); return Promise.resolve(c.j); }
  return fresh;
}
const PRE = SESS ? {
  cat: swr('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build: SESS.realm === 'lx' ? 'lx' : 'tenant', locale: 'ko' })).catch(() => ({ items: [], ladder: {} })),
  emd: swr('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
  rule: swr('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
  // 전국 요약 — 첫 HUD 숫자를 다른 자료와 함께 미리(차례로 부르면 첫 진입이 그만큼 늦다 · GPT2-4)
  sum: null,                                          // LX = 전국 결과(바퀴 5)가 첫 화면 — 전국 요약은 부르지 않는다
  // 전국 결과 한 번 호출(바퀴 5) — LX 계정은 열자마자 지도에 칠한다(관문 · 지도와 함께 출발)
  board: boardPromise(SESS.realm === 'lx'),
  nat: nationalPromise(SESS.realm === 'lx'),        // 전국 결과 자산 진행 · 판 번호(실제 결과 면 · 분석 예정)도 함께 출발
} : {};
PRE.sum?.catch(() => {});
/* 시군구 경계 — LX · 게스트 = 전국 파일, 기관 = 관할 시군구만(서버가 거른 목록 · 경계 포함). 기관 화면은 전국 목록을 부르지 않는다 */
const scopeFC = (j) => ({ features: (j?.items || []).filter((it) => it.geometry).map((it) => ({ type: 'Feature', geometry: it.geometry,
  properties: { code: String(it.sgg_cd), prev: it.prev_cd ? String(it.prev_cd) : null, name: it.name, sido: String(it.full || '').split(/\s+/)[0] || it.sido } })) });
/* 기관 관할 목록(/regions · 첫 지역 고르기)도 함께 출발 — 경계 · 집계를 받은 뒤 차례로 부르면 첫 도착이 그만큼 늦다(impl-37 기관 XI맵 속도) */
PRE.regs = SESS?.realm === 'tenant' ? K.loadRegions().catch(() => []) : null;
PRE.sgg = SESS?.realm === 'tenant'
  ? api('/regions?geom=1').then(scopeFC).catch(() => ({ features: [] }))
  : fetch('/landxi/assets/data/geo/sigungu.geojson').then((r) => r.json()).catch(() => ({ features: [] }));
const FQ = new Map();
function prefetchFindings(qs) { if (!FQ.has(qs)) { const p = api('/survey/findings?' + qs); p.catch(() => {}); FQ.set(qs, { t: performance.now(), p }); } }
function findings(qs) {
  const c = FQ.get(qs); FQ.delete(qs);
  return c && performance.now() - c.t < 20e3 ? c.p : api('/survey/findings?' + qs);
}

/** 읍면동 · 규칙 집계를 상태에 싣는다. 조회 실패는 '결과 없음'과 다르다(S.statsFailed → HUD 는 실패로).
    어느 시군구든 실태조사를 만드는 중이면(state 'building') 서버는 칸을 비워 준다 — 빈 목록을 '결과 없음'으로 읽지 않는다:
    가진 목록은 그대로 두고(S.statsBuilding), 끝날 때까지 다시 묻는다(watchStats). 지금 시군구 칸은 refresh 가 그 시군구만 따로 받는다 */
const emdItems = (st) => (st.items || []).filter((i) => i.cd && i.bbox?.length === 4).map((i) => ({ cd: String(i.cd), nm: i.key, bbox: i.bbox }));
function useStats(emdSt, ruleSt) {
  if (emdSt) {
    S.statsFailed = !!emdSt.failed;
    S.statsBuilding = !emdSt.failed && emdSt.state === 'building';
    if (!emdSt.failed && !S.statsBuilding) {
      S.asOf = emdSt.as_of || null;
      S.emds = emdItems(emdSt);
      S.emdsBySgg = {};
    }
    if (S.statsBuilding) watchStats();
  }
  if (ruleSt && !ruleSt.failed && ruleSt.state !== 'building') S.ruleDefs = Object.fromEntries((ruleSt.items || []).map((i) => [i.key, { name: i.name || S.ruleNames?.[i.key] || null }]));
  if (ruleSt) S.rulesFailed = !!ruleSt.failed;
}
/** 적재가 끝날 때까지 15초마다 집계를 다시 받는다(최대 40분) — 끝나면 캐시를 비우고 숫자 · 막대를 새로 그린다 */
let statsT = 0, statsT0 = 0;
function watchStats() {
  if (statsT) return;
  statsT0 ||= Date.now();
  X.statsWatch = { state: 'building', since: new Date(statsT0).toISOString() };
  statsT = setTimeout(async () => {
    statsT = 0;
    if (Date.now() - statsT0 > 40 * 60e3) { statsT0 = 0; return; }
    const e = await api('/survey/stats?by=emd').catch(() => null);
    if (!e || e.state === 'building') { watchStats(); return; }
    statsT0 = 0;
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('xc:')) sessionStorage.removeItem(k); } catch { /* */ }
    useStats(e, await api('/survey/stats?by=rule').catch(() => null));
    X.statsWatch = { state: 'done', at: new Date().toISOString() };
    if (typeof refresh === 'function') { patchRail(); refresh(); }
  }, 15000);
}
/** 적재 중 — 지금 시군구의 읍면동 칸만 따로 받는다(그 시군구가 적재 중이 아니면 칸이 온다). → 'ok' · 'building' · 'none' */
async function regionStats(r) {
  S.emdsBySgg ||= {};
  const k = r.code;
  if (S.emdsBySgg[k]) return S.emdsBySgg[k].st;
  const j = await api('/survey/stats?' + new URLSearchParams({ by: 'emd', sgg: r.code }));
  if (j?.state === 'building') return 'building';                  // 이 시군구가 지금 만드는 중 — 캐시하지 않고 다음에 다시
  const items = emdItems(j || {});
  const have = new Set(S.emds.map((e) => e.cd));
  S.emds = [...S.emds, ...items.filter((e) => !have.has(e.cd))];
  const st = items.length ? 'ok' : 'none';
  S.emdsBySgg[k] = { st };
  return st;
}
/** 규칙 이름(사용자 말) — 집계의 이름 → 규칙 목록(GET /survey/rules)의 이름. 없으면 null(규칙 코드를 화면에 내지 않는다 · M13) */
const ruleName = (k) => (k && (S.ruleDefs[k]?.name || S.ruleNames?.[k])) || null;
/** 규칙 이름표 — 첫 화면(전국)에서 집계에 이름이 비어 있어도 코드가 보이지 않게 먼저 받는다 */
const RULE_NAMES = SESS ? api('/survey/rules').then((j) => Object.fromEntries((j.items || []).filter((i) => i.id && i.name).map((i) => [i.id, i.name])), () => ({})) : Promise.resolve({});

/* 도구 아이콘(헤어라인 20) */
const ICO = {
  layers: '<path d="M10 3 2.5 7 10 11l7.5-4z"/><path d="M2.5 11 10 15l7.5-4"/>',
  rules: '<path d="M3 5h14M5.5 10h9M8 15h4"/>',
  list: '<path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"/>',
  swipe: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M10 2v16"/>',
  tilt: '<path d="M2.5 15.5 7.5 8l3.5 4.5 2.5-3 4.5 6z"/>',
  sweep: '<path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4M16.5 10a6.5 6.5 0 0 1-11.3 4.4"/><path d="M15 2.5V6h-3.5M5 17.5V14h3.5"/>',
  report: '<path d="M5 2.5h7l3 3v12H5z M8 9h5 M8 12h5 M8 15h3"/>',
  analyze: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><path d="M10 6.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5L6.5 10 9 9z"/>',
};

const S = {
  who: null, key: '', lx: false, sales: false, tenant: false, canAnalyze: false,
  region: null, home: null, outside: false, regions: [], emds: [], ruleDefs: {}, asOf: null,
  cond: { emd: null, rule: null }, last: null, need: null, layers: { img: true, sus: true, ai: false, parcel: false, emd: true, lxmap: false },
  remd: [], remdMeta: null, res: [], resOn: {},
  tool: null, swipe: false, tilt: false, sel: null, busy: false, list: null, cat: null,
  clsOff: new Set(),                                 // 끈 클래스(XI맵 '층' 판 체크박스 · 10-15) — 지도 · 왼쪽 위 숫자 · 말풍선 숫자에서 빠짐('보이는 것 기준')
};
let SH, stage, map, hudBig, hudSus, bars, chips, pop, cmdk, AN, loadK, mainEl, NAT = null, BD = null, ED = null, toolsEl = null, hudBoard = null, DS = null, OM = null, PC = null, HL = null;
/* 통계 표출 단계(10-15 원칙 262 — "대시보드를 원치 않을 수 있고. 지도에 가시화되어서 보기만 하고 싶어할수도"): 0 = 없음 · 1 = 지도에만(한 줄) · 2 = 지도 위 통계 판 · 3 = 대시보드.
   질문하면 늘 1단계부터(이미 2 · 3단계를 보고 있으면 그 단계에 새 사양). '통계' 단추 · 답 끝 '통계 보기' · '크게 보기' · 판의 '지도만' · 대시보드 '지도로 돌아가기'로 오간다.
   옛 'xc_statv'(지도 위 ↔ 대시보드 기억)는 쓰지 않는다 — 단계가 대신한다 */
let STEP = 0;

/* ═══ 부팅 ═══ */
async function boot() {
  const who = await K.gate('xi-clean');
  mark('gate');
  S.who = who; S.key = who.key; S.lx = who.me.realm === 'lx'; S.tenant = who.me.realm === 'tenant';
  S.sales = S.key === 'lx/sales' || S.key === 'tenant/demo';
  S.canAnalyze = S.lx || S.key === 'tenant/demo';
  // 원칙 135: AI 분석 결과가 주인공(실태조사 우선순위 필지 · 규칙 · 목록 · 대조 없음) — LX(10-09) · 기관까지(10-10 확인 8 ⓐ). 옛 흐름 코드는 남겨 둠
  S.fc = false;
  if (!S.fc) { S.layers.sus = false; S.layers.ai = true; }
  document.documentElement.dataset.role = S.key.replace('/', '-');

  // 입체는 뺐다(원칙 196 · GPT3-8 '입체가 의미있나??' → 입체 빼기) — 단추 · 지형 타일 로딩 · 기울기 모두 없음(위에서 내려다보는 지도만)
  const tools = S.fc ? [['layers', '층'], ['rules', '규칙'], ['list', '목록'], ['swipe', '가르기'], ['sweep', '대조'], ['report', '보고서']]
    : [['layers', '층'], ['swipe', '가르기'], ['report', '보고서']];
  if (S.canAnalyze) tools.push(['analyze', '분석']);
  S.tools = tools;
  S.board = S.lx;                                    // 열자마자 전국 결과(LX 계정 · 바퀴 5)
  // 왼쪽 = 역할 메뉴 그대로(LX 직원 · 관리자 = 직원 메뉴의 XI맵 칸 · 기관 = 기관 메뉴) — XI맵 도구는 지도 오른쪽 위 한 줄(아이콘 + 글자 · 원칙 199)
  const rail = ['lx/staff', 'lx/admin'].includes(S.key) ? staffMenu('ximap') : S.tenant ? govRail({ who, current: 'list' }) : null;
  SH = K.shell({ who, home: 'xi-clean', rail });
  dedupeRole();
  mainEl = SH.main;
  toolsEl = h('nav.xc-tools', { 'aria-label': 'XI맵 도구' }, ...tools.map(([id, label]) => h('button.xc-tool', { type: 'button', dataset: { tool: id }, 'aria-pressed': 'false', onclick: () => { tool(id); patchRail(); } },
    h('span', { 'aria-hidden': 'true', html: `<svg viewBox="0 0 20 20">${ICO[id] || ''}</svg>` }), h('span.xc-tool-l', { text: label }))));
  patchRail();

  // 마스트: 위쪽 검색창 없음(10-17 원칙 276 "아래 XI ChatGEO 하나로") — 검색 요소는 만들되 붙이지 않는다(지역 · 읍면동 이름 동기화 코드가 그대로 쓰도록) · 조건 칩만 마스트에
  buildSearch();
  chips = h('div.xc-chips', { hidden: true });
  placeChips(); matchMedia(NARROW).addEventListener('change', placeChips);

  // 판: 무대 · HUD · 칩 · 팝오버 · 로딩
  const stageEl = h('div.xc-stage');
  const bEl = h('div.xc-b', { hidden: true, 'aria-hidden': 'true' });
  const fx = h('div.xc-fx', { 'aria-hidden': 'true' });
  hudBig = h('div.xc-big');
  bars = h('ol.xc-bars');
  hudSus = h('p.xc-sus', { hidden: true });   // 의심 필지(숫자 한 출처 · GET /summary metrics.suspect) — 큰 숫자 아래 한 줄
  const hud = h('section.xc-hud', { 'aria-live': 'polite' }, hudBig, hudSus, bars);
  pop = h('section.xc-pop.t-card.t-card--map', { hidden: true });
  const grip = h('div.xc-grip', { hidden: true, role: 'slider', tabindex: '0', 'aria-label': '가르기', 'aria-valuemin': '5', 'aria-valuemax': '95', 'aria-valuenow': '50' }, h('i'));
  const loadEl = h('div.xc-load');
  // 오른쪽 위 한 줄 = [영상 전환(작은 단추)] [사업 나라] · 그 아래 오른쪽 = 도구 줄(층 · 가르기 · 보고서 · 분석)
  const top = h('div.xc-top');
  hudBoard = h('section.xb-hud', { hidden: true, 'aria-live': 'polite' });
  const statsSlot = h('section.xb-stats', { hidden: true, 'aria-label': '통계' });   // 지도 위 통계 판 자리(지도 영역 안 · 지금은 비워 둠 — 다음 지시)
  mainEl.append(stageEl, bEl, fx, hud, hudBoard, statsSlot, pop, grip, top, toolsEl, loadEl);
  if (S.board) mountHudVariants();                    // 왼쪽 위 결과 표시 시안 ⓐ · ⓑ(10-15 원칙 253 · 기본 = 지금 모양)
  loadK = K.empty(h('div.xc-load-c'), { kind: 'loading', progress: 0.08, what: '지역 경계와 분석 집계' });   // 무엇을 기다리나(GPT2-4)
  X.waitFor = '지역 경계와 분석 집계';
  loadEl.append(loadK.el);
  S.els = { stageEl, bEl, fx, hud, grip, loadEl, top };

  // 데이터(모듈 시작 때 이미 출발 · 관문 세션과 다르면 다시) — 카탈로그 · 읍면동/규칙 집계 · 전국 시군구 경계
  const build = S.lx ? 'lx' : 'tenant';
  const same = SESS && (SESS.realm === 'lx') === S.lx;
  const catP = same ? PRE.cat : api('/catalog/layers?' + new URLSearchParams({ stage: 'domestic', build, locale: 'ko' })).catch(() => ({ items: [], ladder: {} }));
  const aliasP = api('/regions?limit=400').then((j) => j.items || [], () => []);
  const statsP = Promise.all([
    PRE.emd || api('/survey/stats?by=emd').catch(() => ({ items: [], failed: true })),
    PRE.rule || api('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })),
    RULE_NAMES,
  ]);
  // 전국 결과(바퀴 5) = 첫 화면은 시군구 경계 + 전국 결과 한 번 호출만 기다린다(읍면동 · 규칙 집계 · 코드 별칭은 뒤에서 받아 이어 붙인다 — 열자마자 2초 안)
  const [emdSt, ruleSt, sgg, names] = S.board ? [null, null, await PRE.sgg, null] : await Promise.all([...await statsP.then((x) => x.slice(0, 2)), PRE.sgg, statsP.then((x) => x[2])]);
  S.ruleNames = names || {};
  if (S.board) statsP.then(([e, r, n]) => { S.ruleNames = n || {}; useStats(e, r); patchRail(); }, () => {});
  else useStats(emdSt, ruleSt);
  const sggFC = S.tenant && SESS?.realm !== 'tenant' ? await api('/regions?geom=1').then(scopeFC).catch(() => ({ features: [] })) : sgg;   // 관문 세션이 기관인데 미리 받은 것이 전국이면 관할로 다시
  S.regions = (sggFC.features || []).map((f) => ({ code: String(f.properties.code), name: f.properties.name, sido: f.properties.sido, full: `${f.properties.sido} ${f.properties.name}`, bbox: K.bboxOf(f), geometry: f.geometry }));
  X.regions = S.regions.length;
  if (S.board) aliasP.then((x) => { loadAlias(x); if (S.region) paintBoardHud(); }); else loadAlias(await aliasP);
  if (S.tenant) S.scopeBox = S.regions.reduce((a, r) => (r.bbox ? (a ? [Math.min(a[0], r.bbox[0]), Math.min(a[1], r.bbox[1]), Math.max(a[2], r.bbox[2]), Math.max(a[3], r.bbox[3])] : [...r.bbox]) : a), null);

  // 지역: URL → 기관 관할 → 없으면 전국 — 정해지는 즉시 HUD 조회를 미리 부른다(층 쌓기와 동시에)
  if (S.tenant) S.home = await homeRegion();
  const want = Q.get('region');
  const r0 = (want && (findRegion(want) || await regionByCode(want))) || S.home || null;
  if (S.fc && Q.get('rule') && (ALL_RULES.includes(Q.get('rule')) || S.ruleDefs[Q.get('rule')])) S.cond.rule = Q.get('rule');
  if (S.fc) { const q = hudQuery(r0, { emd: null, rule: S.cond.rule }); if (q.p && !(S.tenant && r0 && !inScope(r0))) prefetchFindings(q.p.toString()); }
  // 첫 지역이 정해지면 그 지역 자료(읍면동 경계 · 결과 목록)를 층 쌓기와 함께 미리 부르고, 카메라도 바로 그 자리에 둔다
  // — 날아가는 2.4초 · 날아간 뒤 두 번째 '불러오는 중'이 없다(바탕 · 결과 타일을 처음부터 그 자리에서 받는다 · impl-37 기관 XI맵 속도)
  if (r0 && !(S.tenant && !inScope(r0))) prefetchRegion(r0);
  mark('region');
  // 지도 엔진은 지역 · 지역 자료 요청을 낸 뒤에 기다린다(첫 화면 묶음 · 결과 층 머리가 엔진을 받는 동안 함께 온다 · impl-38 ximap-boot)
  // 모듈은 async 로 먼저 돈다(index.html) — 지도 엔진(maplibre · pmtiles · defer 스크립트)이 실행된 뒤 무대를 만든다(30초 넘게 오지 않으면 그대로 진행 → '열지 못했습니다')
  if (!window.maplibregl || !window.pmtiles) await new Promise((ok) => { const t0 = performance.now(); const f = () => (window.maplibregl && window.pmtiles) || performance.now() - t0 > 30e3 ? ok() : setTimeout(f, 25); f(); });
  mark('engine');
  stage = K.createStage(stageEl, { under: true, worldCredit: false });   // 거친 밑받침 — 입체로 기울일 때 흰 빈자리 0(GPT2-1)
  map = stage.map; X.map = map; X.stage = stage;
  // 날아간 뒤 결과가 아직이면 가운데 '불러오는 중'(원칙 212) — 화면이 옮긴 것만(손으로 끈 것 제외) · 첫 판이 걷힌 뒤 · 0.4초 안에 다 그려지면 보이지 않는다
  { let wait = null; map.on('moveend', (e) => { if (e.originalEvent || !X.boot.ready || DS?.on || OM?.on) return; wait?.(); wait = K.untilDrawn(map, { skip: /^(k-|xc-(pc|img|lxmap|emd|rline|rmask|sgg|pts|rgrid)|xo-)/, max: 4000 }); }); }   // 결과 원천만 기다린다(바탕 · 지적 · 경계 원천은 제외) · 4초 넘으면 놓는다(10-17 원칙 274 — 가운데 카드가 남지 않게) · 지도 위 통계 중(OM.on)에는 결과 층이 걷혀 있어 기다릴 것이 없다 — 순위 돌아보기 때 '불러오는 중'이 남던 것(10-17 원칙 274)
  try { map.setMaxPitch(0); map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation?.(); } catch { /* 지도 전 */ }   // 입체 없음(원칙 196)
  // 바탕 영상이 하나도 그려지지 않았으면(외부 바탕 원천이 모두 멈춤) 큰 숫자를 진한 글자로 — 밝은 빈 바탕 위 흰 글자가 흐리지 않게(10-10 고장)
  map.on('idle', () => { hud.dataset.base = hudBoard.dataset.base = EXT_OK.n > 0 ? 'img' : 'plain'; });
  K.devDrawer({ stage, who });
  hudBig.hidden = true;   // 첫 refresh 가 '조회 중' 자리를 깔 때까지(빈 봉투 문장이 먼저 보이지 않게)

  { const b0 = r0?.bbox || (S.tenant && S.scopeBox) || null; if (b0) stage.go(b0, { ms: 0, maxZoom: r0 ? 12.5 : 11 }); }

  const [cat] = await Promise.all([catP, stage.ready]);
  S.cat = cat;
  mark('data'); loadK.set({ progress: 0.45, what: (X.waitFor = '지도') });

  await buildLayers(cat);
  mark('layers'); loadK.set({ progress: 0.7 });
  wireMap();
  if (S.board) mountBoard();

  AN = S.canAnalyze ? analyzer({ stage, host: mainEl, catalog: cat, who, demo: S.sales,
    // 분석이 도는 동안은 이미 있는 결과 층을 잠시 내린다(새로 차오르는 결과와 섞이지 않게) — 끝나면 층 설정 그대로
    onBusy: (b) => { S.busy = b; mainEl.dataset.busy = b ? '1' : ''; if (b) for (const it of S.res || []) setVis(map, it.ids, false); else applyLayers(); },
    onDone: (r) => { if (r) { refresh(); if (!r.replay) { K.toast('분석했습니다'); if (S.region) regionData(S.region); BD?.reload(); if (r.job?.options?.scope === 'sgg') followSurvey(S.region); } } else if (S.tool === 'analyze') { S.tool = null; patchRail(); } },
    pick: pickEmd, regionInfo: () => ({ emds: S.remd, meta: S.remdMeta }) }) : null;

  cmdk = K.mountCmdk({ stage, guest: false, context: () => ({ region: S.region?.code || null, region_name: S.region?.full || null, emd_cd: S.cond.emd?.cd || null, rule: S.cond.rule || null,
    sets: (S.res || []).filter((it) => it.set && aiOn() && S.resOn[it.id]).map((it) => it.set), cls_off: [...S.clsOff],
      ...(NAT && NAT.id !== 'kr' ? { country: NAT.id === 'kg' ? 'Kyrgyzstan' : NAT.id, district: NAT.sel || null } : {}) }),   // 해외(나라 바꿈)면 나라 · 고른 군 — XI ChatGEO 가 해외 결과 도구로 답한다(원칙 260 · 국내 서비스 요약으로 새던 것 · 바퀴 16 재검수)   // cls_off = 끈 클래스 → XI ChatGEO 통계도 빼고 셈(10-15)
    // XI ChatGEO 채팅 창 = 지도 아래 가운데(10-14 원칙 244 — 3차 시안 자리 그대로 · 오른쪽 칸 없음). 추천 질문 = 지금 지역에 맞춘 셋
    dock: 'bottom', dockHost: mainEl, sugg: xiSugg, pre: placeQuery, ph: '시군구 · 지번 또는 질문' });   // sets = 켜진 결과 레이어(말로 거르기 · 보고서 — 원칙 193) · pre = 시군구 · 지번이면 바로 이동(원칙 276)
  if (S.board) DS = createDash({ map, stage, host: mainEl, h,
    sggFC: () => ({ type: 'FeatureCollection', features: S.regions.filter((r) => r.geometry).map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { code: r.code, codes: codesOf(r).join(','), name: r.name } })) }),
    onEnter: () => { closePop(); ED?.close(); unpin(); BD?.show(false); hudBoard.hidden = true; },
    onShown: () => cmdk?.close({ force: true }),          // 대시보드가 서면 아래 채팅 창의 대화 칸을 접는다(입력 줄은 그대로 · 누르면 다시 펼침)
    onBack: () => setStep(2),                              // '지도로 돌아가기' = 3단계 → 2단계(지도 위 통계 판)
    onLeave: () => { STEP = 0; paintStatSwitch(); BD?.show(true); HUDKEY = ''; paintBoardHud(); if (KEEPCAM) { /* 서랍이 자리를 차지해 통계만 걷음 — 카메라 그대로 */ } else if (S.region) goKeep(S.region.bbox, { ms: RM() ? 0 : 1400, maxZoom: 12.5 }); else stage.home({ ms: RM() ? 0 : 1400 }); } });
  if (S.board) { OM = createOnMap({ map, stage, host: mainEl, h,                       // 지도 위 표출(원칙 258 · 기본) — 결과 층은 그대로 두고 그 위에 색칠 · 꼬리표 · 작은 판
    sggFC: () => ({ type: 'FeatureCollection', features: S.regions.filter((r) => r.geometry).map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { code: r.code, codes: codesOf(r).join(','), name: r.name } })) }),
    onEnter: () => { closePop(); ED?.close(); unpin(); closeDrawer(); BD?.show(false); hudBoard.hidden = true; },   // 결과 층은 잠시 걷어 색칠이 읽히게(닫으면 되돌림) · 오른쪽 서랍(필지 카드 · 목록)은 닫는다 — 통계 한 줄 · 판이 서랍 밑에 가려지던 것(바퀴 16 재검수)
    onShown: () => cmdk?.close({ force: true }),          // 날아가기 시작하면 아래 채팅 창의 대화 칸을 접는다(답은 그때까지 읽힘 · 입력 줄은 그대로)
    onStep: (n) => setStep(n),                             // 한 줄 '통계 보기'(2) · 판 '크게 보기'(3) · '지도만'(1) · 판 접기 · 펼치기(1 ↔ 2)
    onColor: (btn, m) => openStatColors(btn, m), opacity: () => (SST.custom ? SST.op : 1),   // 판 '지도 색' 점 → 색 띠(원칙 264)
    clsColor: (k) => userCol(k) || baseCol(k),                                              // 꼬리표 색 점 = 그 클래스 색(사람이 고른 색 먼저 · 10-17)
    onLeave: () => { if (HL?.cur?.src === 'dash') HL.clear(); STEP = 0; paintStatSwitch(); BD?.show(true); HUDKEY = ''; paintBoardHud(); stage.pad({}); if (KEEPCAM) { /* 서랍이 자리를 차지해 통계만 걷음 — 카메라 그대로 */ } else if (S.region) goKeep(S.region.bbox, { ms: RM() ? 0 : 1400, maxZoom: 12.5 }); else stage.home({ ms: RM() ? 0 : 1400 }); } });
    mountStatSwitch(); }
  mountLayout();                                                                        // 지도 위 배치 하나(원칙 279) — 도구 열 아래 · 오른쪽 쌓임 폭 · 채팅 창 자리
  // XI ChatGEO 답 ↔ 지도 강조(10-18 원칙 292 "지도와 동적으로 움직이는게 맞다") — 서버 map_refs(도구 결과 · 관할 안)만 그린다 · 끄기 = ?hl=0
  if (new URLSearchParams(location.search).get('hl') !== '0') {
    HL = createChatHL({ map,
      emds: async (sgg) => (S.remd.length && S.region && (S.region.code === sgg || codesOf(S.region).includes(sgg) || S.remdMeta?.sgg_cd === sgg) ? S.remd : hlEmds(sgg)),
      sgg: (k) => { const r = byCode(k); return r?.geometry ? { geometry: r.geometry, name: r.name } : null; },
      go: (b, o = {}) => goKeep(b, { ms: RM() ? 0 : 1200, maxZoom: o.maxZoom ?? 12.5 }),
      focus: hlFocus,
      om: () => ({ on: !!OM?.on, sgg: OM?.spec?.map?.level === 'emd' ? String(OM.spec.map.sgg || '') : null }) });
    document.addEventListener('kit:agent-done', (e) => { const d = e.detail; if (d?.replay) return; if (d?.refs) HL.show({ ...d.refs, run: d.run }); else if (HL.cur && (d?.rejected || HL.cur.src !== 'dash')) HL.clear(); });   // 새 답이 가리키는 곳이 없으면(관할 밖 · 일반 답) 앞 답의 강조를 걷는다 — 남은 강조가 이 답처럼 보이지 않게
  }
  mountChatAnswer({ host: mainEl, cmdk, hl: HL });                                      // XI ChatGEO 자리(원칙 290 · 10-18 '1안') — 입력 한 줄 + 답 띠 · 대화 전체는 오른쪽 서랍
  // 이 화면이 직접 처리하는 동작은 명령 바 기본 처리를 막는다(preventDefault · 끝나면 이 화면이 done 을 낸다 · plan 3.2)
  const OWN = new Set(['map_region', 'map_zoom', 'map_view', 'map_layer', 'analysis_watch', 'screen_open', 'map_compare', 'map_draw', 'map_task', 'ximap_dash']);
  document.addEventListener('kit:agent-action', (e) => { if (e.detail?.op === 'map_filter') return; if (OWN.has(e.detail?.op)) e.preventDefault(); onAgent(e.detail); });   // map_filter = 키트가 결과 층에 바로 건다(원칙 193)

  loadK.set({ progress: 0.85, what: (X.waitFor = r0 ? '지역 결과 요약' : '전국 결과 요약') });
  mark('canvas');
  // 도착 = HUD 숫자 + 지도(지역 베일 · 점)가 그려진 순간. 관할로 날아가는 카메라(2.4초)는 기다리지 않는다
  // 로딩 판은 도착 순간에 걷는다(덜 그려진 지도를 먼저 보이지 않게)
  await setRegion(r0, { first: true });
  hudBig.hidden = false;
  mark('ready');
  // 판을 걷는 순간: 보이는 타일이 다 왔거나 0.9초(덜 찬 타일 · 흰 사각형을 먼저 보이지 않게)
  { const t0 = performance.now();
    // 가운데 '불러오는 중'은 판이 걷힐 때 함께 끝난다(빈 판만 남는 틈 없음 · impl-37)
    const out = () => { loadK.set({ progress: 1 }); S.els.loadEl.classList.add('is-out'); setTimeout(() => S.els.loadEl.remove(), 600); X.boot.shown = Math.round(performance.now() - X.t0); };
    // 지역 도착(기관 등) = 그 지역 결과 층까지 그려질 때를 기다려 한 번에 걷는다 — '불러오는 중'은 이 판 하나(걷힌 뒤 결과 때문에 다시 뜨지 않게 · 최대 3초 · impl-37)
    let rdOk = !S.rdP; S.rdP?.finally(() => { rdOk = true; });
    const drawn = () => { try { return !map.isMoving() && Object.keys(map.getStyle()?.sources || {}).filter((id) => !/^k-/.test(id)).every((id) => map.isSourceLoaded(id)); } catch { return true; } };
    // 결과 층이 보이면 바로 걷는다(impl-38 ximap-boot) — 켜진 결과 층 하나라도 그 축척 조각이 다 와서 화면에 결과가 그려진 순간.
    // 나머지 결과 층 · 바탕 영상 · 필지 조각은 판이 걷힌 뒤 차오른다(카메라가 그대로라 '불러오는 중'이 다시 뜨지 않는다).
    // 켜진 결과 층이 없거나 화면 안에 결과가 없으면 예전처럼 지도가 다 그려질 때(최대 3초)
    const resOn = () => (S.res || []).filter((it) => aiOn() && S.resOn[it.id] && map.getSource(it.sid));
    const resShown = () => { try { const on = resOn().filter((it) => map.isSourceLoaded(it.sid)); if (!on.length || map.isMoving()) return false;
      const ids = on.flatMap((it) => it.ids).filter((l) => map.getLayer(l)); return ids.length > 0 && map.queryRenderedFeatures({ layers: ids }).length > 0; } catch { return false; } };
    const poll = () => (S.board ? map.areTilesLoaded() || performance.now() - t0 > 450 : (rdOk && (resShown() || drawn())) || performance.now() - t0 > 3000) ? out() : setTimeout(poll, 60); poll(); }   // 전국 결과는 칠이 이미 그려져 있다 — 바탕 타일을 오래 기다리지 않는다

  if (Q.get('pnu')) openParcel(Q.get('pnu'), { fly: true });
  // 사업 나라(대한민국 · 키르기스스탄) — LX 계정만. 나라를 바꾸면 같은 지도가 그 나라 실제 결과로(XI맵-해외 · 원칙 190 · 191)
  if (S.lx) {
    NAT = mountNation({ map, host: mainEl, onPick: () => cmdk?.sugg?.(), onEnter: () => { closePop(); closeDrawer(); ED?.close(); unpin(); BD?.show(false); hudBoard.hidden = true; if (searchInput) { searchInput.value = ''; sugg.hidden = true; } },   // 나라를 바꾸면 검색 칸도 비운다(지도와 검색이 어긋나지 않게 · GPT5-4)
      onLeave: () => { BD?.show(true); if (searchInput) searchInput.value = S.cond.emd?.nm || S.region?.name || ''; if (!S.region) paintBoardHud(); return S.region ? goKeep(S.region.bbox, { ms: RM() ? 0 : 1600, maxZoom: 12.5 }) : stage.home({ ms: RM() ? 0 : 1600 }); } });
    const nb = mainEl.querySelector('.xn-bar'); if (nb) S.els.top.append(nb);   // 사업 나라 = 오른쪽 위 한 줄 안
    if (Q.get('nation') && Q.get('nation') !== 'kr') NAT.go(Q.get('nation'), { first: true });
  }
  // 기관 — 서비스 대시보드의 '결과 지도' 탭에서 왔으면 '보고 있는 결과' 카드 · '이 영상으로 분석 요청'(18차 N-1 ⓐ · 촬영-1 ⓑ · gov-select/map-extras.js)
  if (canRequest(who) && Q.get('service')) import('../gov-select/map-extras.js').then((m) => m.mapCard({ host: mainEl, card: Q.get('service'), region: () => S.region,
    center: () => { const c = map.getCenter(); return [c.lng, c.lat]; } })).catch((e) => K.devlog('map-card', String(e?.message || e)));
  { const cq = (Q.get('compare') || '').split(',').filter(Boolean); if (cq.length === 2) compareOn(cq[0], cq[1]).catch((e) => K.devlog('compare', String(e?.message || e))); }
  if (Q.get('tool') === 'analyze' && AN) tool('analyze');
  if (Q.get('job') && AN) { S.tool = 'analyze'; patchRail(); AN.replayJob(Q.get('job'), { label: S.region?.name, bbox: S.region?.bbox }); }
  // 기준일이 30일을 넘으면 도착 때 한 번 대조(세션당 1회)
  const stale = S.asOf && (Date.now() - Date.parse(S.asOf)) / 864e5 > STALE_DAYS;
  if (S.fc && stale && regionEmds().length && !sessionStorage.getItem('xc_swept')) reconcile();   // 대조 = 기관 화면만(원칙 135)
}

/* ═══ 도구 줄(층 · 가르기 · 보고서 · 분석) — 지도 오른쪽(왼쪽은 역할 메뉴 그대로 · 바퀴 5) · 헤어라인 아이콘 + 글자 · 눌림 · 꺼짐 ═══ */
function patchRail() {
  if (!toolsEl) return;
  toolsEl.querySelectorAll('.xc-tool').forEach((b) => {
    const id = b.dataset.tool; if (!id) return;
    const on = S.tool === id || (id === 'swipe' && S.swipe) || (id === 'tilt' && S.tilt) || (id === 'list' && S.list) || (id === 'analyze' && AN?.active);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const off = S.outside && ['rules', 'list', 'sweep', 'report'].includes(id) || (id === 'sweep' && !regionEmds().length) || (id === 'report' && !regionEmds().length);
    if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  });
}

/* ═══ 지도 층 ═══ */
async function buildLayers(cat) {
  const items = cat.items || [];
  // 원천 주소(서명 등)는 한꺼번에 받아 둔다 — 층은 아래에서 순서대로 쌓는다
  const specs = new Map();
  const want = items.filter((i) => i.role === 'reference' && (i.id === 'sigungu' || /^parcels-/.test(i.id)));
  const specsP = Promise.all(want.map((it) => sourceSpec(it).then((s) => specs.set(it.id, s), () => {})));
  // 영상 사다리(자체 영상만 · 외부 위성은 무대 바탕이 맡는다)
  // 원본 등록 영상(tier raw)은 PMTiles 가 있어도 동적 타일 층(cogLayers)으로 — 사다리(z15↑)가 아니라 지역 축척부터 보이게
  const own = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles' && i.tier !== 'raw').map((i) => i.id);
  const order = (cat.ladder?.domestic || []).filter((id) => own.includes(id));
  const ladderP = stage.ladder(items, order).then((L) => { S.ladder = L; }, (e) => K.devlog('ladder', String(e?.message || e)));
  await Promise.all([specsP, ladderP]);
  const spec = async (it) => specs.get(it.id) || sourceSpec(it);
  // 원본 등록 영상(지역 축척 8단계부터 보임)의 서명 주소는 첫 도착을 기다리게 하지 않는다 — 영상 수만큼 요청이라 먼 연결에서 첫 진입이 늦었다(GPT3-8 '서버 응답 늦음')
  cogLayers(items, own).then(() => { try { applyLayers(); } catch { /* 층 설정 전이면 setRegion 이 맞춘다 */ } }, (e) => K.devlog('cog', String(e?.message || e)));

  // 시군구 경계(전국 · 지역 고르기)
  const sggIt = S.tenant ? null : items.find((i) => i.role === 'reference' && i.id === 'sigungu');   // 기관 = 전국 경계 층 없음(관할만)
  if (sggIt) {
    map.addSource('xc-sgg', await spec(sggIt));
    const L = sggIt.layer;
    map.addLayer({ id: 'sgg-hit', type: 'fill', source: 'xc-sgg', 'source-layer': L, maxzoom: 10, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.001 } }, 'slot-reference');
    map.addLayer({ id: 'sgg-hover', type: 'fill', source: 'xc-sgg', 'source-layer': L, maxzoom: 10, filter: ['==', ['to-string', ['get', 'code']], ''], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.16 } }, 'slot-reference');
    map.addLayer({ id: 'sgg-line', type: 'line', source: 'xc-sgg', 'source-layer': L, maxzoom: 11, layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': 0.7, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 9, 0.5, 11, 0] } }, 'slot-reference');
  }
  // 지역 초점(지역 밖 회백 베일 · 딤 없음 + 경계선) — 전국 시군구 경계(geojson)에서 · 지역은 변수
  map.addSource('xc-rmask', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-rmask', type: 'fill', source: 'xc-rmask', paint: { 'fill-color': '#F2F4F6', 'fill-opacity': 0.4 } }, 'slot-reference');
  map.addSource('xc-rline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-rline', type: 'line', source: 'xc-rline', layout: { 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 12, 2.4], 'line-opacity': 0.9 } }, 'slot-reference');
  // 읍면동 경계 — 지금 지역의 것만(GET /regions/{sgg}/emd · 전국 · setRegion 이 채운다)
  map.addSource('xc-emd', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-emd', type: 'line', source: 'xc-emd', minzoom: 9, layout: { 'line-join': 'round' },
    paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.25, 12, 0.5, 15, 0.3] } }, 'slot-reference');
  S.emdLayers = ['xc-emd'];
  // AI 분석 결과 층 — 지금 지역에 결과가 있는 세트(GET /regions/{sgg}/results · setRegion 이 채운다)
  S.aiIds = [];
  // 필지(카탈로그 'parcels-*' 참조 층) — 지적선 · 실태조사 우선순위 필지 면(기관 화면만 켠다)
  S.parcelLayers = []; S.susLayers = [];
  for (const it of items.filter((i) => i.role === 'reference' && /^parcels-/.test(i.id))) {
    const sid = 'xc-pc-' + it.id;
    map.addSource(sid, await spec(it));
    map.addLayer({ id: sid + '-l', type: 'line', source: sid, 'source-layer': it.layer, minzoom: 14, layout: { 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 18, 1], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.4, 16.5, 0.4, 17, 0] } }, 'slot-overlay');   // '지적' 한 줄(10-17): 14~17 = 필지 경계 선 · 17~ = 편집지적도만(두 지적 선이 겹쳐 어긋나 보이지 않게)
    map.addLayer({ id: sid + '-s', type: 'fill', source: sid, 'source-layer': it.layer, minzoom: 12.5, filter: ['in', ['to-string', ['get', 'pnu']], ['literal', []]],
      paint: { 'fill-color': AMBER, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, 0.5, 17, 0.28] } }, 'slot-overlay');
    map.addLayer({ id: sid + '-sl', type: 'line', source: sid, 'source-layer': it.layer, minzoom: 12.5, filter: ['in', ['to-string', ['get', 'pnu']], ['literal', []]],
      paint: { 'line-color': AMBER, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, 1] } }, 'slot-overlay');
    /* 필지 누르기(기관 · 검토 요청) — 보이지 않는 면 한 겹(지적선과 같은 원본 · 필지 번호만 읽는다) */
    if (canRequest(S.who)) { map.addLayer({ id: sid + '-hit', type: 'fill', source: sid, 'source-layer': it.layer, minzoom: 14, paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, 'slot-overlay'); S.hitLayers = [...(S.hitLayers || []), sid + '-hit']; }
    S.parcelLayers.push(sid + '-l'); S.susLayers.push(sid + '-s', sid + '-sl');
  }
  lxmapLayer();                                      // 지적(LX맵 편집지적도) — LX 직원 · 기관 모두(10-15 원칙 266)
  // 실태조사 우선순위 필지 점(기관 화면만 · 먼 축척 · 필지 면이 차오르면 물러난다)
  map.addSource('xc-pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'xc-pts-glow', type: 'circle', source: 'xc-pts', paint: { 'circle-color': AMBER, 'circle-blur': 1, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 9, 6, 12, 12, 14, 14], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 0.3, 14, 0] } }, 'slot-overlay');
  map.addLayer({ id: 'xc-pts', type: 'circle', source: 'xc-pts', paint: { 'circle-color': AMBER, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 9, 2, 12, 3.2, 14, 4.5],
    'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1], 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 1, 14.5, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0.9, 14.5, 0] } }, 'slot-overlay');
}
/* LX맵(편집지적도 · V-World WMS 층 lt_c_landinfobasemap) — 연속지적(필지 속성)과 다른 '지도 그림'(원칙 123). 게이트웨이 중계(/proxy/vworld/wms · 키는 서버 · 30일 보관).
   V-World 는 이 층을 약 0.8m/화소보다 가까운 축척에서만 그린다(그보다 멀면 투명 한 장 · 10-15 실측 0.8 그림 · 0.9 빈 장).
   → 타일 하나를 0.75m/화소가 되게 받아(z16 타일 = 1024 화소 → 512 로 줄임) 지도 z17 부터 켠다. 더 먼 축척(z15 · 16)은 한 화면에 수십 MB 라 받지 않는다(정중하게).
   지역 고정값 없음. */
const LXMAP_Z = 17;
const CAD_MPP = 0.75;
const R3857 = 20037508.342789244;
async function blankTile() { const c = new OffscreenCanvas(1, 1); return createImageBitmap(c); }
function lxmapLayer() {
  if (!window.__lxmapProto) {
    window.__lxmapProto = 1;
    window.maplibregl.addProtocol('lxmap', async (params, ac) => {
      const m = /^lxmap:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
      if (!m) return { data: await blankTile() };
      const [z, x, y] = [+m[1], +m[2], +m[3]], s = (2 * R3857) / 2 ** z, x0 = -R3857 + x * s, y1 = R3857 - y * s;
      const px = Math.min(1024, Math.max(512, Math.ceil(s / CAD_MPP / 256) * 256));   // V-World 가 그리는 축척이 되게(0.75m/화소)
      const q = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.3.0', LAYERS: 'lt_c_landinfobasemap', STYLES: '', CRS: 'EPSG:3857',
        BBOX: [x0, y1 - s, x0 + s, y1].map((v) => v.toFixed(2)).join(','), WIDTH: String(px), HEIGHT: String(px), FORMAT: 'image/png', TRANSPARENT: 'true' });
      const tok = session.get()?.token;
      try {
        const r = await fetch(API.prefix + '/proxy/vworld/wms?' + q, { headers: tok ? { authorization: 'Bearer ' + tok } : {}, signal: ac.signal });
        if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return { data: await blankTile() };
        const b = await r.blob();
        return { data: await (px > 512 ? createImageBitmap(b, { resizeWidth: 512, resizeHeight: 512, resizeQuality: 'high' }) : createImageBitmap(b)) };
      } catch { return { data: await blankTile() }; }
    });
  }
  map.addSource('xc-lxmap', { type: 'raster', tiles: ['lxmap://{z}/{x}/{y}'], tileSize: 512, minzoom: LXMAP_Z - 1, maxzoom: 19 });
  map.addLayer({ id: 'xc-lxmap', type: 'raster', source: 'xc-lxmap', minzoom: LXMAP_Z, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } }, 'slot-overlay');
}
/** 지적(LX맵) 켜고 끄기(층 판 '지적' · 기관 필지 카드 '이 자리 LX맵 겹쳐 보기' 같은 값) — 멀리 있으면 층 판 '지적' 줄이 흐려질 뿐(새 문구 없음 · 10-15) */
function setLxmap(on, { near = null } = {}) {
  S.layers.lxmap = S.layers.parcel = !!on; applyLayers(); paintCadRow();   // '지적선' · '지적' 한 줄(10-17 지적선-합치기 · 원칙 272) — 필지 경계 선(14~) + 편집지적도(17~) 함께
  if (!on) { PC?.close(); return; }
  if (near) map.easeTo({ center: near, zoom: Math.max(map.getZoom(), LXMAP_Z + 0.5), duration: 900 });
}
/** 지적 층이 켜져 있고 보이는 축척 — 빈 땅을 누르면 필지 카드 · 마우스 손가락 */
const cadOn = () => !!S.layers.lxmap && !!map?.getLayer('xc-lxmap') && map.getZoom() >= LXMAP_Z && !AN?.active && !S.swipe && !DS?.on;
/** 층 판의 '지적' 줄 — 보이지 않는 축척이면 체크박스만 흐리게 */
function paintCadRow() {
  const r = pop?.querySelector('[data-cad]');
  if (!r) return;
  r.setAttribute('aria-checked', String(!!S.layers.lxmap));
  r.classList.toggle('is-far', map.getZoom() < (S.parcelLayers?.length ? 14 : LXMAP_Z));   // 필지 경계 선(14~)도 없으면 흐리게
}
const susSet = () => [...S.susLayers, 'xc-pts', 'xc-pts-glow'];

/* 등록 영상 중 PMTiles 가 없는 것(원본 · 전국 시군구) — 동적 래스터 타일(/tiles/cog · 서버가 CPU 로 그리고 디스크에 캐시)을 영상 층으로 쌓는다.
   주소는 카탈로그가 준 것(LX = 서명 · 기관 = 관할 영상만 서명). 범위(bounds) 밖은 타일을 부르지 않는다. 영상은 지역 축척(z9.4↑)에서 들어온다 */
const COG_MIN_Z = 8;
/* 서명 타일 주소의 호스트 = 이 화면의 API 기준 주소(서버도 요청 호스트로 서명하지만, 옛 게이트웨이·고정 주소가 오면 여기서 맞춘다).
   고정 localhost:8700 으로 두면 그 이름의 브라우저 연결 6칸이 막혔을 때 API 는 살아 있어도 영상만 멈춘다(실증 2차). 루프백 주소끼리만 바꾼다. */
const LOOP = /^https?:\/\/(?:localhost\.?|127\.0\.0\.1|\[::1\])(?::\d+)?(?=\/)/i;
const onApiHost = (u) => { try { const b = new URL(API.base); return LOOP.test(u) && LOOP.test(b.origin + '/') ? u.replace(LOOP, b.origin) : u; } catch { return u; } };
async function cogLayers(items, own) {
  S.imgLayers = (S.ladder?.items || []).filter((it) => own.includes(it.id)).map((it) => 'img-' + it.id);
  const cog = items.filter((i) => i.role === 'imagery' && i.tier === 'raw' && ['cog', 'pmtiles'].includes(i.source) && i.bounds && !own.includes(i.id) && i.tile_ready !== false);
  // 서명 주소(GET /tiles/sign?set=cog/{id} · LX = 전부 · 기관 = 관할 영상만) — 원본 경로는 화면에 오지 않는다
  const specs = await Promise.all(cog.map((it) => api('/tiles/sign?' + new URLSearchParams({ set: 'cog/' + it.id }))
    .then((j) => [it, { tiles: [onApiHost(j.url)], attribution: it.attribution || '' }], (e) => { K.devlog('cog sign', `${it.id} ${e?.code || e?.message || e}`); return null; })));
  for (const x of specs) {
    if (!x) continue;
    const [it, src] = x, sid = 'xc-cog-' + it.id, lid = sid + '-r';
    if (map.getSource(sid)) continue;
    map.addSource(sid, { ...src, type: 'raster', tileSize: 256, bounds: it.bounds, minzoom: COG_MIN_Z, maxzoom: 19 });
    map.addLayer({ id: lid, type: 'raster', source: sid, minzoom: COG_MIN_Z,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], COG_MIN_Z, 0, COG_MIN_Z + 0.6, 1], 'raster-fade-duration': 300 } }, 'slot-imagery');
    S.imgLayers.push(lid);
  }
  X.cog = S.imgLayers.length;
}

/* 필지 타일의 PNU 는 옛 시도 코드일 수 있다(예: 전북 45→52) — 지금 지역과 시군구 세 자리가 같으면 지금 시도 코드로(서버 필지 · 관할 판정이 지금 코드) */
const nowPnu = (p) => { const c = String(S.region?.code || ''); return /^\d{19}$/.test(p) && c.length === 5 && p.slice(2, 5) === c.slice(2) ? c.slice(0, 2) + p.slice(2) : p; };
function wireMap() {
  map.on('click', (e) => {
    if (AN?.active || S.swipe) return;
    const pad = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
    const lyr = ['xc-pts', ...S.susLayers.filter((l) => l.endsWith('-s'))].filter((l) => map.getLayer(l));
    const hit = map.queryRenderedFeatures(pad, { layers: lyr })[0];
    if (hit?.properties?.pnu) { const t = String(hit.properties.pnu).slice(2); const f = (S.last?.items || []).find((x) => String(x.pnu).slice(2) === t); openParcel(f?.pnu || String(hit.properties.pnu), { fly: hit.layer.id === 'xc-pts' }); return; }
    /* 지적 층이 켜져 있으면(기관 · 전국 결과 판 없는 화면) 빈 땅 = 그 자리 필지 카드(지도 안) — '자세히' = 아래 기관 필지 카드 */
    if (!S.board && cadOn()) { PC.open(e.lngLat); return; }
    /* 기관 — 지도에서 필지를 누르면 필지 카드(대장 · AI 분석 · 검토 요청) */
    const hl = (S.hitLayers || []).filter((l) => map.getLayer(l));
    const ph = hl.length ? map.queryRenderedFeatures(e.point, { layers: hl })[0] : null;
    if (ph?.properties?.pnu) { openParcel(nowPnu(String(ph.properties.pnu))); return; }
    // 먼 축척: 시군구를 누르면 그 지역으로
    if (map.getZoom() < 9.5 && map.getLayer('sgg-hit') && !S.board) {   // 전국 결과(바퀴 6) = 빛나는 곳을 누르면 그 자리로(board.js) — 시군구 면 누르기 없음
      const f = map.queryRenderedFeatures(e.point, { layers: ['sgg-hit'] })[0];
      const r = f && findRegion(String(f.properties?.code ?? ''));
      if (r) setRegion(r);
    }
  });
  if (!S.board) map.on('mousemove', (e) => { if (e.originalEvent && e.originalEvent.target !== map.getCanvas()) return; if (AN?.active || S.swipe) return; if (S.layers.lxmap) map.getCanvas().style.cursor = cadOn() ? 'pointer' : ''; });
  map.on('zoom', paintCadRow);
  PC = createParcels({ map, host: mainEl, h, K, objLayers, clsName, colorOf: (c) => (BD?.colorOf(clsName(c)) || BD?.colorOf(c) || '#0FA9A0'), unitOf: (c) => BD?.UNIT?.[c] || UNIT_K[c] || '개',
    onMore: S.tenant ? (pnu) => openParcel(pnu) : null });
  for (const l of ['xc-pts', ...S.susLayers.filter((x) => x.endsWith('-s'))]) {
    map.on('mouseenter', l, () => { if (!AN?.active) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { if (!AN?.active) map.getCanvas().style.cursor = ''; });
  }
  if (map.getLayer('sgg-hit')) {
    map.on('mousemove', 'sgg-hit', (e) => { if (AN?.active || S.board || map.getZoom() >= 9.5) return; map.getCanvas().style.cursor = 'pointer'; map.setFilter('sgg-hover', ['==', ['to-string', ['get', 'code']], String(e.features?.[0]?.properties?.code ?? '')]); });
    map.on('mouseleave', 'sgg-hit', () => { if (AN?.active) return; map.getCanvas().style.cursor = ''; map.setFilter('sgg-hover', ['==', ['to-string', ['get', 'code']], '']); });
  }
}

/* ═══ 지역 = 변수 ═══ */
const norm = (s) => String(s || '').replace(/\s+/g, '');
function findRegion(q) {
  const n = norm(q);
  return S.regions.find((r) => r.code === n) || S.regions.find((r) => norm(r.full) === n) || S.regions.find((r) => norm(r.name) === n) || null;
}
/** 다른 화면이 넘긴 시군구 코드(새 12xxx · 옛 46xxx 어느 쪽이든) → 지도 경계의 시군구. 코드 체계가 달라도 이름 + 위치로 맞춘다(지역 고정 0) */
async function regionByCode(code) {
  if (!/^\d{5}$/.test(String(code || ''))) return null;
  try {
    const j = await api('/regions?limit=400');
    const x = (j.items || []).find((it) => it.sgg_cd === code || it.prev_cd === code);
    if (!x) return null;
    return S.regions.find((r) => lastName(r.name) === lastName(x.name) && near(r.bbox, x.bbox)) || null;
  } catch { return null; }
}
/** 기관 세션의 관할 — ① 기관 이름이 시군구 하나면 그곳 ② 아니면(광역 기관) 요약(GET /summary · 기관 범위)에 결과가 있는 시군구
    ③ 그다음 관할(/regions in_scope) 첫 곳. 관할 목록(S.scope)은 '관할 밖' 판정에 쓴다 — 시군구 코드 체계가 달라도(옛 46xxx · 새 12xxx)
    이름 + 위치로 맞춘다. 지역 문자열 하드코딩 0 */
const near = (a, b) => a && b && Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2) < 0.25 && Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2) < 0.25;
const lastName = (s) => String(s || '').trim().split(/\s+/).pop();
function toRegion(x) {
  if (!x) return null;
  const code = String(x.sgg_cd || x.code || '');
  const nm = lastName(x.name || x.region_name);
  return findRegion(code) || S.regions.find((r) => norm(r.name) === norm(nm) && (!x.bbox || near(r.bbox, x.bbox))) || S.regions.find((r) => norm(r.name) === norm(nm)) || null;
}
async function homeRegion() {
  const t = S.who.tenant, nm = t?.name?.ko || S.who.org || '';
  let rs = [];
  const rsP = PRE.regs || K.loadRegions();
  const useRs = (x) => { rs = x || []; const scoped = rs.filter((y) => y.in_scope); S.scope = scoped.length ? scoped : null; return scoped; };
  // 기관 이름이 시군구 하나면 관할 목록(/regions)을 기다리지 않고 바로 그곳 — 관할 목록은 도착하면 채운다(첫 도착이 목록 한 번 늦지 않게 · impl-37)
  const r = findRegion(nm) || S.regions.find((x) => nm && norm(nm).endsWith(norm(x.name)) && norm(nm).includes(norm(x.sido).slice(0, 2)));
  if (r) { rsP.then(useRs, () => {}); return r; }
  let scoped = [];
  try { scoped = useRs(await rsP); } catch { /* */ }
  if (S.regions.length > 1 || scoped.length > 1) return null;   // 광역 기관 = 관할 전체로 도착(시군구는 사용자가 고른다 · 화면이 고르지 않는다)
  if (S.regions.length === 1) return S.regions[0];
  try {
    const sm = await api('/summary');
    const it = (sm.items || []).find((x) => Object.values(x.metrics || {}).some((m) => m && m.value !== null && m.value !== undefined));
    const hr = toRegion(it && { sgg_cd: it.sgg_cd, region_name: it.region_name, bbox: (rs.find((y) => String(y.sgg_cd) === String(it.sgg_cd)) || {}).bbox });
    if (hr) return hr;
  } catch (e) { K.devlog('home', `${e.code || ''} ${e.status ?? 0}`); }
  const d = scoped.find((x) => x.deploys?.length) || scoped[0] || null;
  return toRegion(d) || (d?.bbox ? { code: d.sgg_cd, name: d.name, sido: d.sido, full: d.full, bbox: d.bbox, geometry: null } : null);
}
/** 기관 관할 안인가 — 관할 목록이 있으면 그 안(이름 + 위치), 없으면 첫 화면 지역과 같은 곳만 */
function inScope(r) {
  if (!r) return true;
  if (S.scope) return S.scope.some((x) => String(x.sgg_cd) === r.code || (norm(lastName(x.name)) === norm(r.name) && near(x.bbox, r.bbox)));
  return !S.home || r.code === S.home.code;
}
/* 시군구 코드 별칭 — 지도 경계(시군구 geojson)는 옛 코드(예: 46xxx), 실태조사·결과는 새 코드(12xxx)일 수 있다.
   GET /regions(sgg_cd · prev_cd)로 서로를 잇는다 · 지역 문자열 0 */
const ALIAS = new Map();
function loadAlias(items) {
  for (const x of items || []) {
    const cs = new Set([x.sgg_cd, x.prev_cd].filter(Boolean).map(String));
    // 목록에 옛 코드가 없으면 이름 + 위치로 지도 경계의 시군구를 잇는다
    const r = S.regions.find((y) => y.code === String(x.sgg_cd)) || S.regions.find((y) => lastName(y.name) === lastName(x.name) && near(y.bbox, x.bbox));
    if (r) cs.add(r.code);
    const arr = [...cs]; for (const c of arr) ALIAS.set(c, arr);
  }
}
const codesOf = (r) => (r ? ALIAS.get(String(r.code)) || [String(r.code)] : []);
const inRegion = (cd, r) => codesOf(r).some((c) => String(cd).startsWith(c));
const byCode = (cd) => findRegion(String(cd).slice(0, 5)) || S.regions.find((r) => codesOf(r).includes(String(cd).slice(0, 5))) || null;
const regionEmds = () => (S.region ? S.emds.filter((e) => inRegion(e.cd, S.region)) : S.emds);

/* ═══ 지역 자료: 읍면동 경계 · 결과 층(전국 · 지역 문자열 0) ═══ */
let rdSeq = 0;
const RDPRE = new Map();   // 첫 지역 자료 미리 받기(20초 안 · 한 번만)
function prefetchRegion(r) {
  const c = encodeURIComponent(r.code), q = (p) => { const x = api(p); x.catch(() => {}); return x; };
  // 결과 목록은 탭 저장소 10분 보관(swr — 다시 오면 보관본으로 바로 층을 쌓고 뒤에서 새로 받는다 · 카탈로그 · 집계와 같은 방식)
  const res = S.board ? null : swr('/regions/' + c + '/results').catch(() => null);
  RDPRE.set(r.code, { t: performance.now(), emd: q('/regions/' + c + '/emd'), res });
  // 결과 층 머리(앞 32KB)도 지도 엔진을 기다리지 않고 받기 시작한다 — 지도가 서면 바로 조각을 부른다(impl-38 ximap-boot)
  res?.then((j) => { for (const it of j?.items || []) if (it.kind === 'vector') tileUrl(it).then((u) => warmPm(String(u?.url || '').replace(/^pmtiles:\/\//, '')), () => {}); });
}
async function regionData(r) {
  const my = ++rdSeq;
  S.remd = []; S.remdMeta = null; S.aiUser = false;
  if (S.aiByRegion) { S.layers.ai = false; S.aiByRegion = false; }   // 앞 지역에서 자동으로 켠 AI 분석 층은 지역을 옮기면 되돌린다
  map.getSource('xc-emd')?.setData({ type: 'FeatureCollection', features: [] });
  if (!S.board) clearResultLayers();                 // 전국 결과(바퀴 5) = 결과 층은 전국 결과가 화면 안 시군구만큼 불러 둔다(지역을 옮겨도 그대로)
  if (!r) return;
  const pre = RDPRE.get(r.code); RDPRE.delete(r.code);
  const fresh = pre && performance.now() - pre.t < 20e3 ? pre : null;
  const [emd, res] = await Promise.all([
    (fresh?.emd || api('/regions/' + encodeURIComponent(r.code) + '/emd')).catch((e) => { K.devlog('emd', `${e.code || ''} ${e.status ?? 0}`); return null; }),
    S.board ? null : (fresh?.res || api('/regions/' + encodeURIComponent(r.code) + '/results')).catch((e) => { K.devlog('results', `${e.code || ''} ${e.status ?? 0}`); return null; }),
  ]);
  if (my !== rdSeq) return;
  if (emd) {
    S.remdMeta = { sgg_cd: emd.sgg_cd, prev_cd: emd.prev_cd };
    S.remd = (emd.features || []).map((f) => ({ cd: String(f.properties.emd_cd), nm: f.properties.name, bbox: f.properties.bbox, geometry: f.geometry }));
    map.getSource('xc-emd')?.setData(emd);
    X.emd = S.remd.length;
  }
  if (res) await addResultList(res.items || [], my);
}
function clearResultLayers() {
  for (const it of S.res || []) {
    for (const l of it.ids || []) if (map.getLayer(l)) map.removeLayer(l);
    if (map.getSource(it.sid)) map.removeSource(it.sid);
  }
  S.res = []; S.aiIds = [];
}
async function addResultList(items, my) {
  const out = [];
  for (const it of items) {
    const sid = 'xc-ai-' + String(it.id).replace(/[^\w-]/g, '_');
    if (map.getSource(sid)) continue;
    let spec;
    try { spec = await sourceSpec(it); } catch (e) { K.devlog('result src', String(e?.message || e)); continue; }
    if (my !== rdSeq) return;
    map.addSource(sid, spec);
    const ids = addResultLayers(map, sid, sid, { kind: it.style === 'landcover' ? 'landcover' : 'result', sourceLayer: it.layer, visible: false });
    // 점 결과(해양쓰레기 등 · 면 층에 그려지지 않는 것)
    map.addLayer({ id: sid + '-pt', type: 'circle', source: sid, 'source-layer': it.layer, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' },
      paint: { 'circle-color': '#0FA9A0', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } }, 'slot-result');
    ids.push(sid + '-pt');
    out.push({ ...it, sid, ids });
    if (!(it.id in S.resOn)) S.resOn[it.id] = true;
  }
  S.res = out;
  // 기관 화면: 실태조사가 없는 지역은 AI 분석 결과를 기본으로 켠다 — 지도 위가 비지 않게(LX 화면은 늘 켜져 있다)
  if (S.fc && out.length && !regionEmds().length && !S.layers.ai) { S.layers.ai = true; S.aiByRegion = true; }
  X.results = out.map((x) => x.name?.ko || x.id);
  applyLayers();
  if (S.tool === 'layers') renderLayers();
}

/** soft = 사용자가 지도를 직접 확대 · 이동해 들어온 시군구(XI맵 전국 결과 · 바퀴 5) — 카메라는 그대로 두고 지역만 바꾼다(회백 베일 없음 · 경계선만) */
async function setRegion(r, { first = false, to = null, soft = false, keepDrawer = false } = {}) {
  queueMicrotask(() => cmdk?.sugg?.());                 // 아래 채팅 창 추천 질문 = 지금 지역
  if (NAT && NAT.id !== 'kr') { NAT.go('kr', { quiet: true }); BD?.show(true); }   // 국내 지역으로 가면 나라도 대한민국으로(비행은 아래 한 번)
  S.region = r; S.cond.emd = null; S.sel = null;
  hlKeep(r);                                            // 답 ↔ 지도 강조 — 다른 지역으로 가면 걷는다(원칙 292)
  if (!soft) { if (!keepDrawer) closeDrawer(); closePop(); ED?.close(); }   // keepDrawer = 시군구 · 서비스 목록(원칙 275)에서 고른 이동 — 목록은 열어 둔다
  renderChips();                        // 이전 지역의 읍면동 칩을 바로 지운다(관할 밖 포함)
  if (AN?.running) { AN.detach(); S.tool = null; }      // 진행 중 전역 분석 — 서버 작업은 계속, 화면만 떼어 낸다(돌아오면 이어 보기)
  else if (AN?.active) AN.stop();
  S.outside = !!(S.tenant && r && !inScope(r));
  const u = new URL(location.href);
  if (r) u.searchParams.set('region', r.code); else u.searchParams.delete('region');
  history.replaceState(null, '', u);
  // 초점 층
  const W = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const all = !r && S.tenant && S.regions.length ? { type: 'MultiPolygon', coordinates: S.regions.flatMap((x) => (!x.geometry ? [] : x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates)) } : null;
  const g = r?.geometry || all;                      // 기관 '전체' = 관할 시군구 전부의 경계
  const polys = g ? (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) : [];
  const cw = (ring) => { let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return a < 0 ? ring : [...ring].reverse(); };
  map.getSource('xc-rmask')?.setData(g && !soft && !S.board ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [W, ...polys.map((p) => cw(p[0]))] } } : { type: 'FeatureCollection', features: [] });
  map.getSource('xc-rline')?.setData(g ? { type: 'Feature', properties: {}, geometry: g } : { type: 'FeatureCollection', features: [] });
  S.els.hud.hidden = S.outside || !!GB?.data;
  patchRail();
  searchInput.value = r ? r.name : '';
  // to = 말로 한 읍면동 이동 — 시군구를 거치지 않고 한 번에 그 읍면동으로(동작 끝 신호가 늦지 않게)
  const fly = soft ? Promise.resolve(true)
    : r ? goKeep(to?.bbox || r.bbox, { ms: RM() || first ? 0 : (to?.ms ?? 2400), maxZoom: to?.maxZoom ?? 12.5 })   // 첫 도착 = 날지 않고 그 자리(impl-37)
    : S.tenant && S.scopeBox ? goKeep(S.scopeBox, { ms: RM() || first ? 0 : 2400, maxZoom: 11 })      // 기관 '전체' = 관할 전체 범위
    : stage.home({ ms: first ? 0 : 1600 });
  if (!soft) { const k = (S.flyK = (S.flyK || 0) + 1); S.flying = true; Promise.resolve(fly).finally(() => setTimeout(() => { if (S.flyK === k) S.flying = false; }, 200)); }   // 지역 비행 중에는 손으로 들어온 시군구 판정을 쉰다
  if (S.outside) {
    setPoints([]); regionData(null);
    const d = K.drawer({ title: r.name, host: mainEl, slot: 'right', onClose: () => { S.list = null; patchRail(); } });
    const box = h('div'); K.empty(box, { kind: 'outside', text: '이 기관의 관할 밖입니다', ...(S.home ? { action: { label: S.home.name, onClick: () => setRegion(S.home) } } : S.tenant ? { action: { label: '관할 전체', onClick: () => setRegion(null) } } : {}) });
    d.set(box); S.drawer = d;
    if (!first) await fly;
    return;
  }
  const rd = S.outside ? Promise.resolve() : regionData(r);
  S.rdP = rd;                                           // 읍면동 경계가 도착하는 때(말로 한 읍면동 이동이 기다린다)
  const resumeAfter = () => rd.then(() => (S.region === r && AN && !AN.running ? AN.resume(r) : false)).then((ok) => { if (ok) { S.tool = 'analyze'; patchRail(); } });
  if (first) { X.fly = fly; await refresh(); resumeAfter(); return; }   // 첫 도착: 비행은 뒤에서 계속
  await Promise.all([fly, refresh()]);
  if (S.region === r) paintBoardHud();                 // 도착하면 바로 왼쪽 위 한 줄을 그 시군구로(비행 중 moveend 는 쉬어 2~3초 늦게 바뀌던 것 · 바퀴 16 재검수)
  resumeAfter();
}

/** 전역 분석이 끝나면 서버가 실태조사를 이어 만든다 — 끝날 때까지(최대 30분) 상태를 보고, 끝나면 숫자·목록을 새로 그린다 */
let followT = 0;
function followSurvey(r) {
  if (!r || S.tenant) return;
  clearTimeout(followT);
  const code = S.remdMeta?.sgg_cd || r.code, t0 = Date.now();
  let told = false;
  const tick = async () => {
    if (S.region?.code !== r.code || Date.now() - t0 > 30 * 60e3) return;
    let st = null;
    try { st = await api('/survey/build/' + encodeURIComponent(code)); } catch { /* 아직 없음 */ }
    if (st?.state === 'done' && st.finished_at && Date.parse(st.finished_at) >= t0 - 5000) {
      K.toast('실태조사 결과를 만들었습니다');
      try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('xc:')) sessionStorage.removeItem(k); } catch { /* */ }
      useStats(await api('/survey/stats?by=emd').catch(() => null), await api('/survey/stats?by=rule').catch(() => null));
      patchRail(); refresh(); X.followSurvey = { code, state: 'done', at: new Date().toISOString() };
      return;
    }
    if (!told) { told = true; K.toast('실태조사 결과를 이어서 만듭니다'); }
    X.followSurvey = { code, state: st?.state || 'waiting' };
    followT = setTimeout(tick, 10000);
  };
  followT = setTimeout(tick, 4000);
}

/* ═══ HUD — LX 화면 = AI 분석 결과(요약 한 출처) · 기관 화면 = 실태조사 한 조회(점 · 필지 면 · 막대) ═══ */
/** HUD 한 조회의 질의 — 지역 · 조건에서(프리페치와 refresh 가 같은 문자열을 쓴다) */
function hudQuery(region, cond) {
  const p = new URLSearchParams({ priority: 'A', state: 'open,assigned', limit: '2000', sort: 'score' });
  const emds = cond.emd ? [cond.emd] : region ? S.emds.filter((e) => inRegion(e.cd, region)) : null;
  if (emds && !emds.length) return { p: null, emds };
  if (emds) p.set('emd_cd', emds.map((e) => e.cd).join(','));
  p.set('rule', cond.rule || 'R1,R2,R3,R4,R5,R6');   // 기관 화면 큰 숫자 = 실태조사 규칙 R1–R6(서버 field_check 와 같은 범위 · 대장 규칙은 첫 화면 대장 대조에서)
  return { p, emds };
}
let seq = 0;
const RETRY = 2, RETRY_MS = 1500;
/** 잠깐 끊긴 것(네트워크 · status 0 · 5xx)만 다시 부른다. 4xx 는 다시 불러도 같다 */
const transient = (e) => !e?.status || e.status >= 500;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
/** HUD 큰 숫자 상태: wait(조회 중 · 빈 자리) · fail(— · 문장 없음) · empty(서버가 0/결과 없음) · counting(실태조사를 만드는 중 · '집계 중') · ok */
function hudState(big, st, env, unit) {
  hudBig.dataset.st = st;
  if (st === 'ok') { big.set(env, unit ? { unit } : {}); return; }
  big.set(null);
  const none = hudBig.querySelector('.k-big-none'), num = hudBig.querySelector('.k-big-row > span');
  if (none && st === 'counting') none.textContent = '집계 중';
  if (none) none.hidden = st !== 'empty' && st !== 'counting';
  if (num && st === 'wait') num.textContent = '';
}
let failToast = null;
function hudFailed(my) {
  if (my !== seq) return;
  const big = hudBig.__big;
  S.aiHas = null; hudState(big, 'fail'); drawBars([]); setPoints([]); S.last = null; S.need = null; S.hudFail = true;
  SH.fresh(null); renderChips();
  if (S.list) openList();
  failToast = K.toast('현황을 불러오지 못했습니다', { ms: 12000, action: { label: '다시 시도', onClick: () => refresh() } });
}
async function refresh() {
  if (S.outside) return;
  const my = ++seq;
  failToast?.close(); failToast = null;
  if (!S.fc) return refreshAI(my);
  const where = S.cond.emd ? S.cond.emd.nm : S.region ? S.region.name : S.tenant ? String(S.who.tenant?.name?.ko || S.who.org || '').trim().split(/\s+/).pop() || '관할 전체' : '전국';
  const label = `현장 확인 필요 · ${where}`;
  const scope = (S.cond.emd?.cd || S.region?.code || 'KR') + (S.cond.rule ? ':' + S.cond.rule : '');
  S.els.hud.dataset.scope = scope;
  const big = hudBig.__big || (hudBig.__big = K.bignum(hudBig, null, { label: '현장 확인 필요', unit: '필지', hud: true }));
  const setLab = (t) => { const lab = hudBig.querySelector('.k-big-l'); if (lab) { lab.textContent = t; lab.append(h('span.xc-where', { text: ` · ${where}` })); } };
  // 지역 대표 수치(조건 없음)는 요약 한 곳(GET /summary)에서만 — 읍면동 · 규칙 조건일 때만 현장 확인 목록에서 센다
  S.suspectOnly = null;
  const sumP = !S.cond.emd && !S.cond.rule ? summaryBig(S.region) : Promise.resolve(undefined);
  if (hudBig.dataset.shown !== scope) setLab('현장 확인 필요');
  // 범위가 바뀌었거나 아직 숫자가 없으면 조회 중엔 빈 자리(얇은 자리표) — '결과 없음'을 먼저 보이지 않는다
  if (hudBig.dataset.shown !== scope || hudBig.dataset.st !== 'ok') { hudState(big, 'wait'); drawBars([]); }
  hudBig.hidden = false;
  S.hudFail = false;
  let j = null, q = null;
  for (let t = 0; ; t++) {
    try {
      if (S.statsFailed || S.rulesFailed) {           // 집계 조회가 실패했으면 먼저 다시 받는다
        const [e, r] = await Promise.all([
          S.statsFailed ? api('/survey/stats?by=emd') : null,
          S.rulesFailed ? api('/survey/stats?by=rule').catch(() => ({ items: [], failed: true })) : null,
        ]);
        useStats(e, r);
        if (my !== seq) return;
      }
      // 어느 시군구가 실태조사를 만드는 중이면 전국 집계 칸이 비어 온다 — 지금 시군구 칸만 따로 받는다(그 시군구가 만드는 중이면 '집계 중')
      S.regionBuilding = false;
      if (S.statsBuilding && S.region && !regionEmds().length) {
        S.regionBuilding = (await regionStats(S.region)) === 'building';
        if (my !== seq) return;
      }
      q = hudQuery(S.region, S.cond);
      if (!q.p) break;                                  // 서버가 이 지역 읍면동을 돌려주지 않음 = 결과 없음
      j = await findings(q.p.toString());
      break;
    } catch (e) {
      K.devlog('findings', `${e.code || e.name || ''} ${e.status ?? 0} (시도 ${t + 1})`);
      if (my !== seq) return;
      if (t >= RETRY || !transient(e)) { hudFailed(my); return; }
      await pause(RETRY_MS);
      if (my !== seq) return;
    }
  }
  if (my !== seq) return;
  const sb = await sumP;                               // undefined = 요약 조회 불가(목록에서 센 값으로) · null = 요약에 결과 없음
  if (my !== seq) return;
  const has = !!(j && (j.items?.length || j.total?.value > 0));
  if (has) {
    const pnus = new Set(j.items.map((f) => f.pnu));
    const total = j.total?.value ?? j.items.length, exact = j.items.length >= total;
    const need = exact ? pnus.size : Math.round(pnus.size * (total / Math.max(1, j.items.length)));
    S.need = { value: need, unit: '필지', basis: exact ? (j.total?.basis || 'inferred') : 'estimate', as_of: j.as_of || S.asOf || '', source: 'AI 실태조사 결과', note: '현장 확인 전' };
    S.last = j;
    K.devlog('hud', `${q.p} → ${need}필지 (findings ${total})`);
    const by = {}; for (const f of j.items) (by[f.rule] ||= new Set()).add(f.pnu);
    drawBars(Object.entries(by).map(([k, v]) => ({ k, n: v.size })));
    setPoints(j.items);
  } else { S.last = null; S.need = null; drawBars([]); setPoints([]); }
  const susSrc = sb || (S.suspectOnly && !S.cond.emd && !S.cond.rule ? S.suspectOnly : null);
  paintSus(susSrc && !S.cond.emd && !S.cond.rule ? susSrc : null);
  // 요약에 없는 지역(배포 전 · 말로 낸 전역 분석 뒤 실태조사만 있는 곳)은 현장 확인 목록에서 센 값으로 — 결과가 있는데 '결과 없음'으로 보이지 않게
  const pickBig = sb ? sb : (has ? { env: S.need, label: '현장 확인 필요', unit: '필지' } : null);
  if (sb) { if (sb.label === '현장 확인 필요') S.need = sb.env; K.devlog('summary', `${S.region?.code || 'KR'} → ${sb.label} ${sb.env.value}`); }
  if (pickBig) {
    setLab(pickBig.label);
    hudState(big, 'ok', pickBig.env, pickBig.unit);
    X.hud = { label: `${pickBig.label} · ${where}`, n: pickBig.env.value, total: j?.total?.value ?? 0, query: q?.p?.toString() || null, from: sb ? 'summary' : 'findings' };
  } else if (S.regionBuilding || (S.statsBuilding && !S.region)) {   // 실태조사를 만드는 중 — '결과 없음'이 아니라 '집계 중'(끝나면 watchStats 가 다시 그린다)
    setLab('현장 확인 필요');
    hudState(big, 'counting');
    X.hud = { label, n: null, total: 0, state: 'counting', query: q?.p?.toString() || null, from: 'stats' };
    watchStats();
  } else {                                            // 서버가 0/결과 없음을 돌려줌 → 이때만 '아직 결과가 없습니다'
    setLab('현장 확인 필요');
    hudState(big, 'empty');
    X.hud = { label, n: 0, total: 0, query: q?.p?.toString() || null, from: sb === null ? 'summary' : 'findings' };
  }
  hudBig.dataset.shown = scope;
  SH.fresh(j || sb ? new Date() : null);
  renderChips();
  if (S.list) openList();
}
/** LX 화면 HUD — AI 분석 결과(원칙 135 · 10-09). 지역 대표 수치 = GET /summary?region= 의 AI 탐지 중 업무 결과로 센 것(aiResult · 서비스 상세 ·
    결과 확인 · 분석하기 카드와 같은 출처). 셈 단위는 서버 값 그대로(필지 · 동 · 건) · 다른 단위끼리 더하지 않는다. 아래 한 줄 = 그 숫자의 서비스 이름 */
async function refreshAI(my) {
  if (S.board) return refreshBoard(my);   // 전국 결과(바퀴 5) — 큰 숫자 없이 지도 위 결과 + 한 칸(전국 · 지금 시군구)
  loadGovBoard();
  if (GB?.data) { HUDKEY = ''; paintBoardHud(); S.els.hud.hidden = true; }   // 기관(원칙 277): 관할 장부가 있으면 LX 와 같은 한 줄 'OO · n 서비스 제공중'(큰 숫자 'AI 분석 결과'는 걷는다 — 같은 이름 숫자가 두 곳에 있지 않게)
  else { if (hudBoard) hudBoard.hidden = true; S.els.hud.hidden = false; }
  const where = S.region ? S.region.name : '전국';
  const scope = S.region?.code || 'KR';
  S.els.hud.dataset.scope = scope;
  const big = hudBig.__big || (hudBig.__big = K.bignum(hudBig, null, { label: AI_LABEL, hud: true }));
  const setLab = () => { const lab = hudBig.querySelector('.k-big-l'); if (lab) { lab.textContent = AI_LABEL; lab.append(h('span.xc-where', { text: ` · ${where}` })); } };
  if (hudBig.dataset.shown !== scope) setLab();
  if (hudBig.dataset.shown !== scope || hudBig.dataset.st !== 'ok') hudState(big, 'wait');
  S.last = null; S.need = null; S.suspect = null; drawBars([]); setPoints([]); S.aiHas = undefined;
  hudBig.hidden = false;
  S.hudFail = false;
  let j = null;
  for (let t = 0; ; t++) {
    try {
      const pre = !S.region && t === 0 ? PRE.sum : null; PRE.sum = null;   // 미리 부른 전국 요약은 첫 번 한 번만
      j = await (pre || api('/summary' + (S.region ? '?' + new URLSearchParams({ region: S.region.code }) : ''))); break;
    }
    catch (e) {
      K.devlog('summary', `${e.code || e.name || ''} ${e.status ?? 0} (시도 ${t + 1})`);
      if (my !== seq) return;
      if (t >= RETRY || !transient(e)) { hudFailed(my); return; }
      await pause(RETRY_MS);
      if (my !== seq) return;
    }
  }
  if (my !== seq) return;
  const r = aiResult(j);
  S.aiHas = !!r; applyLayers(); if (S.tool === 'layers') renderLayers();   // 글이 정해지면 층도 같은 판정으로
  setLab();
  hudSus.replaceChildren(); delete hudSus.dataset.v; delete hudSus.dataset.metric;
  if (r) {
    hudState(big, 'ok', r.env, r.unit);
    const n = r.names.length + r.others;
    const svc = r.names[0] ? r.names[0] + (n > 1 ? ` 외 ${n - 1}개 서비스` : '') : '';
    if (svc) hudSus.append(h('span', { text: svc }));
    hudSus.hidden = !svc;
    if (!(GB?.data && !S.board)) X.hud = { label: `${AI_LABEL} · ${where}`, n: r.env.value, unit: r.unit, total: r.env.value, from: 'summary' };
    K.devlog('hud', `${scope} → ${AI_LABEL} ${r.env.value}${r.unit} (${r.names.join(', ')})`);
  } else {
    hudState(big, 'empty'); hudSus.hidden = true;
    if (!(GB?.data && !S.board)) X.hud = { label: `${AI_LABEL} · ${where}`, n: 0, total: 0, from: 'summary' };
  }
  hudBig.dataset.shown = scope;
  SH.fresh(j ? new Date() : null);
  renderChips();
}
/* ═══ 전국 결과(바퀴 5 · 원칙 196 10-11 18:52 고침) — 열자마자 지도에 바로 ═══
   한 번 호출(GET /ximap/board)로 시군구 × 서비스 결과를 칠하고(멀리서 = 서비스 색 · 면적당 진하기), 가까이 가면 화면 안 시군구의 객체를 그린다.
   객체를 누르면 그 자리에서 고친다(edit.js). 영상은 오른쪽 위 작은 전환 단추(최신 영상 · 분석한 영상). */
const shortDate = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`; };
const ev = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
function mountBoard() {
  // 시군구 경계(떠오르기 · 누르기) — 지도 경계 그대로(코드 · 이름만)
  const sggFC = { type: 'FeatureCollection', features: S.regions.filter((r) => r.geometry).map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { code: r.code, name: r.name } })) };
  BD = createBoard({ map, host: mainEl, h, sgg: sggFC,
    regionOf: (r) => findRegion(r.sgg_cd) || (r.prev_cd && findRegion(r.prev_cd)) || S.regions.find((x) => lastName(x.name) === lastName(r.name) && near(x.bbox, r.bbox)) || null,
    regionRows: (code) => regionRows(findRegion(code)),
    onRegion: (code) => { const r = findRegion(code); if (r) openRegion(r); },
    onCell: (p, at) => pinCell(p, at),
    onMiss: () => unpin(),
    onFly: () => { closePop(); ED?.close(); unpin(); },
    onSets: (list) => {
      S.res = list;
      for (const it of list) S.resOn[it.id] = !it.off;
      X.results = list.map((x) => x.name?.ko || x.id);
      applyLayers();
      if (S.tool === 'layers') renderLayers();
      ED?.live(list.map((x) => x.set));
    },
    onLoad: (j) => { X.board = { regions: ev(j.n_regions), services: j.services.length, at: Math.round(performance.now() - X.t0), centers: j.regions.filter((r) => r.center).map((r) => r.center), nat: BD.natInfo, hot: BD.hot() }; paintBoardHud(); } });
  BD.busy = () => !!(AN?.active || S.swipe || ED?.busy || DS?.on);
  userColorsToKit();                                                          // 기억한 색으로 시작(색 바꾸기 · 원칙 264)
  map.on('styledata', schedulePaint);                                         // 새로 붙는 결과 층(화면 안 시군구 · 전국 결과 객체)도 같은 색으로
  BD.nat.onData = () => { if (BD.data) paintBoardHud(); };   // 진행 장부를 다시 읽으면(30초) 합계 · '지금 분석 중' 한 줄을 새로
  S.boardP = BD.load(PRE.board || boardPromise(true), PRE.nat).catch((e) => { K.devlog('board', String(e?.message || e)); return null; });
  const canEdit = ['lx/staff', 'lx/admin'].includes(S.key);
  ED = createEditor({ map, host: mainEl, h, K, canEdit, setImagery, colorFor, hideOrig, clsName, parcelLine: (ll) => PC?.line(ll), onParcel: (ll) => PC?.open(ll),
    onEdited: () => { clearTimeout(S.reloadT); S.reloadT = setTimeout(() => BD.reload(), 400); } });
  mountObjectHover();
  imageryToggle();
  // 객체 누르기(가까이) — 결과 층의 면 · 점 · 전국 결과 객체(줌 11+ · 원칙 243 — 같은 칸 · 같은 동작) · 고친 자리
  // 한 점에 둘 이상이 겹치면 작은 고르기 목록(클래스 색 점 · 클래스 · 면적)에서 고른 것만 그 자리 고치기 칸으로(10-15 사용자 "객체 겹친것들은 어떻게 하지?")
  map.on('click', (e) => {
    if (!S.board || AN?.active || S.swipe || ED.busy || DS?.on || map.getZoom() < BD.NEAR_Z) return;
    const hs = objectsAt(e.point);
    if (!hs.length) { closePicker(); if (cadOn()) { closePop(); unpin(); ED.close(); PC.open(e.lngLat); } return; }   // 지적 층 켜짐 · 빈 땅 = 그 필지 카드
    closePop(); unpin(); closePicker(); PC?.close();
    if (hs.length === 1) { openObject(hs[0], e.lngLat); return; }
    pickObject(hs, e.lngLat);
  });
  // 전국 결과의 고친 자리(줌 11+) — 화면 범위로(묶음이 많아 범위로 묻는다)
  map.on('moveend', () => {
    if (!S.board) return;
    const on = map.getZoom() >= BD.nat.OBJ_Z - 0.5 && BD.nat.assets.length;
    const g = map.getBounds();
    ED.liveBox(on ? [g.getWest(), g.getSouth(), g.getEast(), g.getNorth()] : null);
  });
  // 손으로 한 단계 넘게 멀어지면 누른 자리 말풍선을 닫는다(옮기기만 하면 그대로 따라감)
  map.on('zoomend', (e) => { if (e.originalEvent && PIN && map.getZoom() < PIN.z - 0.8) unpin(); });
  // 손으로 확대 · 이동해 들어온 시군구 = 지금 지역(카메라는 그대로) · 멀리 나오면 전국
  map.on('moveend', () => {
    if (!S.board || S.flying || DS?.on || NAT?.id && NAT.id !== 'kr' || AN?.running) return;
    const z = map.getZoom(), c = map.getCenter();
    if (z < 8.2) { unpin(); if (S.region) setRegion(null, { soft: true }); else paintBoardHud(); return; }
    const pt = [c.lng, c.lat];
    const r = S.regions.find((x) => x.bbox && pt[0] >= x.bbox[0] && pt[0] <= x.bbox[2] && pt[1] >= x.bbox[1] && pt[1] <= x.bbox[3]
      && (x.geometry?.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry?.coordinates || []).some((poly) => inRing(pt, poly[0])));
    if (r && r.code !== S.region?.code) setRegion(r, { soft: true }); else paintBoardHud();
  });
}
/** 지금 시군구의 전국 결과 줄(없으면 null) — 지도 경계(옛 코드)와 결과 장부(지금 코드)를 별칭으로 잇는다 */
const boardRegion = (r) => (r && boardData() ? boardData().regions.find((x) => codesOf(r).includes(x.sgg_cd) || (x.prev_cd && codesOf(r).includes(x.prev_cd)) || (lastName(x.name) === lastName(r.name) && near(x.bbox, r.bbox))) || null : null);
async function refreshBoard(my) {
  hudBig.hidden = true; hudSus.hidden = true; S.els.hud.hidden = true;
  if (!S.board) return;
  await S.boardP;
  if (my !== seq) return;
  paintBoardHud();
  SH.fresh(BD?.data ? new Date() : null);
  renderChips();
}
/** 전국 분석이 끝낸 읍면동의 이 시군구 합 — 'wait'(받는 중) · 값 · null(받지 못함). 1분 보관 · 받으면 지도 안 글자 · 말풍선을 다시 그린다 */
const NATR = new Map();
function natRegion(r) {
  const key = codesOf(r).join(',');
  if (!key) return null;
  const c = NATR.get(key);
  if (!c || (!c.busy && Date.now() - c.t >= 60000)) loadNatRegion(key);
  return c && 'j' in c ? c.j : 'wait';
}
function loadNatRegion(key) {
  const prev = NATR.get(key); NATR.set(key, { ...(prev && 'j' in prev ? { j: prev.j } : {}), busy: true, t: prev?.t || 0 });
  api('/national/region?' + new URLSearchParams({ codes: key })).then((j) => NATR.set(key, { j: j?.assets ? j : null, t: Date.now() }))
    .catch(() => NATR.set(key, { j: prev && 'j' in prev ? prev.j : null, t: Date.now() }))
    .finally(() => { BD?.rehover?.(); if (S.region && codesOf(S.region).join(',') === key) paintBoardHud(); if (PIN?.code && findRegion(PIN.code) && codesOf(findRegion(PIN.code)).join(',') === key) PIN.redraw?.(); });
}
/** 한 시군구의 여러 업무 숫자 — 서비스 결과 장부(GET /ximap/board) + 전국 분석 진행 장부(GET /national/region). 지어낸 숫자 0.
    → { rows: [{ k(업무 · 거르기 열쇠), name(화면 이름), n, unit }], wait } */
function regionRows(r) {
  if (!r) return { rows: [], wait: false };
  const br = boardRegion(r), nr = natRegion(r), rows = [];
  for (const x of br?.items || []) { const n = ev(x.n); if (n > 0) rows.push({ k: taskOf(x.name), name: x.name, n, unit: BD.UNIT[taskOf(x.name)] || '개' }); }
  if (nr && nr !== 'wait') for (const [a, A] of Object.entries(nr.assets || {})) {
    if (!(ev(A.done) > 0)) continue;
    for (const cls of NCLS[a] || []) {
      const c = A.counts?.[cls], n = ev(c?.n); if (!(n > 0)) continue;
      rows.push({ k: cls, name: `${cls}(${A.name})`, n, unit: c.unit || BD.UNIT[cls] || '개' });
    }
  }
  rows.sort((p, q) => q.n - p.n);
  return { rows, wait: nr === 'wait' };
}
/** 전국 합계 — 서비스 결과 장부 + 전국 분석(자산마다 한 분류씩 · 겹쳐 세지 않게) · task = 그 업무만(XI ChatGEO 업무 거르기 답과 같은 셈) */
function boardTotal(task = null) {
  const d = BD?.data, nd = BD?.nat?.data;
  let n = 0;
  for (const s of d?.services || []) if (!task || taskOf(s.name) === task) n += ev(s.n);
  for (const [a, A] of Object.entries(nd?.assets || {})) {
    if (A.on === false) continue;
    for (const cls of NCLS[a] || []) if (!task || cls === task) n += ev(A.counts?.[cls]?.n);
  }
  return n;
}
/* ═══ 지도 안 왼쪽 위 글자(원칙 233 · 237 → 10-17 원칙 271) — 흰 글씨 한 줄 'OO 시군구 · OO 서비스 제공중'.
   시군구 = 지금 지도에 보이는, 결과가 있는 시군구 수(서비스 결과 장부 /ximap/board 의 regions · 지도 범위와 겹치는 것 · 아무것도 안 보이면 전국 전체) ·
   서비스 = 그 시군구들에 제공 중인 서비스 가짓수(장부의 서비스 · 전역 분석은 세지 않음 — 메인 '서비스 n가지'와 같은 셈). 시군구로 들어가면 그 이름 · 그곳 서비스 수.
   지어낸 숫자 0 · 지역 하드코딩 0 · 큰 숫자 · 업무 줄 · 설명 글 없음(원칙 230). 업무 거르기 중이면 그 아래 '원래대로' 칩 하나. ═══ */
let HUDKEY = '';
let GB = null;   // 기관 계정의 서비스 결과 장부(GET /ximap/board · 서버가 관할 시군구만 · 결과 층 주소 없이 내준다 · 원칙 277) — LX 는 BD.data
const boardData = () => BD?.data || GB?.data || null;
function loadGovBoard() {
  if (S.board || !S.tenant || GB) return;
  GB = { data: null };
  api('/ximap/board').then((j) => { GB = { data: j?.regions ? j : null }; X.govBoard = j ? { regions: (j.regions || []).map((r) => r.name), services: (j.services || []).length, layerLeak: (j.regions || []).some((r) => (r.items || []).some((it) => it.layer)) } : null; HUDKEY = ''; paintBoardHud(); if (GB.data && S.els?.hud) S.els.hud.hidden = true; })
    .catch(() => { GB = { data: null }; });
}
/** 서비스 결과 장부에서 — 지도 범위와 겹치는 시군구 · 그곳들의 서비스 가짓수(전역 분석 제외) */
function hudCounts(d, region) {
  const analysis = new Set((d.services || []).filter((x) => x.kind === 'analysis').map((x) => x.id));
  const svcOf = (regs) => { const m = new Map(); for (const r of regs) for (const it of r.items || []) { if (analysis.has(it.svc)) continue; const s = m.get(it.svc) || { id: it.svc, name: it.name, n: 0 }; s.n += ev(it.n); m.set(it.svc, s); } return m; };
  if (region) { const br = boardRegion(region); const regs = br ? [br] : [], svcs = svcOf(regs); return { regions: 1, services: svcs.size, regs, svcs }; }
  let regs = d.regions || [];
  try {
    const b = map.getBounds(), w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
    const vis = regs.filter((r) => Array.isArray(r.bbox) && r.bbox.length === 4 && r.bbox[0] <= e && r.bbox[2] >= w && r.bbox[1] <= n && r.bbox[3] >= s);
    if (vis.length) regs = vis;
  } catch { /* 지도 전 */ }
  regs = regs.filter((r) => (r.items || []).some((it) => !analysis.has(it.svc)));   // '서비스 제공중'인 시군구만(전역 분석만 있는 곳은 세지 않음 — 목록(원칙 275)과 같은 수)
  const svcs = svcOf(regs);
  return { regions: regs.length, services: svcs.size, regs, svcs };
}
/** 왼쪽 위 한 줄을 누르면(10-17 원칙 273) — 같은 장부 값(/ximap/board)으로 지도 위 통계 1단계 사양을 만든다: 시군구 순위(지도 색) · 서비스별 수. 전국이면 시군구 면이 차오르고, 시군구 안이면 서비스별만 */
function boardSpec() {
  const d = boardData(); if (!d) return null;
  const region = S.region && map.getZoom() >= 8.2 ? S.region : null;
  const { regions, services, regs, svcs } = hudCounts(d, region);
  const tot = regs.reduce((t, r) => t + ev(r.n), 0);
  const title = region ? `${region.name} · ${nf(services)} 서비스 제공중` : `${nf(regions)} 시군구 · ${nf(services)} 서비스 제공중`;
  const svcList = [...svcs.values()].sort((a, b) => b.n - a.n);
  const lastOf = (id) => { let t = ''; for (const r of regs) for (const it of r.items || []) if (it.svc === id && (it.finished_at || '') > t) t = it.finished_at; return t ? t.slice(0, 10) : '—'; };
  const regsOf = (id) => regs.filter((r) => (r.items || []).some((it) => it.svc === id)).length;
  // 판 · 보고서(.hwpx) 표 제목은 그대로 쓰이므로 분명하게(원칙 274)
  const panels = [{ type: 'bar', title: '서비스별 서비스 결과 수', unit: '개', rows: svcList.map((s) => ({ k: s.id, label: s.name, v: s.n })) },
    { type: 'table', title: region ? `${region.name} 제공 중인 서비스` : '제공 중인 서비스', cols: region ? ['서비스', '서비스 결과', '마지막 분석'] : ['서비스', '시군구', '서비스 결과', '마지막 분석'], num: region ? [1] : [1, 2],
      rows: svcList.map((s) => (region ? [s.name, s.n, lastOf(s.id)] : [s.name, regsOf(s.id), s.n, lastOf(s.id)])) }];
  const say = region ? [`${region.name}에 제공 중인 서비스는 ${nf(services)}가지, 서비스 결과는 ${nf(tot)}개입니다.`]
    : [`지금 지도에 보이는 시군구 ${nf(regions)}곳에 서비스 ${nf(services)}가지를 제공 중입니다.`, ...(regs.length ? [`서비스 결과가 가장 많은 곳은 ${[...regs].sort((a, b) => ev(b.n) - ev(a.n))[0].name} ${nf(ev([...regs].sort((a, b) => ev(b.n) - ev(a.n))[0].n))}개입니다.`] : [])];
  // 숫자 이름: '서비스 결과'(서비스 결과 장부의 객체 수) — 왼쪽 위 옛 큰 숫자 'AI 분석 결과'(전국 분석까지 합)와 다른 셈이라 같은 이름을 쓰지 않는다(규칙 3)
  const kpis = [{ label: '서비스 결과', value: tot, unit: '개' }, ...(region ? [] : [{ label: '시군구', value: regions, unit: '곳' }]), { label: '서비스', value: services, unit: '가지' }];
  let mp = null;
  if (!region) {
    const values = {}, labels = {};
    for (const r of regs) { values[r.sgg_cd] = ev(r.n); labels[r.sgg_cd] = r.name; }
    mp = { level: 'sgg', values, labels, title: '서비스 결과', unit: '개', scale: { kind: 'seq', hue: 'teal', min: 0, max: Math.max(1, ...Object.values(values)) }, meaning: '시군구마다 서비스 결과 수' };
    panels.unshift({ type: 'rank', title: '제공 중인 시군구 — 서비스 결과 수', unit: '개', rows: regs.map((r) => ({ k: r.sgg_cd, label: r.name, v: ev(r.n) })).sort((a, b) => b.v - a.v) });
  }
  return { kind: 'board', rule: [], title, means: [['지역', region ? region.name : '전국'], ['업무', '모든 업무'], ['비교', region ? '서비스' : '서비스 · 시군구']], fuse: ['서비스 결과 장부'],
    kpis, panels, map: mp, say, sgg: region ? codesOf(region)[0] : null, main: { label: '서비스 결과', value: tot, unit: '개' } };
}
function openBoardStats() { const s = boardSpec(); if (!s || !OM) return; LASTSPEC = s; setStep(1, { fresh: true }); }
X.boardSpec = () => boardSpec();   // 실증 기록용(화면엔 없음)
/* ═══ 왼쪽 위 한 줄 누르기(10-17 원칙 275 — "시군구/행정서비스가 무엇이 있는지를 아는게 중요하겠지 그걸 클릭하면 결과가 표출") ═══
   오른쪽 서랍에 '시군구 → 제공 중인 서비스' 목록(지금 지도 범위 · 한 줄 숫자와 같은 /ximap/board). 서비스를 누르면 그 시군구로 날아가 그 서비스 결과만 지도에(업무 거르기 · 기관 화면은 그 결과 층만 켬).
   시군구 이름을 누르면 그곳으로. 설명 글 0 · 서랍 폭 고정(길면 서랍 안에서 스크롤). 순위 · 숫자 통계는 기존 '통계' 단계 그대로(여기 기본 동작 아님). */
function boardRegs() {
  const d = boardData(); if (!d) return null;
  const region = S.region && map.getZoom() >= 8.2 ? S.region : null;
  const analysis = new Set((d.services || []).filter((x) => x.kind === 'analysis').map((x) => x.id));
  const { regs, services, regions } = hudCounts(d, region);
  const svcRows = (reg) => (reg.items || []).filter((it) => !analysis.has(it.svc));
  return { region, regs: regs.filter((reg) => svcRows(reg).length), services, regions, svcRows };
}
const regOf = (reg) => findRegion(reg.sgg_cd) || (reg.prev_cd && findRegion(reg.prev_cd)) || findRegion(reg.name) || null;
let BL = null;   // 목록 상태 { sido: 고른 시도, sgg: 펼친 시군구 코드 | null } — 서랍이 열려 있는 동안만(10-17 원칙 280 "단계를 나눠야겠다" → 10-18 '이 안' = 한 화면 2단)
/** 기본 시도 — 지금 시군구 안이면 그 시도 · 아니면 시군구가 가장 많은 시도(같으면 앞) */
function defaultSido(B, sidos) {
  const cur = B.region ? B.regs.find((reg) => regOf(reg)?.code === B.region.code) : null;
  if (cur) return cur.sido || '—';
  let best = sidos[0], n = -1;
  for (const sd of sidos) { const k = B.regs.filter((reg) => (reg.sido || '—') === sd).length; if (k > n) { best = sd; n = k; } }
  return best;
}
/* 목록 보는 순서(10-18 '서비스로 보기') — 'region' 지역 먼저(시도 → 시군구 → 서비스) · 'svc' 서비스 먼저(서비스 → 그 서비스가 있는 시군구) · 계정별 서버 사용자 설정 GET|PUT /me/prefs/xi-clean.list */
let BMODE = 'region', BSVC = null, bmodeP = null;
const dMD = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(String(iso)) ? String(iso).slice(5, 10).replace('-', '.') : '');   // '10.12' — 기록에 있는 날짜만(없으면 빈 글)
const lastAt = (items) => { let t = ''; for (const it of items) if ((it.finished_at || '') > t) t = it.finished_at; return t; };   // 서비스 줄들 중 가장 늦은 분석 끝난 시각
function bmodeLoad() {
  if (bmodeP) return bmodeP;
  bmodeP = api('/me/prefs/xi-clean.list').then((j) => { const m = j?.options?.mode; if (m === 'svc' || m === 'region') BMODE = m; }, () => {});
  return bmodeP;
}
function bmodeSave() { api('/me/prefs/xi-clean.list', { method: 'PUT', body: { mode: BMODE } }).then(() => { X.boardMode = { saved: BMODE }; }, () => {}); }
function openBoardList() {
  const B = boardRegs(); if (!B) return;
  bmodeLoad().then(() => { if (BMODE === 'svc' && S.drawer && S.drawer.__kind === 'board' && BL) renderBoardList(S.drawer, boardRegs() || B); });
  const d = S.drawer && S.drawer.__kind === 'board' ? S.drawer : drawerOpen('', () => { S.list = null; BL = null; });
  d.__kind = 'board'; S.list = null; patchRail();
  if (!B.regs.length) { boardTitle(d, [`${nf(B.regions)} 시군구`, `${nf(B.services)} 서비스 제공중`]); const box = h('div.xc-list.xc-board'); K.empty(box, { kind: 'first', text: '이 범위에 제공 중인 서비스가 없습니다' }); d.set(box); return; }
  // 처음: 시군구 안이면 그 시도 · 그 시군구가 펼쳐진 채 · 시군구가 하나뿐인 시도(기관 화면)도 바로 펼침
  const cur = B.region ? B.regs.find((reg) => regOf(reg)?.code === B.region.code) : null;
  const sidos = [...new Set(B.regs.map((reg) => reg.sido || '—'))];
  if (!BL || !sidos.includes(BL.sido)) { const sido = defaultSido(B, sidos); const inS = B.regs.filter((reg) => (reg.sido || '—') === sido); BL = { sido, sgg: cur ? cur.sgg_cd : inS.length === 1 ? inS[0].sgg_cd : null }; }
  else if (cur && BL.sgg && BL.sgg !== cur.sgg_cd) BL = { sido: cur.sido || '—', sgg: cur.sgg_cd };
  renderBoardList(d, B);
}
/** 서랍 제목 두 구 — 줄바꿈은 '·' 경계에서만(구 중간 꺾임 0 · §3-9) · 한 줄 */
function boardTitle(d, parts) {
  const tEl = d.el.querySelector('.k-dr-t'); if (!tEl) return;
  tEl.replaceChildren(h('span.xc-nb', { text: parts[0] }), ' · ', h('span.xc-nb', { text: parts[1] })); tEl.classList.add('xc-board-t');
  d.el.setAttribute('aria-label', parts.join(' · '));
}
/** 한 화면 2단(10-18 사용자 '이 안') — 길잡이 줄(전국 › 시도 › 시군구) · 위 시도 칩 줄(이름 · 시군구 수 · 옆으로 밀기 · 시도가 하나면 없음 = 기관 화면은 관할만) ·
    아래 고른 시도의 시군구 칩 격자(이름 · 서비스 수) · 시군구 칩을 누르면 그 자리에서 서비스 줄이 펼쳐지고(그곳으로 날아감) · 서비스를 누르면 그 결과만 지도에. 단계를 넘기지 않는다 · 설명 글 0 */
function renderBoardList(d, B) {
  const sidoOf = (reg) => reg.sido || '—';
  const sidos = [...new Set(B.regs.map(sidoOf))];
  const svcN = (regs) => new Set(regs.flatMap((reg) => B.svcRows(reg).map((it) => it.svc))).size;
  if (!sidos.includes(BL.sido)) BL = { sido: defaultSido(B, sidos), sgg: null };
  const inSido = B.regs.filter((reg) => sidoOf(reg) === BL.sido);
  const reg3 = BL.sgg ? inSido.find((reg) => reg.sgg_cd === BL.sgg) : null;
  if (BL.sgg && !reg3) BL = { sido: BL.sido, sgg: null };
  boardTitle(d, sidos.length > 1 ? [`${nf(B.regions)} 시군구`, `${nf(B.services)} 서비스 제공중`] : [BL.sido, `${nf(inSido.length)} 시군구 · ${nf(svcN(inSido))} 서비스`]);
  const box = h('div.xc-list.xc-board.xc-board--2');
  const flip = () => { BMODE = BMODE === 'svc' ? 'region' : 'svc'; bmodeSave(); BSVC = null; renderBoardList(d, B); };
  box.append(h('div.xc-board-acts', {}, h('button.xc-board-flip', { type: 'button', text: '서비스로 보기', 'aria-pressed': BMODE === 'svc' ? 'true' : 'false', onclick: flip }), h('button.t-btn.t-btn--2.xc-board-rep', { type: 'button', text: '보고서로', onclick: (e) => downloadHwpx(boardListSpec(), e.currentTarget) })));
  if (BMODE === 'svc') { box.append(svcFirst(d, B)); d.set(box); X.boardList = { mode: 'svc', regions: B.regs.length, services: B.services, rows: box.querySelectorAll('.xc-svr, .xc-sgc').length, open: BSVC }; return; }
  const go = (st) => { BL = st; renderBoardList(d, B); };
  // 길잡이 줄 — 전국(기본 시도로 · 접기) › 시도(펼친 시군구 접기) › 시군구(지금)
  const bc = h('nav.xc-bc', { 'aria-label': '단계' });
  const crumb = (text, st, cur) => (cur ? h('span.xc-bc-c', { text }) : h('button.xc-bc-b', { type: 'button', text, onclick: () => go(st) }));
  const sep = () => h('span.xc-bc-s', { text: '›' });
  if (sidos.length > 1) bc.append(crumb('전국', { sido: defaultSido(B, sidos), sgg: null }, false), sep());
  bc.append(crumb(BL.sido, { sido: BL.sido, sgg: null }, !reg3));
  if (reg3) bc.append(sep(), crumb(reg3.name, null, true));
  box.append(bc);
  // 1단 — 시도 칩 줄(시도가 둘 이상일 때만)
  if (sidos.length > 1) {
    const row = h('div.xc-sdcs', { role: 'tablist', 'aria-label': '시도' });
    for (const sd of sidos) {
      const regs = B.regs.filter((reg) => sidoOf(reg) === sd);
      row.append(h('button.xc-sdc', { type: 'button', role: 'tab', 'aria-pressed': sd === BL.sido ? 'true' : 'false', 'aria-selected': sd === BL.sido ? 'true' : 'false',
        onclick: () => go({ sido: sd, sgg: regs.length === 1 ? regs[0].sgg_cd : null }) }, h('span', { text: sd }), h('span.num', { text: nf(regs.length) })));
    }
    box.append(row);
    requestAnimationFrame(() => row.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  }
  // 2단 — 시군구 칩 격자 · 펼친 칩은 한 줄 전체를 차지하고 그 아래 서비스 줄
  const grid = h('div.xc-sggs');
  for (const reg of inSido) {
    const r = regOf(reg), open = reg3 === reg;
    const chip = h('button.xc-sgc', { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-current': S.region?.code === r?.code ? 'true' : undefined,
      onclick: () => { if (open) { go({ sido: BL.sido, sgg: null }); return; } go({ sido: BL.sido, sgg: reg.sgg_cd }); if (r && S.region?.code !== r.code) setRegion(r, { keepDrawer: true }); } },   // 시군구를 누르면 그 자리에서 펼치며 그곳으로 · 다시 누르면 접음
      h('b', { text: reg.name }), h('span.xc-sgn', {}, h('span.num', { text: `${nf(B.svcRows(reg).length)} 서비스` }), dMD(lastAt(B.svcRows(reg))) ? h('span.xc-sgd', { text: dMD(lastAt(B.svcRows(reg))) }) : null), h('i'));
    grid.append(open ? h('section.xc-sgw', {}, chip, boardGroup(reg, B)) : chip);
  }
  box.append(grid);
  d.set(box);
  X.boardList = { regions: B.regs.length, services: B.services, level: reg3 ? 3 : 2, sido: sidos.length, at: BL.sido || null, sgg: BL.sgg || null, rows: box.querySelectorAll('.xc-sgc, .xc-board-svc').length, open: [BL.sido], chips: sidos.length > 1 ? sidos.length : 0, grid: inSido.length };
}
/** 서비스 먼저(10-18 '서비스로 보기') — 서비스 줄(색 점 · 이름 · 시군구 수) → 누르면 그 서비스가 있는 시군구 칩(마지막 분석 날짜) → 칩을 누르면 그곳으로 날아가 그 결과만 */
function svcFirst(d, B) {
  const by = new Map();
  for (const reg of B.regs) for (const it of B.svcRows(reg)) { if (!by.has(it.svc)) by.set(it.svc, { svc: it.svc, name: it.name, rows: [] }); by.get(it.svc).rows.push({ reg, it }); }
  const multi = new Set(B.regs.map((r) => r.sido || '—')).size > 1;
  const wrap = h('ul.xc-svrs');
  for (const g of [...by.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name, 'ko'))) {
    const open = BSVC === g.svc, task = taskOf(g.name);
    const head = h('button.xc-svr', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { BSVC = open ? null : g.svc; renderBoardList(d, B); } },
      h('i.xc-svr-d', { style: { background: BD?.colorOf?.(task) || baseCol(task) } }), h('b', { text: g.name }), h('span.num', { text: `${nf(g.rows.length)} 시군구` }), h('i.xc-svr-c'));
    const li = h('li', { class: open ? 'is-open' : '' }, head);
    if (open) {
      const grid = h('div.xc-sggs.xc-sggs--svc');
      for (const { reg, it } of g.rows.sort((a, b) => (b.it.finished_at || '').localeCompare(a.it.finished_at || '') || a.reg.name.localeCompare(b.reg.name, 'ko'))) {
        const r = regOf(reg), md = dMD(it.finished_at);
        grid.append(h('button.xc-sgc', { type: 'button', dataset: { svc: it.svc, sgg: reg.sgg_cd }, 'aria-current': S.region?.code === r?.code && BD?.task === task ? 'true' : undefined, onclick: (e) => showBoardSvc(reg, it, e.currentTarget) },
          h('b', { text: multi && reg.sido ? `${reg.sido} ${reg.name}` : reg.name }), h('span.xc-sgn', {}, h('span.num', { text: `${nf(ev(it.n))}${it.unit || '개'}` }), md ? h('span.xc-sgd', { text: md }) : null)));
      }
      li.append(grid);
    }
    wrap.append(li);
  }
  return wrap;
}
/** 시군구 하나의 서비스 줄(색 점 · 이름 · 결과 수) — 누르면 그 결과만 지도에 · 다시 누르면 원래대로 */
function boardGroup(reg, B = boardRegs()) {
  const r = regOf(reg);
  const rows = B.svcRows(reg).map((it) => h('li', {}, h('button.xc-board-svc', { type: 'button', dataset: { svc: it.svc, sgg: reg.sgg_cd }, 'aria-current': S.region?.code === r?.code && BD?.task === taskOf(it.name) ? 'true' : undefined,
    onclick: (e) => showBoardSvc(reg, it, e.currentTarget) },
    h('i', { style: { background: BD?.colorOf?.(taskOf(it.name)) || baseCol(taskOf(it.name)) } }), h('span', { text: it.name }), h('b.num', { text: `${nf(ev(it.n))}${it.unit || '개'}` }))));
  return h('section.xc-board-grp', {}, h('ul.xc-board-svcs', {}, ...rows));
}
/** 서비스 하나 → 그 시군구로 날아가 그 서비스 결과만 지도에(기존 결과 켜기 재사용: 전국 결과 화면 = 업무 거르기 · 기관 화면 = 그 결과 층만) */
async function showBoardSvc(reg, it, btn) {
  const r = regOf(reg); if (!r) return;
  const wasOn = btn?.getAttribute('aria-current') === 'true', moved = S.region?.code !== r.code;
  btn?.closest('.xc-board')?.querySelectorAll('[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
  btn?.setAttribute('aria-current', 'true'); btn?.closest('.xc-board-grp')?.querySelector('.xc-board-sgg')?.setAttribute('aria-current', 'true');
  if (moved) await setRegion(r, { keepDrawer: true });
  if (S.region?.code !== r.code) return;
  const task = taskOf(it.name);
  const same = !moved && wasOn;                                                        // 이미 눌려 있던 줄을 다시 누름 → 원래대로(토글)
  if (S.board) { applyTask(same ? null : task); }                                      // 전국 결과 화면: 그 업무만 남긴다 · 다시 누르면 원래대로(왼쪽 위 칩과 같은 동작)
  else {                                                                                // 기관 화면: 그 서비스 결과 층만 켠다(map_layer only 와 같은 길) · 다시 누르면 모두
    await S.rdP?.catch(() => {});
    const w = norm(it.name), hit = (S.res || []).filter((x) => x.set === it.layer?.set || x.id === it.layer?.id || norm(x.name?.ko || x.id).includes(w));
    if (!hit.length) { K.toast(`이 지역에는 ${it.name} 결과가 없습니다`); return; }
    for (const x of S.res || []) S.resOn[x.id] = same ? true : hit.includes(x);
    S.layers.ai = true; S.aiUser = true; S.aiByRegion = false; applyLayers(); if (S.tool === 'layers') renderLayers();
  }
  if (same) btn?.removeAttribute('aria-current');
  X.boardPick = { sgg: reg.sgg_cd, svc: it.svc, task: S.board ? BD?.task : null, same, on: S.board ? null : (S.res || []).filter((x) => S.resOn[x.id]).map((x) => x.name?.ko || x.id) };
}
/** 목록과 같은 내용의 한 장(.hwpx) — 시군구 · 서비스 · 서비스 결과 · 마지막 분석(원칙 274 (a) · 275 기준) */
function boardListSpec() {
  const B = boardRegs(); if (!B) return null;
  const rows = [], tot = B.regs.reduce((t, r) => t + ev(r.n), 0);
  for (const reg of B.regs) for (const it of B.svcRows(reg)) rows.push([reg.name, it.name, ev(it.n), it.finished_at ? String(it.finished_at).slice(0, 10) : '—']);
  const title = B.region ? `${B.region.name} 제공 중인 서비스` : '제공 중인 시군구 · 서비스';
  return { kind: 'board', rule: [], title, means: [['지역', B.region ? B.region.name : '지금 지도에 보이는 시군구'], ['업무', '모든 업무'], ['비교', '시군구 · 서비스']], fuse: ['서비스 결과 장부'],
    kpis: [{ label: '시군구', value: B.regions, unit: '곳' }, { label: '서비스', value: B.services, unit: '가지' }, { label: '서비스 결과', value: tot, unit: '개' }],
    panels: [{ type: 'table', title: '제공 중인 시군구 · 서비스', cols: ['시군구', '서비스', '서비스 결과', '마지막 분석'], num: [2], rows }], say: [], main: { label: '서비스 결과', value: tot, unit: '개' } };
}
async function downloadHwpx(spec, b) {
  if (!spec || !b || b.disabled) return;
  const t0 = b.textContent; b.disabled = true; b.textContent = '만드는 중';
  try {
    const r = await api('/ximap/report.hwpx', { method: 'POST', body: { spec }, raw: true });
    if (!r.ok) throw new Error('http ' + r.status);
    const cd = r.headers.get('content-disposition') || '', mm = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const name = mm ? decodeURIComponent(mm[1]) : `${String(spec.title).replace(/[\/:*?"<>|\s·—]+/g, '_')}_보고서.hwpx`;
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    b.textContent = '내려받았습니다';
  } catch { b.textContent = '내려받지 못했습니다'; }
  setTimeout(() => { b.textContent = t0; b.disabled = false; }, 1600);
}
function paintBoardHud() {
  const d = boardData();
  if (!hudBoard || NAT?.id && NAT.id !== 'kr') return;
  if (!S.board && !d) { hudBoard.hidden = true; return; }   // 기관 화면: 장부가 오기 전에는 큰 숫자 그대로
  hudBoard.hidden = false;
  const task = BD?.task || null;
  const reset = task ? h('p.xb-task', {}, h('i', { style: { background: BD?.colorOf?.(task) || baseCol(task) } }), h('span', { text: task }),
    h('button.xb-reset', { type: 'button', text: '원래대로', onclick: () => applyTask(null) })) : null;
  let kids, key;
  if (!d) {
    kids = [h('p.xb-k.xb-k--line', { text: '결과를 불러오지 못했습니다' })];
    key = 'fail'; X.hud = { label: '결과를 불러오지 못했습니다', n: null, from: 'board', state: 'fail' };
  } else if (!S.region || map.getZoom() < 8.2) {
    const { regions, services, regs } = hudCounts(d, null);
    const label = `${nf(regions)} 시군구 · ${nf(services)} 서비스 제공중`;
    const total = !S.board ? regs.reduce((t, x) => t + ev(x.n), 0) : S.clsOff.size ? visRows(hudTaskRows().rows).filter((x) => !task || x.k === task).reduce((t, x) => t + x.n, 0) : boardTotal(task), unit = task ? BD?.UNIT?.[task] || '개' : '개';
    kids = [h('button.xb-k.xb-k--line', { type: 'button', onclick: openBoardList }, h('b.num', { text: nf(regions) }), ' 시군구 · ', h('b.num', { text: nf(services) }), ' 서비스 제공중'), reset];   // 누르면 지도 위 통계 1단계(원칙 273)
    key = ['kr', regions, services, task].join('|');
    X.hud = { label, regions, services, n: total, unit, task, from: 'board' };
  } else {
    const r = S.region, { rows, wait } = S.board ? regionRows(r) : { rows: [], wait: false };   // 기관 화면은 전국 분석 장부를 부르지 않는다
    const shown = visRows(task ? rows.filter((x) => x.k === task) : rows);
    const { services } = hudCounts(d, r);
    const label = `${r.name} · ${nf(services)} 서비스 제공중`;
    kids = [h('button.xb-k.xb-k--line', { type: 'button', onclick: openBoardList }, h('span', { text: r.name }), ' · ', h('b.num', { text: nf(services) }), ' 서비스 제공중'), reset];
    key = ['r', r.code, services, task].join('|');
    const br = boardRegion(r);
    X.hud = { label, regions: 1, services, n: shown.reduce((t, x) => t + x.n, 0), board: br ? ev(br.n) : 0, task, from: 'board', rows: shown.length, wait };
  }
  if (!SC && BD?.data) showSC(HUDV);                       // 기본 '지금 + C'(원칙 262) — 결과 장부가 온 뒤 켠다(숫자 · 자리가 모두 서버 값)
  if (paintHudVariant() || SC?.on) hudBoard.hidden = true;   // 시안을 보는 동안은 지금 모양을 걷는다(A · B · C = showcase.js)
  SC?.refresh();
  if (key === HUDKEY) return;
  HUDKEY = key;
  hudBoard.replaceChildren(...kids.filter(Boolean));
}
/* ═══ 왼쪽 위 결과 표시 — 시안 두 방향(10-15 원칙 253 '저렇게 보여주는게 최선인가..?') · 같은 숫자(서비스 결과 장부 + 전국 분석 진행 장부) ═══
   ⓐ 작은 판 = 숫자 하나 + 업무 색 점 줄(누르면 그 업무만) · ⓑ 아래 띠 = 채팅 창 위 얇은 띠에 업무별 수가 흐름(누르면 그 업무만).
   지도 영역 안(원칙 233) · 특정 업무 기본 없음(원칙 237) · 기본은 지금 모양 · 시안 단추는 LX 계정 XI맵에만(이 브라우저에 기억). */
let HUDV = 'now', XV = null, VKEY = '', SC = null;
/** 콘셉트 A · B · C 켜기 · 끄기(showcase.js) — 결과 장부가 온 뒤에만(숫자 · 자리가 모두 서버 값) */
function showSC(v) {
  if (!BD?.data) return;
  if (!SC) SC = createShowcase({ map, host: mainEl, h, bd: () => BD, ask, applyTask, taskRows: hudTaskRows, region: () => S.region, onmapOpen: () => !!OM?.on, hud: () => hudBoard });
  SC.set(v || 'now');                                      // 'now' = 지금 + C(기본) · A · B · C 단독은 ?dev=1 시안 단추로만
}
function mountHudVariants() {
  // 10-15 원칙 259: ⓐ · ⓑ 는 '다시' — 단추는 지금 · A · B · C(showcase.js). ⓐ · ⓑ 코드는 남겨 두되 단추에서 뺌(기억된 'a' · 'b' 는 '지금'으로)
  const dev = Q.get('dev') === '1';
  try { HUDV = dev && ['A', 'B', 'C'].includes(localStorage.getItem('xc_hudv')) ? localStorage.getItem('xc_hudv') : 'now'; } catch { HUDV = 'now'; }
  const sa = h('section.xv-a.t-card.t-card--map', { hidden: true, 'aria-live': 'polite', 'aria-label': 'AI 분석 결과' });
  const sb = h('section.xv-b', { hidden: true, 'aria-live': 'polite', 'aria-label': 'AI 분석 결과' });
  const btns = [['now', '지금'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([v, t]) => h('button', { type: 'button', dataset: { v }, 'aria-pressed': String(v === HUDV), text: t,
    onclick: () => { HUDV = v; try { localStorage.setItem('xc_hudv', v); } catch { /* 저장 못 해도 이 화면에서는 바뀜 */ } btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); showSC(v); VKEY = ''; HUDKEY = ''; paintBoardHud(); } }));
  const sw = h('div.xv-sw', { role: 'group', 'aria-label': '결과 표시 시안', hidden: !dev }, h('span', { text: '시안' }), ...btns);
  mainEl.append(sa, sb, sw);
  XV = { a: sa, b: sb, sw };
}
/* '통계' 단추(10-15 원칙 262 "통계 대시보드는 눌러도 크게 뭐가 안변하네?") — 단계 셋이 단추에 그대로 보이고(지도만 · 지도 위 · 대시보드 · 지금 단계가 짙음), 누르면 그 단계로 바뀐다.
   통계가 없을 때는 숨김(누를 것이 없으니). 옛 '지도 위 ↔ 대시보드' 기억은 쓰지 않는다 */
let LASTSPEC = null, SWB = null, KEEPCAM = false;
const DEV = Q.get('dev') === '1';
const NARROW_W = 1400;   // 이 창 폭 이하 = 좁은 화면(1366 노트북 등) — 통계 판 기본 접힘(원칙 273)
const STEPV = [['only', 1, '지도만'], ['map', 2, '지도 위'], ['dash', 3, '대시보드']];
function mountStatSwitch() {
  const btns = STEPV.map(([v, n, t]) => h('button', { type: 'button', dataset: { v, step: String(n) }, 'aria-pressed': 'false', text: t, onclick: () => { if (LASTSPEC && STEP !== n) setStep(n); } }));
  SWB = h('div.xo-sw', { role: 'group', 'aria-label': '통계 표출', hidden: true }, h('span', { text: '통계' }), ...btns);
  mainEl.append(SWB);
  // 답 끝 '통계 보기' · '크게 보기'(서버 next) = 2 · 3단계로(새 질문이 아니라 화면이 받는다 · 채팅 창 코드는 그대로)
  const STEPQ = { '통계 보기': 2, '크게 보기': 3 };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.k-chat-btn[data-q]'); if (!b) return;
    const n = STEPQ[b.dataset.q]; if (!n || !LASTSPEC || (!OM && !DS)) return;
    e.preventDefault(); e.stopPropagation(); setStep(n);
  }, true);
}
function paintStatSwitch() {
  if (!SWB) return;
  SWB.hidden = !DEV || !STEP || !LASTSPEC;   // 지도 위 떠 있는 것 최소(10-17 원칙 279) — 단계 단추는 ?dev=1 에만 · 단계는 한 줄 · 판 · 대시보드 단추로 오간다
  SWB.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === STEP)));
  X.statStep = STEP;
}
/** 단계 바꾸기 — 0 닫기 · 1 지도에만(한 줄) · 2 지도 위 판 · 3 대시보드. fresh = 새 질문(차오름부터 다시) · 3 → 2 는 바로(fast) */
function setStep(n, { fresh = false } = {}) {
  if (!LASTSPEC || (!OM && !DS)) return { ok: false, reason: '이 화면에서는 통계를 열 수 없습니다' };
  // 좁은 화면(1400 이하 — 판이 지도를 크게 가림)에서 새 통계는 접힌 채(한 줄 · '통계 보기')로 연다. 사람이 판을 직접 펴거나 끌어 둔 기억이 있으면 그 기억이 먼저(10-17 원칙 273)
  if (fresh && n === 2 && OM && innerWidth <= NARROW_W && !OM.remembered) n = 1;
  const was = STEP; STEP = n;
  let r = true;
  if (n === 0) { DS?.leave(); OM?.leave(); STEP = 0; }
  else if (n === 3) { if (!DS) { STEP = was; return false; } OM?.leave({ quiet: true }); r = DS.show(LASTSPEC); }
  else if (OM) {
    if (DS?.on) DS.leave({ quiet: true });
    if (OM.on && !fresh) OM.setStep(n, { silent: true });
    else r = OM.show(LASTSPEC, { step: n, fast: !fresh && was === 3 });
  } else { STEP = was; return false; }
  paintStatSwitch();
  return r;
}
/** 업무마다 하나(같은 업무 = 서비스 결과 + 전국 분석 합) — 전국 또는 지금 시군구 */
function hudTaskRows() {
  const m = new Map();
  const add = (k, n, unit) => { if (!(n > 0)) return; const x = m.get(k) || { k, n: 0, unit }; x.n += n; m.set(k, x); };
  if (!S.region || map.getZoom() < 8.2) {
    for (const s of BD?.data?.services || []) add(taskOf(s.name), ev(s.n), BD.UNIT[taskOf(s.name)] || '개');
    for (const [a, A] of Object.entries(BD?.nat?.data?.assets || {})) { if (A.on === false) continue; for (const cls of NCLS[a] || []) add(cls, ev(A.counts?.[cls]?.n), BD.UNIT[cls] || '개'); }
    return { title: '전국', rows: visRows([...m.values()].sort((p, q) => q.n - p.n)), wait: false };
  }
  const { rows, wait } = regionRows(S.region);
  for (const x of rows) add(x.k, x.n, x.unit);
  return { title: S.region.name, rows: visRows([...m.values()].sort((p, q) => q.n - p.n)), wait };
}
function paintHudVariant() {
  if (!XV) return false;
  const on = ['a', 'b'].includes(HUDV) && !!BD?.data && !(NAT?.id && NAT.id !== 'kr');
  XV.a.hidden = !(on && HUDV === 'a'); XV.b.hidden = !(on && HUDV === 'b');
  if (!on) { VKEY = ''; return false; }
  const { title, rows, wait } = hudTaskRows(), task = BD?.task || null;
  const sel = task ? rows.find((x) => x.k === task) : null;
  const total = sel ? sel.n : rows.reduce((t, x) => t + x.n, 0), unit = sel ? sel.unit : '개';
  const run = !S.region ? BD.nat.running?.() : null;
  const key = [HUDV, title, task, wait, run?.label, JSON.stringify(rows.map((x) => [x.k, x.n]))].join('|');
  if (key === VKEY) return true;
  VKEY = key;
  const pick = (k) => () => { applyTask(BD.task === k ? null : k); };
  if (HUDV === 'a') {
    XV.a.replaceChildren(...[
      h('p.xv-k', { text: sel ? `${title} · ${sel.k}` : `${title} · AI 분석 결과` }),
      h('p.xv-big', {}, h('b.num', { text: rows.length ? nf(total) : '—' }), h('small', { text: rows.length ? unit : '' })),
      rows.length ? h('div.xv-dots', { role: 'group', 'aria-label': '업무' }, ...rows.map((x) => h('button.xv-dot', { type: 'button', 'aria-pressed': String(task === x.k), title: `${x.k} ${nf(x.n)}${x.unit}`, onclick: pick(x.k) },
        h('i', { style: { background: BD.colorOf(x.k) } }), h('span', { text: x.k }))))
        : h('p.xv-p', { text: wait ? '불러오는 중' : '분석 예정' }),
      run?.label ? h('p.xv-live', {}, h('i'), h('span', { text: `지금 분석 중 · ${run.label}` })) : null].filter(Boolean));
  } else {
    const item = (x) => h('button.xv-it', { type: 'button', 'aria-pressed': String(task === x.k), onclick: pick(x.k) },
      h('i', { style: { background: BD.colorOf(x.k) } }), h('span', { text: x.k }), h('b.num', { text: `${nf(x.n)}${x.unit}` }));
    const track = h('div.xv-track', {}, ...rows.map(item));
    const lane = h('div.xv-lane', {}, track);
    XV.b.replaceChildren(h('p.xv-sum', {}, h('span', { text: sel ? `${title} · ${sel.k}` : title }), h('b.num', { text: rows.length ? `${nf(total)}${unit}` : (wait ? '불러오는 중' : '분석 예정') })), lane);
    // 띠보다 길면 흐른다(같은 줄을 한 번 더 붙여 끊김 없이 · 손을 올리면 멈춤 · 움직임 줄이기면 흐르지 않음)
    requestAnimationFrame(() => {
      if (task) { track.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }   // 업무 하나를 고르면 멈춰 그 업무를 보인다
      if (track.scrollWidth <= lane.clientWidth + 2 || RM()) return;
      track.append(...rows.map(item));
      track.style.setProperty('--xv-s', `${Math.max(18, Math.round(track.scrollWidth / 2 / 40))}s`);
      track.classList.add('is-flow');
    });
  }
  return true;
}
/* ═══ 누르면 — 그곳으로 내려가 객체로 펼치고, 그 자리 옆 말풍선에 여러 업무 숫자(업무 줄 = 그 업무만) ═══ */
let PIN = null;
function unpin() { const had = PIN; PIN?.marker.remove(); PIN = null; if (had?.code) paintBoardHud(); }
function pinAt(lngLat, title, sub, getRows, code = null) {
  unpin();
  const el = h('div.xb-pin', { role: 'dialog', 'aria-label': title });
  const marker = new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [18, 0] }).setLngLat(lngLat).addTo(map);
  PIN = { marker, code, redraw: null, z: map.getZoom() };
  const draw = () => {
    const { rows, wait } = getRows();
    const shown = visRows(rows).slice(0, 6);
    el.replaceChildren(...[h('p.xb-pin-n', {}, h('b', { text: title }), sub ? h('small', { text: sub }) : null),
      shown.length ? h('ul.xb-pin-rows', {}, ...shown.map((x) => h('li', {}, h('button', { type: 'button', 'aria-pressed': String(BD.task === x.k), onclick: (e) => { e.stopPropagation(); applyTask(BD.task === x.k ? null : x.k); draw(); } },
        h('i', { style: { background: BD.colorOf(x.k) } }), h('span', { text: x.name }), h('b.num', { text: `${nf(x.n)}${x.unit}` })))))
        : h('p.xb-pin-p', { text: wait ? '불러오는 중' : '분석 예정' }),
      code && S.lx ? h('button.xb-pin-dash', { type: 'button', text: '통계 보기', onclick: (e) => { e.stopPropagation(); ask(`${title} 현황 보여 줘`); } }) : null].filter(Boolean));
  };
  PIN.redraw = draw;
  draw();
  requestAnimationFrame(() => el.classList.add('in'));
}
async function openRegion(r) {
  unpin();
  await setRegion(r);                                     // 그 시군구로 내려간다(객체는 가까이 오면 펼쳐짐 · 전국 결과 층 그대로)
  if (S.region?.code !== r.code) return;
  const b = map.getBounds(), c = map.getCenter();
  pinAt([b.getEast() - (b.getEast() - b.getWest()) * 0.32, c.lat], r.name, null, () => regionRows(r), r.code);
  paintBoardHud();
}
function pinCell(p, at) {
  const rows = () => ({ rows: BD.nat.cellRows(p).map((x) => ({ k: x.c, name: x.c, n: x.n, unit: x.unit })), wait: false });
  const g = BD.nat.cellGeom(p.asset, p.cd);
  let ll = at;
  if (g) { let e = -180, so = 90, no = -90; const walk = (c) => (typeof c[0] === 'number' ? (e = Math.max(e, c[0]), so = Math.min(so, c[1]), no = Math.max(no, c[1])) : c.forEach(walk)); g.forEach((x) => walk(x.coordinates)); if (e > -180) ll = { lng: e, lat: (so + no) / 2 }; }
  pinAt(ll, p.name || '', p.sgg || '', rows);
}
/* ═══ 객체 위 마우스 · 겹침 · 클래스 색 · 클래스 켜기/끄기(10-15 사용자 "객체랑 객체 아닌거랑 마우스 모습도 달라야겠다 … 겹친것들은 … 색상은 그대로네 … 체크박스 클래스 온오프도 없네") ═══
   누를 수 있는 객체 위 = 손가락 · 빈 지도 = 지도 기본(끌기). 올리면 맨 위 하나만 떠오르고(feature-state hover) 둘 이상이면 '겹침 n' 작은 표시.
   누르면 하나 = 바로 그 자리 고치기 · 둘 이상 = 작은 고르기 목록. 서비스 결과 · 전국 결과 · 고친 자리 층 모두 같은 길. */
const LC_COL = { 경작지: TEAL, 비닐하우스: TEAL_DEEP, 건물: INK, 주차장: SLATE };   // 토지피복 결과 층의 분류 색(arrive.js resultPaint 와 같은 값)
/** 그 묶음 결과 층의 색 규칙으로 클래스 색 — 전국 결과 = 분류 색 · 토지피복 = 토지피복 팔레트 · 그 밖 = 업무 색(바꾼 것이 눈에 보이게) */
/** 고친 자리 층의 묶음 이름(서버는 작업 id 로 줄 수 있다 · 'results/lx/job_…' 와 'job_…' 는 같은 묶음) → 화면의 서비스 결과 세트 · 전국 결과 묶음 */
const sameSet = (a, b) => !!a && !!b && (a === b || a.endsWith('/' + b) || b.endsWith('/' + a));
const svcSetOf = (set) => (S.res || []).find((it) => sameSet(it.set, set)) || null;
const natSetOf = (set) => { for (const sid of BD?.nat?.objects || []) { const o = BD.nat.bySource(sid); if (o && sameSet(o.set, set)) return o.set; } return null; };
function colorFor(set, cls) {
  const u = userCol(cls); if (u) return u;                                   // 사람이 바꾼 클래스 색(색 바꾸기)
  if (natSetOf(set)) return NCOLOR[cls] || BD.colorOf(cls);
  const it = svcSetOf(set);
  if (it?.item?.style === 'landcover') return LC_COL[cls] || BD.colorOf(cls);
  return BD?.colorOf(cls) || (it && BD.color(it.svc)) || '#0FA9A0';
}
/** 원래 객체 숨김(고친 자리 층이 대신 그린다) — 묶음이 전국 결과면 그 층 · 서비스 결과면 그 세트 층 */
function hideOrig(set, fids) {
  const it = svcSetOf(set), ns = natSetOf(set);
  if (it) hideResults(map, it.ids, fids);
  if (ns || !it) BD?.nat?.hide(ns || set, fids);
}
const objLayers = () => [...(S.res || []).flatMap((it) => it.ids.filter((l) => /-(fill|pt)$/.test(l))).filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none'),
  ...(BD?.nat && map.getZoom() >= BD.nat.OBJ_Z - 0.5 ? BD.nat.objLayers() : []), ...(map.getLayer('xe-live-fill') ? ['xe-live-fill'] : [])];
/** 결과 분류 이름 — 결과 조각에 영문 코드만 있으면(변화 탐지 built_new 등) 서버 한글 이름표(GET /ximap/board class_ko · spaces.CLASS_KO 한 곳) */
const clsName = (c) => { const k = String(c ?? ''); return BD?.data?.class_ko?.[k.toLowerCase()] || k; };
const UNIT_K = { 경작지: '곳', 비닐하우스: '동', 건물: '동', 주차장: '곳' };
/** 그 점의 객체들(겹친 것 모두 · 같은 객체는 한 번 · 맨 위부터) → [{f, set, fid, cls, area, live}] */
function objectsAt(pt) {
  const lyr = objLayers(); if (!lyr.length) return [];
  const pad = [[pt.x - 3, pt.y - 3], [pt.x + 3, pt.y + 3]];
  const seen = new Set(), out = [];
  for (const f of map.queryRenderedFeatures(pad, { layers: lyr })) {
    const live = f.layer.id === 'xe-live-fill';
    const set = live ? f.properties?.set : (BD?.bySource(f.source)?.set || BD?.nat?.bySource(f.source)?.set);
    const fid = live ? f.properties?.fid : (f.properties?.id ?? f.id);
    if (!set || fid == null) continue;
    const key = set + '|' + fid; if (seen.has(key)) continue; seen.add(key);
    const L = live ? { set, item: { name: f.properties?.cls || '' } } : (BD?.bySource(f.source) || { set, item: { name: f.properties?.cls || '' } });
    out.push({ f, L, set, fid: String(fid), cls: f.properties?.cls || '', area: Number(f.properties?.area_m2) || null, live });
  }
  return out;
}
function openObject(o, at) { ED.open(o.L, o.fid, at); }
X.objectsAt = (x, y) => objectsAt({ x, y }).map((o) => ({ set: o.set, fid: o.fid, cls: o.cls, area: o.area, live: o.live }));   // 실증 기록용(화면엔 없음)
let PICK = null;
function closePicker() { PICK?.remove(); PICK = null; }
function pickObject(hs, at) {
  const el = h('div.xe-pick.t-card.t-card--map', { role: 'listbox', 'aria-label': '겹친 객체' },
    h('p.xe-pick-t', {}, h('span', { text: '겹침' }), h('b.num', { text: String(hs.length) })),
    ...hs.map((o) => h('button.xe-pick-r', { type: 'button', role: 'option', onclick: () => { closePicker(); openObject(o, at); } },
      h('i', { style: { background: colorFor(o.set, o.cls) } }), h('span', { text: clsName(o.cls) || '객체' }), h('b.num', { text: o.area != null ? `${nf(Math.round(o.area))}㎡` : '' }))));
  PICK = new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [14, 0] }).setLngLat(at).addTo(map);
  requestAnimationFrame(() => el.classList.add('in'));
}
/** 올리면 — 손가락 · 맨 위 하나 떠오름 · '겹침 n' */
function mountObjectHover() {
  const ovl = h('div.xc-ovl', { hidden: true, 'aria-hidden': 'true' }); mainEl.append(ovl);
  let hv = null, raf = 0, last = null;
  const unhover = () => { if (hv) { try { map.setFeatureState(hv, { hover: false }); } catch { /* 층 없음 */ } hv = null; } };
  const paint = (pt) => {
    const ok = S.board && !AN?.active && !S.swipe && !ED.busy && !DS?.on && map.getZoom() >= BD.NEAR_Z;
    const hs = ok ? objectsAt(pt) : [];
    const top = hs[0]?.f || null;
    const k = top && top.id != null ? { source: top.source, sourceLayer: top.sourceLayer, id: top.id } : null;
    if (!k || !hv || k.source !== hv.source || k.id !== hv.id) { unhover(); if (k) { hv = k; try { map.setFeatureState(hv, { hover: true }); } catch { hv = null; } } }
    if (ok) map.getCanvas().style.cursor = hs.length || cadOn() ? 'pointer' : '';   // 객체 = 손가락 · 빈 지도 = 지도 기본(끌기) · 지적 층이 켜지면 빈 땅(필지)도 손가락
    ovl.hidden = hs.length < 2;
    if (hs.length >= 2) { ovl.textContent = `겹침 ${hs.length}`; ovl.style.transform = `translate(${Math.round(pt.x + 14)}px,${Math.round(pt.y + 18)}px)`; }
    X.objHover = { n: hs.length, top: hs[0] ? { cls: hs[0].cls, set: hs[0].set } : null, cursor: map.getCanvas().style.cursor };
  };
  map.on('mousemove', (e) => { if (e.originalEvent && e.originalEvent.target !== map.getCanvas()) return; last = e.point; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(last); }); });
  map.getCanvas().addEventListener('mouseleave', () => { unhover(); ovl.hidden = true; });
  map.on('movestart', () => { ovl.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
}
/** 클래스 켜기/끄기(체크박스 · '층' 판 안) — 지도(서비스 결과 · 전국 결과 · 멀리 칸) + 왼쪽 위 숫자 · 말풍선 숫자에서 빠짐 */
function applyClsOff() {
  excludeClasses(map, [...S.clsOff]);
  BD?.setOffCls([...S.clsOff]);
  HUDKEY = ''; paintBoardHud(); PIN?.redraw?.(); SC?.refresh();
  X.clsOff = [...S.clsOff];
}
const visRows = (rows) => (S.clsOff.size ? rows.filter((x) => !S.clsOff.has(x.k)) : rows);
/* ═══ 색 바꾸기(10-15 원칙 264 · 공용 kit/colors.js — 지도 서비스 층 줄 색 점과 같은 칸 · 같은 동작) ═══
   '층' 판 클래스 줄의 색 점 → 클래스마다 색 · 색 묶음 · 직접 · 투명도 · '기본 색으로'. 사람 · 화면별 기억.
   반영: 서비스 결과 층 · 전국 결과(면 · 객체) · 고친 자리 층(클래스 바꾸기 뒤 새 색) · 말풍선 · 업무 줄 · 겹침 고르기 점 · 지도 위 통계 판의 범주 점.
   지도 위 통계(값 척도)는 판의 '지도 색' 점 → 색 띠 · 연속/단계 · 투명도(같은 칸 · 척도만). 바꾼 것이 없으면 원래 모양 그대로(원칙 199). */
const CK = 'cls', SK = 'stat';
let CST = colorState(CK, {}), SST = colorState(SK, { mode: 'scale' });
/** 사람이 바꾼 그 클래스 색(없으면 null) — 결과 조각의 코드(built_new 등)와 한글 이름 모두로 찾는다 */
function userCol(c) {
  const m = CST.cls, k = String(c ?? ''); if (!k) return null;
  if (m[k]) return m[k];
  for (const [r, v] of Object.entries(m)) if (clsName(r) === k || clsName(k) === r) return v;
  return null;
}
/** 클래스 원래 색(체크박스 줄 점 · 색 칸 '기본') — 전국 결과 분류 색 · 그 밖 업무 색 */
const baseCol = (c) => NCOLOR[c] || BD?.baseColorOf?.(clsName(c)) || BD?.baseColorOf?.(c) || '#0FA9A0';
/** 색을 입힐 결과 층 — 서비스 결과(면 · 테두리 · 점) · 전국 결과 면 · 전국 결과 객체 */
function colorLayerIds() {
  const ids = [];
  for (const it of S.res || []) ids.push(...(it.ids || []));
  for (const a of BD?.nat?.assets || []) ids.push(BD.nat.src(a) + '-face');
  for (const sid of BD?.nat?.objects || []) ids.push(sid + '-f', sid + '-l');
  return ids.filter((l) => map.getLayer(l) && !l.endsWith('-hit'));
}
const PAINTED = new WeakMap();   // 층 → 칠한 판 번호(새로 붙은 층만 칠한다)
let CVER = 0, CRAF = 0, CEVER = false;
function paintColors() {
  CRAF = 0;
  if (!CST.custom && !CEVER) return;                                         // 한 번도 바꾸지 않았으면 손대지 않는다
  CEVER = true;
  for (const id of colorLayerIds()) {
    const L = map.getLayer(id); if (PAINTED.get(L) === CVER) continue;
    paintLayers(map, [id], CST, { prop: 'cls', fallback: 'orig', halo: id.endsWith('-halo') ? [id] : [] });
    PAINTED.set(map.getLayer(id), CVER);
  }
}
const schedulePaint = () => { if (!CRAF) CRAF = requestAnimationFrame(paintColors); };
function userColorsToKit() {
  setUserColors({ cls: (k) => userCol(k), ramp: SST.custom ? { stops: SST.rampSet ? RAMPS.find((r) => r.id === SST.ramp)?.stops || null : null, step: SST.stepSet ? SST.step : null } : null });
  if (BD) BD.userColor = (k) => userCol(k);
  X.colors = { cls: { ...CST.cls }, op: CST.op, custom: CST.custom, stat: { ramp: SST.rampSet ? SST.ramp : null, step: SST.stepSet ? SST.step : null, op: SST.op, custom: SST.custom } };
}
/** 바뀐 색을 화면 모두에 — 지도 층 · 점 · 말풍선 · 고친 자리 · 지도 위 통계 */
function colorsChanged() {
  CST = colorState(CK, {}); SST = colorState(SK, { mode: 'scale' });
  userColorsToKit();
  CVER++; paintColors();
  for (const b of pop.querySelectorAll('.xc-cdot')) b.firstElementChild?.style.setProperty('background', userCol(b.dataset.cls) || baseCol(b.dataset.cls));
  HUDKEY = ''; VKEY = ''; paintBoardHud(); PIN?.redraw?.(); BD?.rehover?.(); SC?.refresh?.();
  ED?.live();
  OM?.recolor?.();
}
X.colorFor = (set, cls) => colorFor(set, cls);   // 실증 기록용(화면엔 없음)
function openClsColors(btn, c) {
  const cls = visibleClasses();
  colorPanel(btn, { key: CK, title: '클래스', beside: pop, open: c,
    classes: cls.map((k) => ({ k, label: clsName(k), color: baseCol(k) })), onChange: colorsChanged });
}
const RAMP_OF_HUE = { teal: 'teal', blue: 'blue', orange: 'heat' };
function openStatColors(btn, m) {
  const sc = m?.scale || {}, f = (v) => (v == null ? '' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
  colorPanel(btn, { key: SK, title: m?.title || '', scaleOnly: true, ramp: RAMP_OF_HUE[sc.hue] || 'teal', defStep: sc.kind === 'step', beside: btn.closest('.xo') || null,
    scale: { label: '지도 색', lo: sc.kind === 'div' ? `−${f(sc.max)}%` : f(sc.min), hi: sc.kind === 'div' ? `+${f(sc.max)}%` : f(sc.max) }, onChange: colorsChanged });
}
/** 지금 지도에 그려진 결과의 클래스 목록 — 전국 분석 분류 + 켜진 서비스 결과 조각에서 읽은 분류(지역 하드코딩 0) */
function visibleClasses() {
  const out = new Set(BD?.nat?.assets?.length ? BD.nat.classes() : []);
  for (const it of S.res || []) {
    if (!(aiOn() && S.resOn[it.id]) || !map.getSource(it.sid)) continue;
    try { for (const f of map.querySourceFeatures(it.sid, { sourceLayer: it.item?.layer?.layer }).slice(0, 4000)) if (f.properties?.cls) out.add(String(f.properties.cls)); } catch { /* 조각 전 */ }
  }
  for (const c of S.clsOff) out.add(c);                                    // 끈 것은 켜서 되돌릴 수 있게 늘 보인다
  return [...out].sort((a, b) => a.localeCompare(b, 'ko'));
}
/** 업무 거르기 — k = 업무 이름(그 업무만) · null(원래대로). 말풍선 업무 줄 · XI ChatGEO 업무 거르기 같은 길 */
function applyTask(k) {
  BD?.setTask(k || null);
  PIN?.redraw?.();
  paintBoardHud();
  X.task = BD?.task || null;
  return BD?.task || null;
}
/* 영상 전환 — 작은 단추 둘(최신 영상 = 바탕 위성 · 분석한 영상 = 결과를 만든 등록 영상). 모양 고치기 · 새로 그리기는 분석한 영상 위에서 */
function imageryToggle() {
  S.layers.img = false;                              // 처음 = 최신 영상 위 전국 결과
  const b1 = h('button.xc-img-b', { type: 'button', text: '최신 영상', 'aria-pressed': 'true' });
  const b2 = h('button.xc-img-b', { type: 'button', text: '분석한 영상', 'aria-pressed': 'false' });
  const box = h('div.xc-img', { role: 'group', 'aria-label': '영상' }, b1, b2);
  b1.onclick = () => setImagery('latest'); b2.onclick = () => setImagery('analyzed');
  S.imgBtns = [b1, b2];
  S.boardP?.then((d) => { if (d?.years?.length === 1) b2.textContent = `${d.years[0]} 항공`; });
  S.els.top.prepend(box);
  applyLayers();
}
/** 영상 전환 — 'latest' | 'analyzed' | null(그대로). 앞의 상태를 돌려준다(편집이 끝나면 되돌리기) */
function setImagery(k) {
  const was = S.layers.img ? 'analyzed' : 'latest';
  if (!k || !S.imgBtns) return was;
  S.layers.img = k === 'analyzed';
  S.imgBtns[0].setAttribute('aria-pressed', String(!S.layers.img)); S.imgBtns[1].setAttribute('aria-pressed', String(S.layers.img));
  applyLayers();
  if (S.tool === 'layers') renderLayers();
  return was;
}
/** 기관 화면 지역 대표 수치 — GET /summary?region= (fix-server-summary 계약). 실태조사 우선순위 수(field_check)가 있으면 그것, 없으면 AI 탐지(detected).
    → { env, label, unit } · null(요약에 결과 없음) · undefined(요약을 못 읽음 — 호출한 쪽이 목록 값으로) */
async function summaryBig(r) {
  let j;
  try { j = await api('/summary' + (r ? '?' + new URLSearchParams({ region: r.code }) : '')); }
  catch (e) { K.devlog('summary', `${e.code || e.name || ''} ${e.status ?? 0}`); return undefined; }
  const items = j?.items || [];
  const of = (k) => items.map((it) => it.metrics?.[k]).filter((m) => m && m.value !== null && m.value !== undefined);
  const ms = of('field_check').length ? of('field_check') : of('detected');
  if (!ms.length) {
    // 요약에 없는 지역 — 의심 필지는 같은 출처(시군구 실태조사 표 survey_sgg.findings · GET /survey/build/{sgg})에서만
    if (!r) return null;
    try {
      const b = await api('/survey/build/' + encodeURIComponent(S.remdMeta?.sgg_cd || r.code));
      if (b?.state === 'done' && b.findings != null) {
        const e = typeof b.findings === 'object' ? b.findings : { value: b.findings, unit: 'count', basis: 'inferred', as_of: b.finished_at || '', source: 'AI 실태조사 결과' };
        if (e.value != null) S.suspectOnly = { suspect: { env: e, label: '의심 필지' } };
      } else if (b?.state === 'building') S.suspectOnly = { suspect: { building: true } };
    } catch { /* 실태조사 없음 */ }
    return null;
  }
  const m0 = ms[0];
  const value = ms.reduce((a, m) => a + Number(m.value), 0);
  // 의심 필지(숫자 한 출처 = survey_sgg) — 시군구 항목들의 합. 적재 중(survey_state 'building')이 섞이면 '집계 중'
  const sv = of('suspect'), building = items.some((it) => it.survey_state === 'building');
  const suspect = building ? { building: true } : sv.length ? { env: { ...sv[0], value: sv.reduce((a, m) => a + Number(m.value), 0) }, label: sv[0].label || '의심 필지' } : null;
  // 값이 있으면 '첫 결과 전' 같은 단계 문구는 붙이지 않는다(결과가 있는데 첫 결과 전이라고 보이지 않게 · plan 3.5)
  const note = /첫\s*결과/.test(String(m0.note || '')) ? undefined : m0.note;
  return { env: { value, unit: m0.unit, basis: m0.basis, as_of: m0.as_of || j.as_of || '', source: m0.source || '', note }, label: m0.label, unit: m0.unit, suspect };
}
/** 큰 숫자 아래 한 줄 '의심 필지 n건' — 지역 전체일 때만(읍면동 · 규칙 조건이면 숨김). 오른쪽 판 머리에도 같은 값 */
function paintSus(sb) {
  const sp = sb && sb.suspect;
  S.suspect = sp || null;
  hudSus.hidden = !sp;
  hudSus.replaceChildren();
  if (!sp) { delete hudSus.dataset.v; return; }
  if (sp.building) { hudSus.append(h('span', { text: '의심 필지' }), h('b', { text: '집계 중' })); hudSus.dataset.metric = '의심 필지'; delete hudSus.dataset.v; return; }
  hudSus.append(h('span', { text: sp.label }), h('b.num', { text: nf(sp.env.value) }), h('small', { text: '건' }));
  hudSus.dataset.metric = sp.label; hudSus.dataset.v = String(sp.env.value);
}
function drawBars(rows) {
  const top = rows.filter((r) => r.n > 0 && ruleName(r.k)).sort((a, b) => b.n - a.n).slice(0, 3), max = Math.max(1, ...top.map((r) => r.n));
  bars.innerHTML = '';
  for (const r of top) {
    // 막대는 읽기 전용(버튼 예산 ≤ 10 · 도구 포함) — 규칙으로 거르기는 '규칙' 도구에서
    const b = h('div.xc-bar', { dataset: { rule: r.k }, 'data-on': S.cond.rule === r.k ? '1' : undefined },
      h('span.xc-bar-l', { text: ruleName(r.k) }), h('span.xc-bar-t', {}, h('i', { style: { width: (r.n / max) * 100 + '%' } })), h('span.xc-bar-v.num', { text: nf(r.n) }));
    bars.append(h('li', {}, b));
  }
}
function setPoints(items) {
  const seen = new Set(), feats = [];
  for (const f of items) { const ll = f.lnglat || f.geometry?.coordinates; if (!ll || seen.has(f.pnu)) continue; seen.add(f.pnu); feats.push({ type: 'Feature', properties: { pnu: f.pnu, rule: f.rule }, geometry: { type: 'Point', coordinates: ll } }); }
  map.getSource('xc-pts')?.setData({ type: 'FeatureCollection', features: feats });
  // 필지 타일의 PNU 는 옛 시도 코드일 수 있다(예: 전북 45→52) — 시도 두 자리를 뺀 17자리로 맞춘다
  const lit = ['literal', [...seen].map((p) => String(p).slice(2))];
  for (const l of S.susLayers) map.setFilter(l, ['in', ['slice', ['to-string', ['get', 'pnu']], 2], lit]);
}

/* ═══ 조건(읍면동 · 규칙) ═══ */
function setCond({ emd, rule } = {}) {
  if (emd !== undefined) S.cond.emd = emd;
  if (rule !== undefined) S.cond.rule = rule;
  renderChips();
  if (S.tool === 'rules') renderRules();
  refresh();
}
function renderChips() {
  chips.innerHTML = '';
  const { emd, rule } = S.cond;
  if (!emd && !rule) { chips.hidden = true; return; }
  if (emd) chips.append(h('span.t-chip.xc-chip', { text: emd.nm }));
  if (rule && ruleName(rule)) chips.append(h('span.t-chip.xc-chip', { text: ruleName(rule) }));
  chips.append(h('button.xc-clear', { type: 'button', text: '조건 지우기', onclick: () => { const e = S.cond.emd; setCond({ emd: null, rule: null }); if (e && S.region) stage.go(S.region.bbox, { ms: 1600, maxZoom: 12.5 }); } }));
  chips.hidden = false;
  alignChips();
}
/** 역할 칩 — 이름이 역할과 같으면(예: 'LX 직원 · LX 직원') 역할 하나만 */
function dedupeRole() {
  const r = document.querySelector('.k-mast .k-role'); if (!r) return;
  const b = r.querySelector('b'), rk = (b?.textContent || '').trim();
  const rn = (r.textContent || '').trim().slice(rk.length).trim();
  if (b && (!rn || norm(rn) === norm(rk))) r.textContent = rk;
}
/** 조건 칩 — 1220 이상은 마스트(검색 옆), 그 미만은 검색창 바로 아래 줄(마스트에 매달려 서랍 · HUD 위에 뜬다) */
const NARROW = '(max-width: 1219px)';
function placeChips() {
  const narrow = matchMedia(NARROW).matches;
  const mast = document.querySelector('.k-mast');
  (narrow ? mast : SH.mast.__slot || document.querySelector('.k-mast-slot'))?.append(chips);
  chips.classList.toggle('xc-chips--row', narrow);
  alignChips();
}
function alignChips() {
  if (!chips.classList.contains('xc-chips--row')) { chips.style.left = ''; return; }
  const mast = document.querySelector('.k-mast'), q = document.querySelector('.xc-q');
  if (!mast || !q || innerWidth <= 640) { chips.style.left = ''; return; }
  chips.style.left = Math.max(16, Math.round(q.getBoundingClientRect().left - mast.getBoundingClientRect().left)) + 'px';
}
addEventListener('resize', () => alignChips());

/* ═══ 검색 하나: 시군구 · 읍면동 · 지번 · 문장 ═══ */
let searchInput, sugg, sel = -1, opts = [];
function buildSearch() {
  searchInput = h('input.xc-q-i', { type: 'search', placeholder: '시군구 · 지번 · 또는 XI ChatGEO 에 질문', 'aria-label': '시군구 · 지번 · 또는 XI ChatGEO 에 질문', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list' });
  sugg = h('ul.xc-sugg', { role: 'listbox', hidden: true });
  const box = h('div.xc-q', { role: 'search' }, h('span.xc-q-ico', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg>' }), searchInput, h('kbd.xc-q-k', { text: 'Ctrl K', 'aria-hidden': 'true' }), sugg);
  let t = 0;
  searchInput.addEventListener('focus', () => { searchInput.select(); drawSugg(); });
  searchInput.addEventListener('input', () => { clearTimeout(t); t = setTimeout(drawSugg, 120); });
  searchInput.addEventListener('blur', () => setTimeout(() => { sugg.hidden = true; searchInput.setAttribute('aria-expanded', 'false'); }, 150));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; markSugg(); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = opts[sel] || opts[0]; if (o) o.go(); }
    else if (e.key === 'Escape') { sugg.hidden = true; searchInput.blur(); }
  });
  sugg.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); opts[+li.dataset.i]?.go(); } });
  return box;
}
let qSeq = 0;
async function drawSugg() {
  const q = searchInput.value.trim(), n = norm(q), my = ++qSeq;
  opts = [];
  if (q && S.region && q === S.region.name) { sugg.hidden = true; return; }
  if (n) {
    for (const r of S.regions.filter((r) => norm(r.full).includes(n) || norm(r.name).includes(n)).slice(0, 5))
      opts.push({ t: r.name, s: r.sido, go: () => { done(); setRegion(r); } });
    const seenE = new Set();
    for (const e of [...S.remd, ...S.emds].filter((e) => norm(e.nm).includes(n))) {
      if (seenE.has(e.cd) || seenE.size >= 4) continue; seenE.add(e.cd);
      const inHere = S.remd.some((x) => x.cd === e.cd);
      const r = inHere ? S.region : byCode(e.cd);
      opts.push({ t: e.nm, s: r?.name || '', go: () => { done(); goEmd(e, inHere ? S.region : null); } });
    }
  }
  if (/\d/.test(q)) {
    try {
      const j = await api('/survey/findings?' + new URLSearchParams({ q, limit: '5', sort: 'score' }));
      if (my !== qSeq) return;
      const seen = new Set();
      for (const f of j.items || []) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); opts.push({ t: jibun(f.addr), s: ruleName(f.rule) || '', go: () => { done(); openParcel(f.pnu, { fly: true }); } }); }
    } catch { /* */ }
  }
  if (q.length >= 4 && /\s/.test(q)) opts.push({ t: q, s: 'XI ChatGEO', ask: true, go: () => { done(); ask(q); } });
  if (my !== qSeq) return;
  sel = -1;
  sugg.innerHTML = opts.map((o, i) => `<li role="option" id="xc-o-${i}" data-i="${i}"${o.ask ? ' class="is-ask"' : ''}><b>${esc(o.t)}</b><small>${esc(o.s)}</small></li>`).join('');
  sugg.hidden = !opts.length; searchInput.setAttribute('aria-expanded', String(!!opts.length));
  if (opts.length && n) { sel = 0; markSugg(); }
  function done() { sugg.hidden = true; searchInput.blur(); }
}
function markSugg() { [...sugg.children].forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === sel))); searchInput.setAttribute('aria-activedescendant', sel >= 0 ? 'xc-o-' + sel : ''); }
const jibun = (addr) => String(addr || '').split(' ').slice(-2).join(' ');
function goEmd(e, here = null) {
  const r = here || byCode(e.cd);
  const go = () => {
    setCond({ emd: e }); searchInput.value = e.nm;
    if (AN?.active && !AN.running) emdFrame(e).then((f) => AN.active && !AN.running && AN.start(S.region, f));   // 분석 중 검색 = 그 읍면동으로 프레임
    else return goKeep(e.bbox, { ms: 1600, maxZoom: 14 });
  };
  if (r && S.region?.code !== r.code) {
    if (AN?.active && !AN.running) return setRegion(r).then(go);
    // 다른 시군구의 읍면동 = 한 번에 그 읍면동으로(시군구로 날았다가 다시 읍면동으로 두 번 날던 것 · 말로 한 이동과 같은 길 · 바퀴 16 재검수)
    return setRegion(r, { to: { bbox: e.bbox, ms: 1600, maxZoom: 14 } }).then(() => { if (S.region?.code === r.code) { setCond({ emd: e }); searchInput.value = e.nm; } });
  }
  return go();
}
/* ═══ 분석 프레임 = 읍면동 경계(GET /regions/{sgg}/emd · 한 면 그대로) ═══ */
function emdParts(cd) {
  const out = [];
  const g = S.remd.find((x) => x.cd === cd)?.geometry;
  if (g?.type === 'Polygon') out.push(g.coordinates); else if (g?.type === 'MultiPolygon') out.push(...g.coordinates);
  return out;
}
/** 읍면동 → 분석 프레임 {geometry, label}. 카메라를 그 읍면동으로 옮긴다. 경계가 없으면 상자 */
async function emdFrame(e) {
  await goKeep(e.bbox, { ms: RM() ? 0 : 1250, maxZoom: 14 });
  const parts = emdParts(e.cd);
  const b = e.bbox;
  const geometry = parts.length ? { type: 'MultiPolygon', coordinates: parts }
    : { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] };
  K.devlog('emd frame', `${e.cd} · 조각 ${parts.length}`);
  return { geometry, label: e.nm };
}
/** 분석 중 지도 누르기 → 그 자리의 읍면동(경계 층의 면 안 · 없으면 null) */
function inRing(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; }
async function pickEmd(ll) {
  if (!S.remd.length) return null;                                     // 지금 지역 안의 읍면동만(지역 바꾸기는 검색 · 전국 지도에서)
  const pt = [ll.lng, ll.lat];
  const cands = S.remd.filter((e) => pt[0] >= e.bbox[0] && pt[0] <= e.bbox[2] && pt[1] >= e.bbox[1] && pt[1] <= e.bbox[3]);
  const e = cands.find((c) => emdParts(c.cd).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h))));
  if (!e) return null;
  S.cond.emd = e; renderChips(); searchInput.value = e.nm; refresh();
  return emdFrame(e);
}
/* ═══ 아래 채팅 창 하나(10-17 원칙 276) — 시군구 이름 · 읍면동 · 지번만 치면 언어 모델을 거치지 않고 바로 그곳으로(위 검색창이 쓰던 길 그대로: 지도 경계 이름 · 읍면동 · /survey/findings 지번 → 필지 카드).
   후보가 여럿이면 채팅창 위 작은 후보 목록. 장소가 아니면 false → 질문으로. 걸린 시간은 X.place(실증용). ═══ */
async function placeQuery(q) {
  const n = norm(q); if (!n) return false;
  const t0 = performance.now();
  const c = [];
  const exactR = S.regions.find((r) => norm(r.name) === n || norm(r.full) === n);
  if (exactR) c.push({ t: exactR.name, s: exactR.sido || '', go: () => setRegion(exactR) });
  else {
    for (const r of S.regions.filter((r) => norm(r.full).includes(n) || norm(r.name).includes(n)).slice(0, 5)) c.push({ t: r.name, s: r.sido || '', go: () => setRegion(r) });
    const seenE = new Set();
    for (const e of [...S.remd, ...S.emds].filter((e) => norm(e.nm).includes(n))) {
      if (seenE.has(e.cd) || seenE.size >= 4) continue; seenE.add(e.cd);
      const inHere = S.remd.some((x) => x.cd === e.cd), r = inHere ? S.region : byCode(e.cd);
      c.push({ t: e.nm, s: r?.name || '', go: () => goEmd(e, inHere ? S.region : null) });
    }
    if (/\d/.test(q)) {
      try {
        const j = await api('/survey/findings?' + new URLSearchParams({ q, limit: '5', sort: 'score' }));
        const seen = new Set();
        for (const f of j.items || []) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); c.push({ t: jibun(f.addr), s: String(f.addr || '').split(' ').slice(0, -2).join(' '), go: () => openParcel(f.pnu, { fly: true }) }); }
      } catch { /* 지번 찾기 실패 — 질문으로 */ }
    }
  }
  const dup = new Map(); for (const o of c) if (!dup.has(o.t + '|' + o.s)) dup.set(o.t + '|' + o.s, o);
  let list = [...dup.values()];
  const exact = list.filter((o) => norm(o.t) === n); if (exact.length === 1) list = exact;   // 친 글과 똑같은 것이 하나면 그곳으로
  X.place = { q, n: list.length, ms: Math.round(performance.now() - t0), kind: list.length === 1 ? 'go' : list.length ? 'choices' : 'ask' };
  if (list.length === 1) { Promise.resolve(list[0].go()).then(() => { X.place.flyMs = Math.round(performance.now() - t0); }); return true; }
  if (list.length > 1) return { choices: list };
  return false;
}
/** XI ChatGEO 추천 질문(아래 채팅 창) — 없음(10-15 원칙 253 '위에 가이드도 일단 없앤다'). 빈 목록 = 키트 기본 추천도 그리지 않는다.
 *  해외에서 군을 고르면 그 군 이름으로 한 줄('OO 군 경작지 넓이' · 바퀴 17 결정 — 답은 화면 · 대장과 같은 장부) */
/* ═══ 답 ↔ 지도 강조의 화면 쪽(chat-hl.js) — 다른 시군구 읍면동 경계 · 누름(그 곳으로 + 조건) ═══ */
const EMDC = new Map();
function hlEmds(sgg) {
  if (!EMDC.has(sgg)) EMDC.set(sgg, api('/regions/' + encodeURIComponent(sgg) + '/emd').then((fc) => (fc?.features || []).map((f) => ({ cd: String(f.properties.emd_cd), nm: f.properties.name, bbox: f.properties.bbox, geometry: f.geometry })), () => { EMDC.delete(sgg); return []; }));
  return EMDC.get(sgg);
}
/** 답 글의 이름을 눌렀을 때 — 시군구 = 그 지역으로 · 읍면동 = 통계 색칠 중이면 그 판에서 고름, 아니면 그 읍면동 조건 + 그곳으로. 화면이 처리했으면 true */
function hlFocus(ref, it) {
  if (ref.level === 'sgg') { const r = byCode(it.k); if (!r) return false; if (S.region?.code !== r.code) setRegion(r); else goKeep(r.bbox, { ms: RM() ? 0 : 1200, maxZoom: 12.5 }); return true; }
  if (OM?.on && OM.spec?.map?.level === 'emd' && String(OM.spec.map.sgg || '') === String(ref.sgg)) { OM.pick(it.k, true); return true; }
  const here = S.region && (S.region.code === String(ref.sgg) || codesOf(S.region).includes(String(ref.sgg)));
  const e = here && S.remd.find((x) => x.cd === it.k);
  if (e) { setCond({ emd: e }); goKeep(e.bbox, { ms: RM() ? 0 : 1200, maxZoom: 13.5 }); return true; }
  return false;
}
/** 지역을 옮기면 — 강조가 가리키던 곳이 새 지역 밖이면 걷는다 */
function hlKeep(r) {
  const c = HL?.cur; if (!c) return;
  const codes = r ? [r.code, ...codesOf(r)] : [];
  const keep = c.level === 'sgg' ? c.items.some((it) => codes.includes(it.k)) : codes.includes(String(c.sgg));
  if (!keep) HL.clear();
}
function xiSugg() { return NAT && NAT.id !== 'kr' && NAT.sel ? [`${NAT.sel} 군 경작지 넓이`] : []; }
function ask(q) {
  cmdk.open(q);
  requestAnimationFrame(() => cmdk.el.querySelector('form')?.requestSubmit());
}

/* ═══ 에이전트 → 지도(카메라 · 채색 · 집계 · 지역 · 줌 · 시점 · 층 · 분석 보기) ═══
   동작을 끝내면 kit:agent-action-done {op, ok} (plan 3.2). 지도 상태 변화는 window.__xc.agent 에 남는다(실증 기록 · 화면엔 없음). */
let closeT = 0;
const camNow = () => ({ center: [+map.getCenter().lng.toFixed(5), +map.getCenter().lat.toFixed(5)], zoom: +map.getZoom().toFixed(2), pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()),
  region: S.region?.code || null, img: !!S.layers.img, ai: !!S.layers.ai, sus: !!S.layers.sus, parcel: !!S.layers.parcel });
/** 카메라 이동(지역 · 읍면동) — 입체(S.tilt)면 지금 기울기를 유지한다(전역 분석을 시작해도 평면으로 풀리지 않게 · r3-xi) */
/* 비행은 화면 프레임(requestAnimationFrame)으로 돈다 — 탭이 뒤로 가면 프레임이 멈춰 끝나지 않는다. 동작 끝 신호가 영영 안 나가지 않게
   비행 시간 + 1.5초에서 기다림을 끊는다(카메라는 탭이 다시 보이면 이어서 도착한다). */
const goKeep = (b, o = {}) => Promise.race([stage.go(b, { ...o, pitch: 0 }),
  new Promise((res) => setTimeout(() => res(true), (o.ms ?? 2400) + 1500))]);
const settled = () => new Promise((res) => { if (!map.isMoving()) return setTimeout(res, 60); map.once('moveend', () => setTimeout(res, 60)); setTimeout(res, 4000); });
let agentQ = Promise.resolve();
/** 한 답의 동작들(이동 → 확대 → 시점 …)은 차례로 — 앞 동작의 카메라 이동이 끝난 뒤 다음 */
function onAgent(a) { if (a?.op) agentQ = agentQ.then(() => runAgent(a), () => runAgent(a)); return agentQ; }
async function runAgent(a) {
  const before = camNow();
  let ok = true, reason = null, same = false, hint = null;
  try {
    const res = await agentOp(a);
    if (res && typeof res === 'object') { ok = res.ok !== false; reason = res.reason || null; same = !!res.same; hint = res.hint || null; } else ok = res !== false;
  } catch (e) { ok = false; reason = '지도 동작을 하지 못했습니다'; K.devlog('agent op', `${a.op} ${e?.message || e}`); }
  if (['map_region', 'map_zoom', 'map_view'].includes(a.op)) await settled();
  const after = camNow();
  if (ok && a.op === 'map_zoom' && Math.abs(after.zoom - before.zoom) < 0.05) { ok = false; reason ||= (after.zoom >= before.zoom ? '더 확대할 수 없습니다' : '더 축소할 수 없습니다'); }
  if (!ok && !reason) reason = '지도 동작을 하지 못했습니다';
  (X.agent ||= []).push({ op: a.op, ok, reason, same, before, after, at: new Date().toISOString() });
  document.dispatchEvent(new CustomEvent('kit:agent-action-done', { detail: { op: a.op, ok, ...(reason ? { reason } : {}), ...(same ? { same: true } : {}), ...(hint ? { hint } : {}) } }));
  // 지도 동작 뒤 바를 접되, 답(한 줄 · 숫자)이 있으면 읽을 수 있게 그대로 둔다(닫기는 사용자가 Esc · 바깥 누르기)
  if (['map_on', 'map_arrive', 'map_flyto', 'parcel_card', 'map_region', 'map_zoom', 'map_view', 'map_layer', 'analysis_watch'].includes(a.op)) { clearTimeout(closeT); closeT = setTimeout(() => { if (!hasAnswer()) cmdk.close(); }, 1600); }
}
/** 에이전트가 준 시군구(새 12xxx · 옛 46xxx 코드 · 이름 · 범위) → 지도 경계의 시군구 */
async function regionFromAgent(a) {
  const c = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  const byBox = a.bbox ? S.regions.filter((x) => near(x.bbox, a.bbox) && (!a.name || lastName(x.name) === lastName(a.name) || norm(x.name) === norm(a.name)))
    .sort((x, y) => d2(c(x.bbox), c(a.bbox)) - d2(c(y.bbox), c(a.bbox)))[0] : null;
  return findRegion(String(a.sgg_cd || a.region || '')) || (a.prev_cd && findRegion(String(a.prev_cd))) || byBox
    || (a.sgg_cd && await regionByCode(String(a.sgg_cd))) || (a.name && findRegion(a.name)) || null;
}
async function agentOp(a) {
  if (a.op === 'ximap_dash') {                         // XI ChatGEO 통계 — 1단계 = 지도에만(원칙 262: 차오름 → 꼬리표 → 날아가기 + 한 줄) · 통계는 원할 때 2(판) · 3(대시보드)
    if (!DS && !OM) return { ok: false, reason: '이 화면에서는 통계를 열 수 없습니다' };
    LASTSPEC = a.spec;
    return setStep(STEP || 1, { fresh: true });        // 이미 2 · 3단계를 보고 있으면 그 단계에 새 사양
  }
  if (a.op === 'map_task') {                           // XI ChatGEO 업무 거르기 — '○○만 보여 줘' · '원래대로'(말풍선 업무 줄과 같은 길)
    if (!BD?.data) return { ok: false, reason: '전국 결과를 불러오지 못했습니다' };
    if (a.clear) { const was = BD.task; applyTask(null); return was ? true : { ok: true, same: true }; }
    if (!BD.tasks().includes(a.task)) return { ok: false, reason: `${a.task} 결과가 지도에 없습니다` };
    const same = BD.task === a.task;
    applyTask(a.task);
    return same ? { ok: true, same: true } : true;
  }
  if (a.op === 'map_on' && a.filter) {
    const f = a.filter, e = f.emd_cd ? S.emds.find((x) => x.cd === String(f.emd_cd)) : null;
    const r = e ? byCode(e.cd) : null;
    const apply = () => { setCond({ emd: e || null, rule: S.fc && f.rule && ALL_RULES.includes(f.rule) ? f.rule : null }); if (S.fc) S.list = true; patchRail(); };
    if (r && S.region?.code !== r.code) await setRegion(r).then(apply); else apply();
    return true;
  }
  // 보유 결과 답의 이동(시군구 코드 동봉) → 지역을 그곳으로 바꿔 머리글 · 점이 답과 같은 곳을 가리키게
  if (a.op === 'map_flyto' && a.region) {
    const r = await regionFromAgent({ region: a.region, bbox: a.bbox });
    if (r && S.region?.code !== r.code) setRegion(r);
    return true;
  }
  if (a.op === 'map_region') {                         // 결과가 없어도 그 시군구 경계로 간다 · 읍면동(emd_cd)이면 그 읍면동 경계로
    const r = await regionFromAgent({ ...a, bbox: a.sgg_bbox || a.bbox });
    if (!r) {
      const b = a.emd_bbox || a.bbox;
      if (b) { await goKeep(b, { ms: RM() ? 0 : 1600, maxZoom: a.emd_cd ? 14 : 12.5 }); return true; }
      return { ok: false, reason: '그 지역을 지도에서 찾지 못했습니다' };
    }
    const eb = a.emd_cd ? (a.emd_bbox || a.bbox) : null;              // 읍면동 범위(없으면 시군구 범위로만)
    const moved = S.region?.code !== r.code;
    if (moved) await setRegion(r, eb ? { to: { bbox: eb, ms: 1600, maxZoom: 14 } } : {});
    else await goKeep(eb || r.bbox, { ms: RM() ? 0 : 1600, maxZoom: eb ? 14 : 12.5 });
    if (!a.emd_cd) return true;
    await S.rdP?.catch?.(() => {});
    const nm = a.emd_name || a.emd || '';
    const e = S.remd.find((x) => x.cd === String(a.emd_cd) || String(a.emd_cd).startsWith(x.cd) || x.cd.startsWith(String(a.emd_cd)))
      || (nm && S.remd.find((x) => norm(x.nm) === norm(nm)));
    if (e) { setCond({ emd: e }); searchInput.value = e.nm; if (!eb) await goKeep(e.bbox, { ms: RM() ? 0 : 1600, maxZoom: 14 }); return true; }
    return eb ? true : { ok: false, reason: '그 읍면동 경계를 불러오지 못했습니다' };
  }
  if (a.op === 'map_zoom') {
    const z0 = map.getZoom(), z = a.zoom != null ? +a.zoom : z0 + (+a.delta || 1), to = Math.max(5, Math.min(19, z));
    if (Math.abs(to - z0) < 0.05) return { ok: false, reason: z >= z0 ? '더 확대할 수 없습니다' : '더 축소할 수 없습니다' };
    map.easeTo({ zoom: to, duration: RM() ? 0 : 900 });
    return true;
  }
  if (a.op === 'map_view') {
    if ((+a.pitch || 0) > 0) return { ok: false, reason: 'XI맵은 위에서 내려다보는 지도만 씁니다(입체 보기 없음)' };   // 원칙 196
    const p0 = map.getPitch(), p = 0;
    if (Math.abs(p - p0) < 0.5 && Math.abs((+a.bearing || 0) - map.getBearing()) < 0.5) return { ok: true, same: true };   // 바뀐 것 0 — '이미 입체로 보고 있습니다'(확인 16차 규칙 ①)
    await setView(p, +a.bearing || 0); return true;
  }
  if (a.op === 'map_layer') {
    const k = { imagery: 'img', results: 'ai', findings: 'sus', parcels: 'parcel' }[a.layer];
    if (!k) return { ok: false, reason: '그 층은 이 지도에 없습니다' };
    const have = { img: (S.imgLayers || []).length, ai: (S.res || []).length, sus: S.fc ? (S.susLayers || []).length : 0, parcel: (S.parcelLayers || []).length + (map.getLayer('xc-lxmap') ? 1 : 0) }[k];   // LX 화면 = 실태조사 층 없음(원칙 135)
    if (!have) return { ok: false, reason: k === 'img' ? '이 지도에는 영상 층이 없습니다' : k === 'ai' ? '이 지역에는 AI 분석 결과 층이 없습니다' : '이 지역에는 그 층이 없습니다' };
    const want = a.on !== false;
    if (k === 'ai' && want && typeof a.only === 'string' && a.only) {
      // '비닐하우스 결과만' — 그 서비스 결과 세트만 켠다(이름 = 카탈로그 · 없으면 못 함)
      const w = norm(a.only), hit = (S.res || []).filter((it) => norm(it.name?.ko || it.id).includes(w));
      if (!hit.length) return { ok: false, reason: `이 지역에는 ${a.only} AI 분석 결과가 없습니다` };
      const before = JSON.stringify([S.layers.ai, (S.res || []).map((it) => !!S.resOn[it.id])]);
      for (const it of S.res || []) S.resOn[it.id] = hit.includes(it);
      S.layers.ai = true; S.aiUser = true; S.aiByRegion = false; applyLayers(); if (S.tool === 'layers') renderLayers();
      return { ok: true, same: before === JSON.stringify([true, (S.res || []).map((it) => !!S.resOn[it.id])]) };
    }
    if (k === 'sus' && want && a.only === true) {
      // 기관 화면 '실태조사 필지만' — 그 층만 남기고 AI 분석 결과는 내린다
      const same0 = S.layers.sus && !S.layers.ai;
      S.layers.sus = true; S.layers.ai = false; S.aiByRegion = false; applyLayers(); if (S.tool === 'layers') renderLayers();
      return { ok: true, same: same0 };
    }
    const same = (k === 'ai' ? aiOn() : S.layers[k]) === want && (k !== 'ai' || !want || (S.res || []).every((it) => S.resOn[it.id]));
    if (k === 'parcel') { setLxmap(want); if (S.tool === 'layers') renderLayers(); return { ok: true, same }; }   // 지적 = 한 줄(지적선 + 편집지적도 · 10-17)
    S.layers[k] = want;
    if (k === 'ai') { S.aiUser = true; S.aiByRegion = false; if (S.layers.ai) for (const it of S.res || []) S.resOn[it.id] = true; }
    applyLayers();
    if (S.tool === 'layers') renderLayers();
    // 기관 화면: 결과 층을 껐는데 지도에 주황 점(실태조사 필지)이 남아 있으면 — 그 점이 무엇인지와 끄는 버튼(실태 18 · 확인 16차 규칙 ①)
    const susOn = k === 'ai' && !want && S.layers.sus && (S.last?.items || []).length > 0;
    return { ok: true, same, hint: susOn ? { label: '현장 확인 필요 층도 끄기', q: '현장 확인 필요 층 꺼 줘' } : null };
  }
  if (a.op === 'analysis_watch') {                     // 말로 실행한 분석 — 진행 보기에 붙는다(결과가 읍면동 순으로 차오름 · 범위 문장은 작업 값 그대로)
    if (!AN || !a.job_id) return { ok: false, reason: '진행 화면을 열 수 없습니다' };
    const r = await regionFromAgent(a);
    if (r && S.region?.code !== r.code) await setRegion(r);
    closePop(); closeDrawer();
    S.tool = 'analyze'; patchRail();
    const ok = await AN.watch(a.job_id, S.region || r, { cls: a.cls || null, scope: a.scope_text || null, rest: a.scope_rest || null });
    return ok ? true : { ok: false, reason: '진행 화면을 열 수 없습니다' };
  }
  if (a.op === 'screen_open') {                         // 이미 XI맵 — 지역을 넘겼으면 그곳으로
    const rc = new URLSearchParams(String(a.href || '').split('?')[1] || '').get('region');
    const r = rc ? await regionFromAgent({ sgg_cd: rc }) : null;
    if (r && S.region?.code !== r.code) await setRegion(r);
    return true;
  }
  if (a.op === 'map_compare') {                        // 두 시점 나란히(확인 16차 대화-2 ⓑ · expand 4) — 가르기 왼쪽 · 오른쪽에 서로 다른 시점 영상
    const r = a.sgg_cd ? await regionFromAgent(a) : null;
    if (r && S.region?.code !== r.code) await setRegion(r);
    if (!a.left?.id || !a.right?.id) return { ok: false, reason: '나란히 볼 두 시점이 없습니다' };
    return (await compareOn(a.left.id, a.right.id)) ? true : { ok: false, reason: '두 시점 영상을 불러오지 못했습니다' };
  }
  if (a.op === 'map_draw') {                           // 범위 그리기 켜기(expand 5) — 분석 도구의 그리기(그리면 견적 · 실행 카드)
    if (!AN) return { ok: false, reason: '이 계정은 분석 범위를 그릴 수 없습니다' };
    const r = a.sgg_cd ? await regionFromAgent(a) : null;
    if (r && S.region?.code !== r.code) await setRegion(r);
    if (!AN.active) tool('analyze');
    for (let i = 0; i < 20 && !AN.active; i++) await new Promise((res) => setTimeout(res, 100));
    return AN.active ? true : { ok: false, reason: '범위 그리기를 켜지 못했습니다' };
  }
  if (a.op === 'parcel_card' && a.pnu) { openParcel(String(a.pnu)); return true; }
  if (a.op === 'drawer_open' && a.kind === 'report') { tool('report'); return true; }
  return true;
}
/* 명령 바 막대 차트(읍면동별) — 막대를 누르면 그 읍면동으로(kit:chart-pick {label, key}).
   명령 바가 이벤트를 내지 않아도 막대(.k-bar) 누르기를 여기서 받아 같은 이벤트로 바꾼다 */
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.k-ck .k-bar'); if (!b) return;
  const label = b.querySelector('.k-bar-l')?.textContent?.trim(); if (!label) return;
  // 어느 시군구의 막대인지 — 차트 제목 · 답 글 · 물은 말(막대에 코드가 없을 때 경계 조회에 쓴다)
  const ck = b.closest('.k-ck') || document;
  const hint = [b.closest('.k-ck-blk')?.querySelector('.k-ck-bt')?.textContent, ck.querySelector('.k-ck-a')?.textContent, ck.querySelector('.k-ck-i')?.value].filter(Boolean).join(' ');
  document.dispatchEvent(new CustomEvent('kit:chart-pick', { detail: { label, key: b.dataset.key || null, hint } }));
});
/** 읍면동 이름 · 코드로 목록에서 찾기(같은 이름 → 끝말 같은 이름) */
const emdMatch = (pool, key, nm) => (key && pool.find((x) => x.cd === key)) || pool.find((x) => norm(x.nm) === norm(nm))
  || pool.find((x) => nm && norm(x.nm).endsWith(norm(nm.split(/\s+/).pop())));
/** 시군구 읍면동 경계(GET /regions/{sgg}/emd) — 막대 누르기 보조 조회(탭 안 기억) */
const EMD_OF = new Map();
function emdOf(r) {
  if (r.code === S.region?.code && S.remd.length) return Promise.resolve(S.remd);
  if (!EMD_OF.has(r.code)) EMD_OF.set(r.code, api('/regions/' + encodeURIComponent(r.code) + '/emd')
    .then((j) => (j.features || []).map((f) => ({ cd: String(f.properties.emd_cd), nm: f.properties.name, bbox: f.properties.bbox, geometry: f.geometry })))
    .catch((err) => { EMD_OF.delete(r.code); throw err; }));
  return EMD_OF.get(r.code);
}
/** 막대가 가리키는 읍면동 — 집계 목록(S.emds)이 비어 있어도(실태조사 적재 중) 찾는다:
    ① 지금 시군구 경계 · 집계 목록 ② 차트 제목 · 답에 이름이 나온 시군구의 경계 ③ 지금 시군구 경계(서버). → { e, r } · null */
async function chartEmd(key, nm, hint) {
  const pool = [...S.remd, ...regionEmds(), ...S.emds];
  const hit = emdMatch(pool, key, nm);
  if (hit) return { e: hit, r: S.remd.some((x) => x.cd === hit.cd) ? S.region : byCode(hit.cd) };
  const regs = [];
  if (key.length >= 5) { const r = byCode(key); if (r) regs.push(r); }
  const named = S.regions.filter((r) => hint && hint.includes(r.name) && r.name.length >= 2)
    .sort((x, y) => (y.sido === S.region?.sido) - (x.sido === S.region?.sido) || y.name.length - x.name.length);
  regs.push(...named.slice(0, 3));
  if (S.region) regs.push(S.region);
  const seen = new Set();
  for (const r of regs) {
    if (seen.has(r.code)) continue; seen.add(r.code);
    let list = [];
    try { list = await emdOf(r); } catch (err) { K.devlog('chart pick emd', `${r.code} ${err?.status ?? 0}`); continue; }
    const e = emdMatch(list, key, nm);
    if (e) return { e, r };
  }
  return null;
}
document.addEventListener('kit:chart-pick', async (e) => {
  const d = e.detail || {}, key = String(d.key || d.emd_cd || ''), nm = String(d.label || '').trim();
  const at = new Date().toISOString();
  const got = await chartEmd(key, nm, String(d.hint || ''));
  if (!got) {
    K.devlog('chart pick', `${key} ${nm} 없음`);
    const w = nm || '그 읍면동', c = w.charCodeAt(w.length - 1), jong = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 > 0;
    K.toast(`${w}${jong ? '을' : '를'} 지도에서 찾지 못했습니다`);
    (X.agent ||= []).push({ op: 'chart_pick', ok: false, emd: nm, at });
    return;
  }
  const { e: hit, r } = got;
  const here = r && S.region?.code === r.code ? S.region : r;
  await goEmd(hit, here);
  (X.agent ||= []).push({ op: 'chart_pick', ok: true, emd: hit.nm, region: r?.name || null, at });
});
function hasAnswer() {
  const el = cmdk?.el; if (!el) return false;
  if (el.dataset.state === 'busy') return true;            // 답이 오는 중 — 접지 않는다
  const a = el.querySelector('.k-ck-a');
  return !!(a && !a.hidden && a.textContent.trim());
}

/* ═══ 서랍: 목록 · 필지 ═══ */
function closeDrawer() { if (S.drawer) { const d = S.drawer; S.drawer = null; d.close(true); } stage.geo('sel', null, 'focus'); stage.pad({}); }
function drawerOpen(title, onClose) {
  if (STEP) leaveStats(false);                                                            // 오른쪽 자리는 하나(원칙 279) — 서랍이 열리면 지도 위 통계는 걷는다(통계가 열릴 때 서랍을 닫는 것과 짝) · 카메라는 그대로
  const d = K.drawer({ title, host: mainEl, slot: 'right', onClose: () => { if (S.drawer === d) S.drawer = null; stage.geo('sel', null, 'focus'); stage.pad({}); onClose?.(); patchRail(); } });
  S.drawer = d; stage.pad(MOBILE() ? { bottom: Math.round(innerHeight * 0.5) } : { right: 496 });   // 서랍 392 + 도구 열 왼쪽(96) + 틈 8
  return d;
}
/** 지도 위 통계 걷기 — cam=false 면 카메라를 되돌리지 않는다(서랍이 자리를 차지할 때) */
function leaveStats(cam = true) { KEEPCAM = !cam; try { setStep(0); } finally { KEEPCAM = false; } }

/* ═══ 지도 위 배치 하나(10-17 원칙 279 "지도 위 지저분한걸 최소화 하고 깔끔해야 · 서로 겹치지 않게") ═══
   도구 열(right 16 · top 68)이 기준. --xc-tb = 도구 열 아래(통계 판 · 한 줄의 기본 자리) · --xc-xr = 오른쪽에 자리 잡은 폭(도구 열 96 · 도구 열 아래 통계가 펼쳐져 있으면 그 폭 — 서랍 · 도구 판은 그 왼쪽)
   --xc-cl · --xc-cw = 아래 채팅 창의 가운데 · 폭: 아래 띠(답 칸이 펼쳐질 수 있는 높이)에 떠 있는 것(서랍 · 분석 요청 칸 · 통계 판 · 도구 열 …) 사이 가장 넓은 빈 자리 · 폭 ≤ 680. 겹치는 것이 바뀔 때마다 다시 잰다(변화 감시 · 창 크기). */
const LV = {};
let LVC = false;
function setVar(k, v) { if (LV[k] === v) return; LV[k] = v; LVC = true; mainEl.style.setProperty(k, v); }
let layQ = 0, layT = 0;
function layout() { cancelAnimationFrame(layQ); layQ = requestAnimationFrame(layoutNow); clearTimeout(layT); layT = setTimeout(layoutNow, 260); }   // 바로 한 번 + 움직임(180ms)이 끝난 뒤 한 번
function layoutNow() {
  if (!mainEl?.isConnected) return;
  const hr = mainEl.getBoundingClientRect(), W = hr.width, H = hr.height;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left - hr.left, y0: r.top - hr.top, x1: r.right - hr.left, y1: r.bottom - hr.top, w: r.width, h: r.height }; };
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const tb = toolsEl && vis(toolsEl) ? rect(toolsEl).y1 + 8 : 68;
  setVar('--xc-tb', Math.round(tb) + 'px');
  let xr = 96;
  for (const el of mainEl.querySelectorAll('.xo:not([hidden]):not(.pn-collapsed):not(.is-free), .xo-mini:not([hidden])')) if (vis(el)) xr = Math.max(xr, 16 + el.getBoundingClientRect().width + 8);
  setVar('--xc-xr', Math.round(xr) + 'px');
  const root = mainEl.querySelector('.k-chat-root[data-dock]');
  if (!root) return;
  if (W <= 900) { setVar('--xc-cl', '50%'); setVar('--xc-cw', 'calc(100% - 24px)'); return; }
  const open = root.hasAttribute('data-turns') && !root.hasAttribute('data-fold');
  const band = H - (open ? 260 : 140);   // 답 띠(입력 한 줄 + 띠 ≈ 212)가 서 있는 높이까지만 비켜 선다
  const iv = [];
  for (const el of mainEl.querySelectorAll('.k-drawer.is-open, .xc-pop:not([hidden]), .xa-card:not([hidden]), .xo:not([hidden]):not(.pn-collapsed), .xo-mini:not([hidden]), .xc-tools, .xv-sw:not([hidden]), .xo-sw:not([hidden]), .xe-card:not([hidden]), .xn-hud:not([hidden]), .xc-cmp:not([hidden])')) {
    if (!vis(el)) continue; const r = rect(el); if (r.w < 2 || r.h < 2 || r.y1 < band) continue;
    iv.push([r.x0 - 12, r.x1 + 12]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  const gaps = []; let x = 16;
  for (const [a, b] of iv) { if (a > x) gaps.push([x, a]); x = Math.max(x, b); }
  if (W - 16 > x) gaps.push([x, W - 16]);
  const g = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || [16, W - 16];
  const cw = Math.max(280, Math.min(680, g[1] - g[0] - 16));
  const cl = Math.min(Math.max((g[0] + g[1]) / 2, 16 + cw / 2), W - 16 - cw / 2);
  setVar('--xc-cl', Math.round(cl) + 'px'); setVar('--xc-cw', Math.round(cw) + 'px');
  X.layout = { tb: Math.round(tb), xr: Math.round(xr), cl: Math.round(cl), cw: Math.round(cw), open, obstacles: iv.length };
  if (LVC) { LVC = false; mainEl.dispatchEvent(new CustomEvent('xc:layout', { detail: X.layout })); }   // 자리가 실제로 바뀐 때만 — 지도 위 꼬리표가 새 배치를 피해 다시 자리 잡게(onmap.js)
}
function mountLayout() {
  X.relayout = layoutNow;   // 실증 기록용(화면엔 없음)
  layoutNow();
  const ro = new ResizeObserver(layout); ro.observe(mainEl);
  for (const el of mainEl.querySelectorAll('.xo, .xo-mini, .xa-card, .xc-pop, .xc-tools')) ro.observe(el);   // 판 폭이 바뀌는 동안(끌기 · 펼침)도 따라 잰다
  new MutationObserver((ms) => { if (ms.some((m) => m.target !== mainEl || m.attributeName !== 'style')) layout(); }).observe(mainEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'data-fold', 'data-turns', 'data-state'] });
  document.addEventListener('kit:drawer', layout);
  mainEl.addEventListener('transitionend', layout, true);                                // 판 폭 · 서랍 등장 움직임이 끝난 자리로
  mainEl.addEventListener('panes:resize', layout);                                      // 손잡이로 폭을 끌 때
  addEventListener('resize', layout);
}
function openList() {
  const n = S.need?.value;
  const title = n != null ? `현장 확인 필요 ${nf(n)}` : '현장 확인 필요';
  const d = S.drawer && S.drawer.__kind === 'list' ? S.drawer.title(title) : drawerOpen(title, () => { S.list = null; });
  d.__kind = 'list'; S.list = true; patchRail();
  const box = h('div.xc-list');
  const sp = S.suspect;
  if (sp) box.append(h('p.xc-list-sus', { dataset: sp.building ? { metric: '의심 필지' } : { metric: sp.label, v: String(sp.env.value) } },
    h('span', { text: sp.building ? '의심 필지' : sp.label }), h('b.num', { text: sp.building ? '집계 중' : nf(sp.env.value) }), sp.building ? null : h('small', { text: '건 · 아래는 현장 확인 필요' })));
  if (!S.last && S.hudFail) { K.empty(box, { kind: 'first', title: '현황을 불러오지 못했습니다', action: { label: '다시 시도', onClick: () => refresh() } }); d.set(box); return; }
  if (!S.last && hudBig.dataset.st === 'wait') { K.empty(box, { kind: 'loading' }).set({ progress: null }); d.set(box); return; }
  if (!S.last) { K.empty(box, { kind: 'first', text: '이 지역의 첫 분석이 끝나면 여기에 모입니다' }); d.set(box); return; }
  const seen = new Set(), rows = [];
  for (const f of S.last.items) { if (seen.has(f.pnu)) continue; seen.add(f.pnu); rows.push(f); }
  let shown = 40;
  const ul = h('ol.xc-rows');
  const draw = () => {
    ul.innerHTML = '';
    for (const f of rows.slice(0, shown)) ul.append(h('li', {}, h('button', { type: 'button', 'aria-current': S.sel === f.pnu ? 'true' : undefined, onclick: () => openParcel(f.pnu, { fly: true, back: true }) },
      h('b', { text: jibun(f.addr) }), ruleName(f.rule) ? h('span', { text: '· ' + ruleName(f.rule) }) : null)));
    more.hidden = rows.length <= shown;
  };
  const more = h('button.t-btn.t-btn--text.xc-more', { type: 'button', text: '더 보기', onclick: () => { shown += 40; draw(); } });
  box.append(ul, more); draw();
  d.set(box);
}
async function openParcel(pnu, { fly = false } = {}) {
  if (!pnu) return;
  S.sel = pnu;
  let d;
  try { d = await api(`/survey/parcels/${encodeURIComponent(pnu)}?with=facts,findings,geom`); } catch { K.toast('필지를 불러오지 못했습니다'); return; }
  if (S.sel !== pnu) return;
  const f = (d.findings || []).find((x) => ['open', 'assigned'].includes(x.state)) || d.findings?.[0] || null;
  const L = d.facts?.ledger || {};
  const reviewed = f && ['inspected', 'closed'].includes(f.state);
  const dr = drawerOpen(jibun(d.addr), () => { S.sel = null; S.list = null; });
  dr.__kind = 'parcel'; S.list = null; patchRail();
  if (d.geometry) { stage.geo('sel', { type: 'Feature', properties: {}, geometry: d.geometry }, 'focus'); if (fly) stage.go(K.bboxOf(d.geometry), { ms: 1250, maxZoom: 17.5 }); }
  // 규칙 → AI 가 본 것(/survey/stats?by=rule 의 모든 키). 모르는 키는 규칙 이름을 그대로
  const cls = { R1: '건물', R2: '경작 흔적 없음', R3: '비닐하우스', R4: '주차장', R5: '개간지', R6: '건물', L1: '건물', L2: '경작 흔적 없음', L3: '건물 없음' };
  const seen = f ? (cls[f.rule] || ruleName(f.rule) || f.rule_nm || '—') : '—';
  const m2 = (e) => (e && e.value != null ? `${nf(Math.round(e.value))}㎡${K.sig(e)}` : '—');
  const pct = f?.evid_pct?.value;
  const body = h('div.xc-parcel', {},
    h('p.xc-tags', {}, h('span.t-chip', { text: reviewed ? '✓ 확인됨' : 'AI 분석 · 확인 전', 'data-lv': reviewed ? undefined : 'wait' }), f && (ruleName(f.rule) || f.rule_nm) ? h('span.t-chip', { text: ruleName(f.rule) || f.rule_nm }) : null),
    h('dl.xc-pair', {},
      h('div', {}, h('dt', { text: '연속지적 대장' }), h('dd', { html: `<b>${esc(L.jimok_nm || L.jimok || '—')}</b> ${m2(L.area_m2)}` })),
      h('div.ai', {}, h('dt', { text: 'AI 분석' }), h('dd', { html: f ? `<b>${esc(seen)}</b> ${m2(f.evid_m2)}${pct != null ? ` · ${Math.round(pct)}%` : ''}` : '—' }))),
  );
  const act = h('div.xc-act');
  if (f && S.lx && S.key !== 'lx/sales' && ['open', 'assigned'].includes(f.state)) act.append(h('button.t-btn.t-btn--2', { type: 'button', text: '오탐', onclick: (e) => setState(f, 'dismissed', e.currentTarget) }));
  // 영상 설명(AI 의견) — 명령 바에 '{읍면동 리 지번} 영상 설명해 줘'를 보낸다(설명 도구는 에이전트 · 근거 아님 꼬리표)
  // 기관 필지 카드는 '영상 설명' 없이 메모 한 줄 + 다음 확인 날짜(18차 기관-9 ⓑ · gov-select/map-extras.js parcelNote)
  const where = String(d.addr || '').trim().split(/\s+/).slice(-3).join(' ');
  const rv = canRequest(S.who);   // 기관 계정: 이 필지를 LX 담당자에게 검토 요청(메모 한 줄 · 선택)
  if (where && !rv) act.append(h('button.t-btn.t-btn--2', { type: 'button', text: '영상 설명', onclick: () => ask(`${where} 영상 설명해 줘`) }));
  // 메모 · 다음 확인 날짜(확인 이력)는 화면에서 쓰지 않는다(원칙 135 기관까지 · 10-10 확인 8 ⓐ) — 옛 흐름(S.fc)에서만
  if (rv && f && S.fc) { const slot = h('div'); body.append(slot); import('../gov-select/map-extras.js').then((m) => m.parcelNote(slot, { finding: f })).catch((e) => K.devlog('note', String(e?.message || e))); }
  if (S.tenant) body.append(parcelInfo(d, L));     // 필지 정보(연속지적 속성) + 이 자리 LX맵 겹쳐 보기(나중 8 ⓐ)
  if (act.childElementCount || rv) body.append(act);
  if (rv) reviewAction(act, { who: S.who, pnu, rule: f?.rule, fid: f?.id, lnglat: f?.lnglat, from: 'xi-clean' });
  dr.set(body);
}
/** 필지 정보 — 연속지적 속성(주소 · 지목 · 면적 · 공시지가 · 용도지역 · 읍면 리 · 필지 번호). 값은 서버(GET /survey/parcels/{pnu} facts.ledger) 그대로 · 없으면 '—' */
function parcelInfo(d, L) {
  const ym = (v) => { const m = /^(\d{4})-?(\d{1,2})/.exec(String(v || '')); return m ? [m[1], String(+m[2])] : null; };
  const gosi = ym(L.jiga?.as_of);
  const row = (k, v, sub) => h('div', {}, h('dt', { text: k }), h('dd', {}, h('span', { text: v || '—' }), sub ? h('small', { text: sub }) : null));
  const area = L.area_m2?.value, jiga = L.jiga?.value;
  const dl = h('dl.xc-pi-l', {},
    row('주소', String(d.addr || '').trim()),
    row('지목', L.jimok_nm || L.jimok),
    row('면적', area != null ? `${nf(Math.round(area * 10) / 10)} m²` : ''),
    row('공시지가', jiga != null ? `${nf(jiga)}원/m²` : '', jiga != null && gosi ? `${gosi[0]}년 ${gosi[1]}월 고시` : ''),
    row('용도지역', L.yongdo, L.yongdo && L.yongdo_year ? `${L.yongdo_year}년 고시` : ''),
    row('읍면 · 리', [d.emd, d.ri].filter(Boolean).join(' · ')),
    h('div.xc-pi-no', {}, h('dt', { text: '필지 번호' }), h('dd', { text: d.pnu || '—' })));
  const sw = h('button.xc-pi-sw', { type: 'button', role: 'switch', 'aria-checked': String(!!S.layers.lxmap), 'aria-label': '이 자리 LX맵 겹쳐 보기' }, h('i'));
  sw.addEventListener('click', () => {
    const on = !S.layers.lxmap;
    let near = null;
    if (on && d.geometry) { const b = K.bboxOf(d.geometry); if (b) near = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
    setLxmap(on, { near });
    sw.setAttribute('aria-checked', String(S.layers.lxmap));
  });
  return h('section.xc-pi', { 'aria-label': '필지 정보' },
    h('header.xc-pi-h', {}, h('h3', { text: '필지 정보' }), h('small', { text: gosi ? `연속지적도 · 공시 ${gosi[0]}.${gosi[1].padStart(2, '0')}` : '연속지적도' })),
    dl, h('label.xc-pi-t', {}, h('span', { text: '이 자리 LX맵 겹쳐 보기' }), sw));
}
async function setState(f, to, btn) {
  btn.disabled = true;
  try {
    const id = (crypto.randomUUID?.() || String(Date.now()) + Math.random()).slice(0, 60);
    await api(`/survey/findings/${encodeURIComponent(f.id)}/state`, { method: 'POST', body: { state: to, client_id: 'xc-' + id, ...(to === 'dismissed' ? { reason: '오탐' } : {}) } });
    K.toast('오탐으로 표시했습니다');
    closeDrawer(); refresh();
  } catch (e) { btn.disabled = false; K.devlog('state', `${e.code} ${e.message}`); K.toast('지금은 바꿀 수 없습니다'); }
}

/* ═══ 도구 ═══ */
function tool(id) {
  const b = toolsEl?.querySelector(`[data-tool="${id}"]`);
  if (b?.getAttribute('aria-disabled') === 'true') return;
  ED?.close();
  if (id === 'list') { if (S.list) { closeDrawer(); S.list = null; } else { closePop(); openList(); } return; }
  if (id === 'swipe') return toggleSwipe();
  if (id === 'analyze') {
    if (AN.active) { if (!AN.running) AN.stop(); S.tool = null; patchRail(); return; }
    closePop(); closeDrawer(); S.tool = 'analyze'; patchRail();
    const e = S.cond.emd;
    // 이 지역에 진행 중인 전역 분석이 있으면 새 분석 카드 대신 그 진행 보기(취소 포함)에 붙는다
    AN.resume(S.region).then((ok) => {
      if (ok || S.tool !== 'analyze' || AN.running) { patchRail(); return; }
      if (e) emdFrame(e).then((f) => { if (S.tool === 'analyze' && !AN.running) AN.start(S.region, f); }); else AN.start(S.region);
    });
    return;
  }
  if (S.tool === id) return closePop();
  if (S.tool === 'analyze' && AN?.active && !AN.running) AN.stop();
  S.tool = id; patchRail();
  ({ layers: renderLayers, rules: renderRules, sweep: renderSweep, report: renderReport })[id]?.();
}
function closePop() { if (S.tool && S.tool !== 'analyze') S.tool = null; pop.hidden = true; patchRail(); }
function showPop(title, ...kids) {
  pop.innerHTML = '';
  pop.append(h('header.xc-pop-h', {}, h('h2', { text: title }), h('button.xa-x', { type: 'button', 'aria-label': '닫기', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>', onclick: closePop })), ...kids);
  pop.hidden = false;
  // 누른 도구 높이에 맞추되 HUD 아래로
  // 누른 도구 높이 · 도구 줄 왼쪽에 연다(오른쪽 도구 줄 · 바퀴 5)
  const b = toolsEl?.querySelector(`[data-tool="${S.tool}"]`), m = mainEl.getBoundingClientRect();
  if (!MOBILE() && b) { const r = b.getBoundingClientRect(); pop.style.top = Math.max(16, r.top - m.top) + 'px'; }
  else pop.style.top = '';
}
function renderLayers() {
  const L = [['img', '영상'], ...(S.fc ? [['sus', '현장 확인 필요']] : []), ['ai', 'AI 분석'], ['emd', '읍면동 경계']];   // LX 화면 = 실태조사 층 없음(원칙 135) · 지적선 + LX맵(편집지적도) = 아래 '지적' 한 줄(10-17 합침 · 원칙 272)
  const rows = L.map(([k, t]) => h('button.xc-row', { type: 'button', 'aria-pressed': String(k === 'ai' ? aiOn() : S.layers[k]), onclick: (e) => { if (k === 'lxmap') { setLxmap(!S.layers.lxmap); e.currentTarget.setAttribute('aria-pressed', String(S.layers.lxmap)); return; } if (k === 'ai') { S.layers.ai = !aiOn(); S.aiUser = true; S.aiByRegion = false; } else S.layers[k] = !S.layers[k]; e.currentTarget.setAttribute('aria-pressed', String(k === 'ai' ? aiOn() : S.layers[k])); applyLayers(); if (k === 'ai') renderLayers(); } }, h('i.xc-sw'), h('span', { text: t }), h('i.xc-key', { dataset: { k } })));
  // AI 분석 아래: 이 지역에 결과가 있는 세트(이름 = 카탈로그 · 전역 분석 결과)
  const sub = (S.res || []).map((it) => h('button.xc-row.xc-row--sub', { type: 'button', 'aria-pressed': String(!!(aiOn() && S.resOn[it.id])), 'data-res': it.id,
    onclick: (e) => { S.aiUser = true; if (!aiOn()) { S.layers.ai = true; S.resOn[it.id] = true; } else S.resOn[it.id] = !S.resOn[it.id]; applyLayers(); renderLayers(); } },
  h('i.xc-sw'), h('span', { text: it.name?.ko || it.id })));
  const ai = rows.findIndex((b) => b.querySelector('[data-k="ai"]'));
  // 클래스 켜기/끄기(10-15) — AI 분석 결과 세트 아래 체크박스 · 색 점 = 그 클래스 색 · 끄면 지도 · 숫자에서 빠짐('보이는 것 기준')
  const cls = S.board && aiOn() ? visibleClasses() : [];
  const clsRows = cls.map((c) => h('div.xc-clsr', {}, h('button.xc-row.xc-row--cls', { type: 'button', role: 'checkbox', 'aria-checked': String(!S.clsOff.has(c)), 'data-cls': c,
    onclick: () => { if (S.clsOff.has(c)) S.clsOff.delete(c); else S.clsOff.add(c); applyClsOff(); renderLayers(); } },
  h('i.xc-cb'), h('i.xc-dot', { 'aria-hidden': 'true' }), h('span', { text: clsName(c) })),
  h('button.xc-cdot', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': `${clsName(c)} 색`, title: '색', dataset: { cls: c }, onclick: (e) => openClsColors(e.currentTarget, c) },
    h('i', { style: { background: userCol(c) || baseCol(c) } }))));
  // 지적(LX맵 편집지적도 · 10-15 원칙 266) — 클래스 체크박스 옆 한 줄 · 기본 꺼짐 · 보이지 않는 축척이면 체크박스만 흐리게
  const cad = map.getLayer('xc-lxmap') ? h('button.xc-row.xc-row--cls.xc-row--cad', { type: 'button', role: 'checkbox', 'aria-checked': String(!!S.layers.lxmap), 'data-cad': '1',
    onclick: () => setLxmap(!S.layers.lxmap) }, h('i.xc-cb'), h('span', { text: '지적' })) : null;
  rows.splice(ai + 1, 0, ...sub, ...(clsRows.length ? [h('p.xc-pop-l.t-label', { text: '클래스' }), ...clsRows] : []), ...(cad ? [cad] : []));
  showPop('층', h('div.xc-rows-p', {}, ...rows));
  paintCadRow();
}
/** AI 분석 층이 지도에 그려지는가 — 글(요약 GET /summary)과 같은 출처(고침-XI맵글): 요약에 결과가 없는 지역은 사용자가 직접 켜기 전엔 그리지 않는다.
    (층 목록은 카탈로그 · 전역 분석 작업까지 보지만 요약은 배포본 결과만 센다 — 글은 '결과 없음'인데 지도엔 층이 그려지던 어긋남의 원인) */
const aiOn = () => !!S.layers.ai && (S.board || S.aiUser || S.aiHas === true || S.aiHas === null);   // 전국 결과(바퀴 5) = 결과 층은 전국 결과 장부 그대로   // undefined = 요약 조회 중(그리지 않고 기다림) · null = 요약 조회 실패(층은 그대로)
function applyLayers() {
  setVis(map, (S.imgLayers || []).filter((l) => map.getLayer(l)), S.layers.img);
  setVis(map, susSet(), S.layers.sus);
  for (const it of S.res || []) setVis(map, it.ids, !!(aiOn() && S.resOn[it.id]));
  setVis(map, S.parcelLayers, S.layers.parcel);
  setVis(map, S.emdLayers, S.layers.emd);
  if (map.getLayer('xc-lxmap')) setVis(map, ['xc-lxmap'], S.layers.lxmap);
}
function renderRules() {
  const by = S.last?.by_rule || {};
  const rows = ALL_RULES.filter((k) => S.ruleDefs[k] && ruleName(k)).map((k) => h('button.xc-row', { type: 'button', 'aria-pressed': String(S.cond.rule === k), onclick: () => setCond({ rule: S.cond.rule === k ? null : k }) },
    h('i.xc-rd'), h('span', { text: ruleName(k) }), h('em.num', { text: by[k]?.value != null ? nf(by[k].value) : '' })));
  showPop('규칙', h('div.xc-rows-p', {}, ...rows));
}
function renderSweep() {
  const run = h('button.t-btn', { type: 'button', text: '대조 실행', onclick: () => { closePop(); reconcile(); } });
  showPop('대조', h('p.t-label.xc-pop-l', { text: S.asOf ? `${K.df ? K.df(S.asOf) : S.asOf} 기준` : '' }), h('div.xc-act', {}, run));
}
function renderReport() {
  if (!S.region) { showPop('보고서', h('p.t-label.xc-pop-l', { text: '지역을 고르세요' })); return; }
  // 대상 = 지금 지역의 읍면동(기본 = 조건 · 열린 필지 · 기관 화면이면 이 지역 실태조사 목록에서 가장 많은 곳) — 다른 지역 읍면동은 고를 수 없다
  const list = regionEmds();
  if (!list.length) { showPop('보고서', h('p.t-label.xc-pop-l', { text: `${S.region.name} · 실태조사 결과가 없습니다` })); return; }
  let e = reportEmd() || list[0];
  const sel = h('select.xc-sel', { 'aria-label': '보고서 대상 읍면동', onchange: () => { e = list.find((x) => x.cd === sel.value) || e; } },
    ...list.slice().sort((a, b) => a.nm.localeCompare(b.nm, 'ko')).map((x) => h('option', { value: x.cd, text: x.nm, selected: x.cd === e.cd || undefined })));
  const btn = h('button.t-btn', { type: 'button', text: '보고서 초안(한글 문서)', onclick: () => report(e, btn) });
  showPop('보고서', h('p.t-label.xc-pop-l', { text: S.region.name }), sel, h('div.xc-act', {}, btn));
  X.reportDefault = { region: S.region.name, emd: e.nm };
}
/** 보고서 대상 읍면동(지금 지역 안에서만): 조건 → 열린 필지 → (기관 화면) 이 지역 실태조사 목록에서 가장 많은 곳. 지역이 없으면 null(지역 고정값 0) */
function reportEmd() {
  if (!S.region) return null;
  const mine = (e) => e && inRegion(e.cd, S.region) ? e : null;
  const inR = regionEmds();
  if (mine(S.cond.emd)) return S.cond.emd;
  if (S.sel) { const e = inR.find((x) => x.cd === String(S.sel).slice(0, 8)); if (e) return e; }
  const c = {}; for (const f of S.last?.items || []) if (inR.some((x) => x.cd === String(f.emd_cd))) c[f.emd_cd] = (c[f.emd_cd] || 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return top ? inR.find((x) => x.cd === top[0]) || null : null;
}

/* 보고서 초안 — 에이전트(POST /agent/report/draft · SSE) → 한글 문서(.hwpx · 10-14 원칙 250). 분석이 GPU 를 쓰는 동안은 LLM 없는 초안으로(전력 규칙) */
async function report(e, btn) {
  if (!e || btn.disabled) return;
  btn.disabled = true; btn.textContent = '초안 작성 중';
  const name = `실태조사_초안_${e.nm}.hwpx`;
  const save = (blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); K.toast('보고서 초안을 만들었습니다'); };
  const plain = async () => { const r = await api('/survey/reports/draft?' + new URLSearchParams({ emd_cd: e.cd, format: 'hwpx', top: '20', ...(S.cond.rule ? { rule: S.cond.rule } : {}) }), { raw: true }); if (!r.ok) throw new Error(r.status); save(await r.blob()); };
  try {
    if (S.busy) await plain();
    else {
      const r = await api('/agent/report/draft', { method: 'POST', body: { template: 'survey-emd', emd_cd: e.cd, ...(S.cond.rule ? { rule: S.cond.rule } : {}) } });
      const url = await new Promise((res, rej) => {
        let errs = 0;
        const s = sse(r.events_url.replace(/^\/api\/v1/, ''), { events: ['agent.done', 'agent.failed', 'agent.rejected'],
          on: (n, d) => { s.close(); if (n === 'agent.done') res(d?.artifact?.file_url || `/agent/runs/${r.run.id}/draft.hwpx`); else rej(new Error(n)); },
          onState: (st) => { if (st === 'error' && ++errs >= 3) { s.close(); rej(new Error('timeout')); } } });
        setTimeout(() => { s.close(); rej(new Error('timeout')); }, 120000);
      });
      K.devlog('report', url);
      const f = await api(url.replace(/^.*\/api\/v1/, ''), { raw: true });
      if (!f.ok) throw new Error(f.status);
      save(await f.blob());
    }
  } catch (err) {
    K.devlog('report', String(err?.message || err));
    try { await plain(); } catch { K.toast('보고서를 만들지 못했습니다'); }
  } finally { btn.disabled = false; btn.textContent = '보고서 초안(한글 문서)'; }
}

/* 대조 — 실제 작업(POST /jobs kind:survey + SSE) · 읍면동 칸마다 탐지 순간 · 끊기면 3번 다시 → 실패 확정 */
async function reconcile() {
  if (S.busy || S.outside) return;
  const emds = regionEmds(); if (!emds.length) return;
  S.busy = true; mainEl.dataset.busy = '1';
  sessionStorage.setItem('xc_swept', '1');
  const btn = toolsEl?.querySelector('[data-tool="sweep"]'); btn?.setAttribute('data-busy', '1');
  if (S.region) await stage.go(S.region.bbox, { ms: 1250, maxZoom: 12.5 });
  const per = {}; for (const f of S.last?.items || []) (per[f.emd_cd] ||= new Set()).add(f.pnu);
  const big = hudBig.__big;
  const keep = S.need;
  big?.set({ ...(keep || { unit: '필지', basis: 'inferred', as_of: S.asOf || '', source: 'AI 실태조사 결과' }), value: 0 });
  let acc = 0, ok = false;
  try {
    const r = await api('/jobs', { method: 'POST', body: { kind: 'survey', survey_id: 'farmland', rules: ALL_RULES, options: {}, priority: 0, ...(S.sales ? { demo: true } : {}) } });
    K.devlog('sweep job', r.job?.id);
    ok = await new Promise((res) => {
      let errs = 0, fin = false;
      const end = (v) => { if (fin) return; fin = true; s.close(); res(v); };
      const s = sse(r.events_url.replace(/^\/api\/v1/, ''), { events: ['job.started', 'shard.done', 'job.done', 'job.failed', 'job.cancelled'],
        on: (n, d) => {
          if (n === 'shard.done') {
            const cd = String(d?.shard_id || '').replace(/^emd-/, '');
            if (per[cd]) { acc += per[cd].size; big?.set({ ...(keep || {}), value: acc }, { animate: false }); }
            bracket(d?.bbox);
          } else if (n === 'job.done') end(true);
          else if (n === 'job.failed' || n === 'job.cancelled') end(false);
        },
        onState: (st) => { if (st === 'error' && ++errs >= 3) end(false); if (st === 'open') errs = 0; } });
      setTimeout(() => end(false), 60000);
    });
  } catch (e) { K.devlog('sweep', `${e.code || ''} ${e.message || ''}`); ok = false; }
  S.busy = false; mainEl.dataset.busy = ''; btn?.removeAttribute('data-busy');
  K.toast(ok ? '대조했습니다' : '대조를 마치지 못했습니다');
  refresh();
}
function bracket(b) {
  if (!b || RM()) return;
  const a = map.project([b[0], b[3]]), z = map.project([b[2], b[1]]);
  const w = z.x - a.x, hh = z.y - a.y; if (w < 10 || hh < 10) return;
  const el = h('i.xa-bk', { style: { transform: `translate(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px)`, width: w.toFixed(1) + 'px', height: hh.toFixed(1) + 'px' } });
  S.els.fx.append(el);
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1250, easing: 'linear' }).finished.then(() => el.remove(), () => el.remove());
}

/* 가르기 — 왼쪽 = 원본 영상 · 오른쪽 = 영상 + AI 판독(같은 카메라). 확인 16차 대화-2 ⓑ — 위쪽 고르기로 왼쪽 · 오른쪽에 다른 시점 영상을 놓는다 */
let B = null;
async function toggleSwipe() {
  S.swipe = !S.swipe; patchRail();
  const { bEl, grip } = S.els;
  if (!S.swipe) { bEl.hidden = true; grip.hidden = true; cmpOff(); if (S.aiAuto) { S.layers.ai = false; S.aiAuto = false; applyLayers(); } return; }
  if (!S.layers.ai) { S.layers.ai = true; S.aiAuto = true; applyLayers(); }
  mainEl.style.setProperty('--sw', '50%');
  bEl.hidden = false; grip.hidden = false;
  if (!B) {
    B = K.createStage(bEl, { interactive: false, scale: false });
    await B.ready;
    const items = S.cat.items || [], own = items.filter((i) => i.role === 'imagery' && i.source === 'pmtiles').map((i) => i.id);
    try { await B.ladder(items, (S.cat.ladder?.domestic || []).filter((id) => own.includes(id))); } catch { /* */ }
    const sync = () => { if (S.swipe) B.map.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() }); };
    map.on('move', sync);
    let drag = false;
    const setX = (x) => { const r = mainEl.getBoundingClientRect(); const v = Math.max(5, Math.min(95, ((x - r.left) / r.width) * 100)); mainEl.style.setProperty('--sw', v + '%'); grip.setAttribute('aria-valuenow', String(Math.round(v))); };
    grip.addEventListener('pointerdown', (e) => { drag = true; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', (e) => { if (drag) setX(e.clientX); });
    grip.addEventListener('pointerup', () => { drag = false; });
    grip.addEventListener('keydown', (e) => { const r = mainEl.getBoundingClientRect(), v = parseFloat(mainEl.style.getPropertyValue('--sw')) || 50; if (e.key === 'ArrowLeft') setX(r.left + ((v - 4) / 100) * r.width); if (e.key === 'ArrowRight') setX(r.left + ((v + 4) / 100) * r.width); });
  }
  B.map.resize();
  B.map.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
  cmpBar();
}

/* ── 두 시점 고르기(가르기 위쪽 한 줄) — 그 지역을 덮는 등록 영상의 시점(카탈로그 그대로 · 지역 고정값 0) ── */
const epochLabel = (it) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(it?.epoch || '')); return m ? `${m[1]}년${m[2] ? ` ${+m[2]}월` : ''}` : (it?.name?.ko || it?.id || ''); };
function regionEpochs() {
  const b = S.region?.bbox; if (!b) return [];
  const area = Math.max(1e-12, (b[2] - b[0]) * (b[3] - b[1]));
  const rows = [];
  for (const it of S.cat?.items || []) {
    if (it.role !== 'imagery' || it.source === 'external' || /change|landcover|lc-gt|gibs|xdworld/.test(it.id) || !it.bounds || it.tile_ready === false) continue;
    if (!/^\d{4}/.test(String(it.epoch || ''))) continue;
    const ix = [Math.max(b[0], it.bounds[0]), Math.max(b[1], it.bounds[1]), Math.min(b[2], it.bounds[2]), Math.min(b[3], it.bounds[3])];
    const cov = Math.max(0, ix[2] - ix[0]) * Math.max(0, ix[3] - ix[1]) / area;
    if (cov > 0.05) rows.push({ it, cov, label: epochLabel(it) });
  }
  const best = new Map();
  for (const x of rows.sort((p, q) => q.cov - p.cov || String(q.it.epoch).localeCompare(String(p.it.epoch)))) if (!best.has(x.label.slice(0, 4))) best.set(x.label.slice(0, 4), x);
  return [...best.values()].sort((p, q) => String(p.it.epoch).localeCompare(String(q.it.epoch)));
}
async function epochSpec(id) {
  const it = (S.cat?.items || []).find((x) => x.id === id); if (!it) return null;
  if (it.tier === 'raw' && it.source === 'cog') {
    const j = await api('/tiles/sign?' + new URLSearchParams({ set: 'cog/' + it.id }));
    return { it, spec: { type: 'raster', tiles: [onApiHost(j.url)], tileSize: 256, bounds: it.bounds, minzoom: COG_MIN_Z, maxzoom: 19, attribution: it.attribution || '' } };
  }
  return { it, spec: await sourceSpec(it) };
}
/** 한쪽 지도에 그 시점 영상 한 장(맨 위 영상 · 결과 · 필지 아래) — id 없으면 걷기 */
async function cmpLayer(m, side, id) {
  const sid = 'xc-cmp-' + side, lid = sid + '-r';
  if (m.getLayer(lid)) m.removeLayer(lid);
  if (m.getSource(sid)) m.removeSource(sid);
  if (!id) return true;
  const x = await epochSpec(id); if (!x) return false;
  m.addSource(sid, x.spec);
  m.addLayer({ id: lid, type: 'raster', source: sid, minzoom: 6, paint: { 'raster-opacity': 1, 'raster-fade-duration': 200 } }, m.getLayer('slot-reference') ? 'slot-reference' : undefined);
  return !!m.getLayer(lid);
}
function cmpOff() {
  S.cmp = null;
  try { cmpLayer(map, 'r', null); if (B) cmpLayer(B.map, 'l', null); } catch { /* */ }
  if (S.els.cmp) S.els.cmp.hidden = true;
}
/** 두 시점 켜기 — 가르기를 켜고 왼쪽(B) · 오른쪽(본 지도)에 시점 영상을 놓는다. 오른쪽 AI 결과는 내린다(영상끼리 비교) */
async function compareOn(leftId, rightId) {
  if (!S.swipe) await toggleSwipe();
  if (!B) return false;
  await B.ready;
  if (S.aiAuto) { S.layers.ai = false; S.aiAuto = false; applyLayers(); }
  const okL = await cmpLayer(B.map, 'l', leftId), okR = await cmpLayer(map, 'r', rightId);
  S.cmp = { left: leftId, right: rightId };
  cmpBar();
  return okL && okR;
}
function cmpBar() {
  let el = S.els.cmp;
  if (!el) { el = S.els.cmp = h('div.xc-cmp', { role: 'group', 'aria-label': '가르기 시점' }); mainEl.append(el); }
  const eps = regionEpochs();
  el.hidden = !S.swipe;
  if (!S.swipe) return;
  const opt = (v, t, sel) => h('option', { value: v, text: t, selected: sel || undefined });
  const left = h('select.xc-cmp-s', { 'aria-label': '왼쪽 시점' }, opt('', '지금 영상', !S.cmp?.left), ...eps.map((x) => opt(x.it.id, `${x.label} 영상`, S.cmp?.left === x.it.id)));
  const right = h('select.xc-cmp-s', { 'aria-label': '오른쪽 시점' }, opt('', 'AI 분석 결과', !S.cmp?.right), ...eps.map((x) => opt(x.it.id, `${x.label} 영상`, S.cmp?.right === x.it.id)));
  left.onchange = async () => { S.cmp = { ...(S.cmp || {}), left: left.value || null }; await cmpLayer(B.map, 'l', left.value || null); };
  right.onchange = async () => {
    S.cmp = { ...(S.cmp || {}), right: right.value || null };
    await cmpLayer(map, 'r', right.value || null);
    if (!right.value && !S.layers.ai) { S.layers.ai = true; S.aiAuto = true; applyLayers(); }
    else if (right.value && S.aiAuto) { S.layers.ai = false; S.aiAuto = false; applyLayers(); }
  };
  el.replaceChildren(left, h('i.xc-cmp-d', { 'aria-hidden': 'true' }), right);
}

/* 입체는 뺐다(원칙 196) — 지형 타일을 싣지 않고 기울기도 0. 시점 함수는 '위에서 보기'만(말로 하는 map_view 의 평면 복귀) */
async function setView(pitch, bearing) {
  S.tilt = false; patchRail();
  if (S.els?.hud) S.els.hud.dataset.tilt = '';
  map.easeTo({ pitch: 0, bearing: 0, duration: RM() ? 0 : 600 });
}

addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); });
/* 늦음 안내 — 12초 안에 도착하지 못하면 말없이 '불러오는 중'에 머물지 않는다(탭이 많아 연결이 막힌 때 등 · c2-numbers) */
{ // 숨은 탭은 지도가 그려지지 않아 늦는 것이 정상 — 보이는 동안 12초를 넘길 때만 알린다
  let tm = 0;
  const slow = () => { if (X.boot.ready || document.documentElement.dataset.xc === 'error') return; if (document.hidden) return; X.slow = true; try { K.toast(`서버 응답이 늦습니다 · ${X.waitFor || '자료'} 불러오는 중`, { ms: 30000, action: { label: '다시 시도', onClick: () => location.reload() } }); } catch { /* */ } };
  const arm = () => { clearTimeout(tm); if (!document.hidden && !X.boot.ready) tm = setTimeout(slow, 12000); };
  document.addEventListener('visibilitychange', arm); arm(); }
boot().catch((e) => { console.warn('[xi-clean]', e); document.documentElement.dataset.xc = 'error'; X.err = String(e?.message || e); try { K.toast('XI맵을 열지 못했습니다'); } catch { /* */ } });
