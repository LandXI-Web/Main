// 지자체 포털 — 서비스 카드 홈과 서비스 작업공간 (2026-09-20 발주자 정의)
//
//   "지자체는 자기 사이트에 로그인하면 **서비스 카드가 나오고**, 그걸 클릭하면
//    **대시보드 · 분석결과 · 지도서비스 등이 펼쳐지는** 구조.
//    여기서 **서비스 카드는 카드 발행이랑 다른 개념**이야"
//
// ── 두 '카드' 를 구분한다 ────────────────────────────────────────────────
//   발행 카드 (cards.js CARDS)   LX 관점. 잘 만든 AI 모델을 상품으로 내보내는 단위.
//                                 화면: 카드 발행 관리(admin-publish.html) · 프로젝트
//   **서비스 카드** (여기)         지자체 관점. **내 지역에 깔린 서비스의 진입점**.
//                                 로그인하면 이것들이 홈에 놓이고, 누르면 그 서비스의
//                                 작업공간(대시보드 · 분석결과 · 지도 · 통계 · 보고서)이 펼쳐진다.
//
// 서비스 카드 = 배포본(DEPLOYS) 을 쓰는 쪽 눈으로 본 것이다. 같은 실체, 다른 관점.
//   발행: "이 모델을 카드로 만들어 내보낸다"     (만드는 쪽)
//   진입: "내 서비스 카드를 눌러 일을 시작한다"  (쓰는 쪽)
import { CARDS, DEPLOYS, cardById, modelsOfCard, needsOf, extModules, extByOwner, CORE_MODULES } from './cards.js';
import { PROFILES, profileOf, updateState } from './registry.js';
import { RESULTS, resultById } from './results.js';
import { CHANGE } from './change.js';
import { IMAGERY } from './imagery.js';
import { CROPS } from './crops.js';
import { specOf, BLOCKS } from './studio.js';

/** 로그인 주체 — 같은 사이트, 다른 홈. 기본 구조는 같게 간다(발주자). */
export const TENANTS = [
  { id: 'lx', name: 'LX 한국국토정보공사', kind: 'maker', home: 'dashboard.html',
    desc: '모델을 만들고 결과 품질을 책임진다', menus: 'all' },
  { id: 'namwon', name: '전북특별자치도 남원시', kind: 'user', home: 'portal.html', profile: 'namwon',
    desc: '배포된 서비스로 행정 업무를 한다', menus: ['portal', 'analysis', 'map', 'support'] },
  { id: 'gwangju-jeonnam', name: '광주전남특별시', kind: 'user', home: 'portal.html', profile: 'gwangju-jeonnam',
    desc: '배포된 서비스로 행정 업무를 한다', menus: ['portal', 'analysis', 'map', 'support'] },
];
export const tenantById = (id) => TENANTS.find((t) => t.id === id) || TENANTS[0];

/**
 * 그 기관의 홈에 놓이는 서비스 카드들.
 * 배포본 한 줄 = 서비스 카드 한 장. 카드를 누르면 workspace() 가 여는 것이 펼쳐진다.
 */
export function serviceCards(tenantId) {
  const t = tenantById(tenantId);
  if (t.kind === 'maker') return DEPLOYS.map(toCard);              // LX 는 전부 본다
  const pf = PROFILES.find((p) => p.id === t.profile);
  return DEPLOYS.filter((d) => pf && (d.region.includes(pf.region) || pf.region.includes(d.region))).map(toCard);
}

function toCard(deploy) {
  const card = cardById(deploy.cardId) || {};
  const models = modelsOfCard(card);
  const real = models.filter((m) => m.real && m.count > 0);
  return {
    id: deploy.id, cardId: card.id, name: card.name, region: deploy.region, year: deploy.year,
    status: deploy.status,                                          // 운영 · 구축 · 예정
    duty: card.duty, cycle: card.cycle, summary: card.summary,
    kind: card.kind, needs: needsOf(card),                          // 화면이 무엇을 켤지 (튀는 구조 흡수)
    models: models.length,
    // 단위가 다른 실측을 **더하지 않는다**(필지 + 동 = 아무것도 아니다).
    // 카드에는 제 단위를 단 줄이 그대로 선다.
    measures: real.map((m) => ({ name: m.name, value: m.count, unit: m.unit, lastRun: m.lastRun })),
    lastRun: real.map((m) => m.lastRun).sort().pop() || null,
    version: card.version, update: updateState(deploy),             // 갱신할 게 있나
    gap: card.gap || (deploy.status === '예정' ? '사업 시작 전' : null),
    scale: deploy.scale, note: deploy.note,
  };
}

/**
 * 서비스 카드를 눌렀을 때 펼쳐지는 것 — **서비스 작업공간**.
 * 공통 골격은 같고(대시보드 · 분석결과 · 지도 · 통계 · 보고서),
 * 그 서비스의 선언(kind)에 따라 켜지는 장치가 달라진다.
 */
export function workspace(deployId) {
  const sc = serviceCards('lx').find((c) => c.id === deployId);
  if (!sc) return null;
  const card = cardById(sc.cardId);
  const n = sc.needs;
  const tabs = [
    { id: 'dash', name: '현황', href: `portal.html?svc=${deployId}&tab=dash`,
      what: '이 서비스의 최근 분석 · 처리 대기 · 기간별 추이' },
    { id: 'result', name: '분석 결과', href: `analysis-ai.html?svc=${deployId}`,
      what: n.timeAxis ? '시각별 결과 목록 + 시간 재생' : '분석 실행 목록과 결과' },
    { id: 'map', name: '지도', href: `ximap.html?svc=${deployId}`,
      what: n.grid ? '히트맵 · 격자 집계' : n.lineRef ? '구간 등급 색칠' : '결과 레이어 · 속성 조회' },
    { id: 'stats', name: '통계', href: `stats-standard.html?svc=${deployId}`, what: '행정구역별 집계 · 엑셀' },
    { id: 'report', name: '보고서', href: `report-standard.html?svc=${deployId}`, what: '공문용 보고서 발급 · 내역' },
  ];
  return {
    card: sc, tabs,
    widgets: {                                                      // kind 선언이 켜는 장치
      videoPlayer: n.videoPlayer, timeline: n.timeAxis, heatmap: n.grid,
      gradeLegend: n.lineRef, parcelTable: n.parcelRef,
    },
    modules: { core: CORE_MODULES, ext: extModules(card.ext) },
    link: 'LX 가 모델을 만들고 갱신한다 — 결과 수정·삭제 권한은 LX',
  };
}

/** 홈 머리의 숫자 — 내 지역에 깔린 서비스 현황.
 *
 *  `items` 는 **더하지 않는다**. 2026-09-20 1차 구현이 필지(2,098)와 동(9,664)을 더해
 *  `11,762 필지` 를 만들어 냈다 — 단위가 다른 것을 더하면 값이 아니라 거짓말이 된다.
 *  대신 실측을 가진 서비스가 몇 개인지(`measured`)만 세고, 값은 서비스 카드마다 제 단위로 적는다. */
export function portalSummary(tenantId) {
  const cs = serviceCards(tenantId);
  return {
    total: cs.length, live: cs.filter((c) => c.status === '운영').length,
    building: cs.filter((c) => c.status === '구축').length, planned: cs.filter((c) => c.status === '예정').length,
    measured: cs.filter((c) => measuresOf(c.id).length).length,
    updates: cs.filter((c) => c.update && c.update.level !== 'same').length,
    years: [...new Set(cs.map((c) => c.year))].sort(),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 여기부터 — 작업공간이 **실제로 그릴 것**.
 *
 * 화면(portal-ui.js)은 카드 이름을 모른다. 두 가지만 본다.
 *   1) 카드의 `kind` 선언       → 어떤 장치를 켤 것인가 (needsOf)
 *   2) 카드가 묶은 **모델 id**  → 그 모델이 실제로 만든 자료가 있는가 (evidenceOf)
 * 둘 다 카드 이름이 아니므로 새 서비스가 생겨도 화면 코드를 고치지 않는다(R5).
 * ══════════════════════════════════════════════════════════════════════════ */

/** 지역 토막 — '전북 남원시' 와 '전북특별자치도 남원시 · 국산리' 가 같은 곳임을 안다. */
const regionTokens = (s) => String(s || '').split(/[·,\s]+/).filter(Boolean)
  .map((w) => w.replace(/(특별자치도|특별자치시|특별시|광역시|자치도|[시군구도])$/, '')).filter((w) => w.length >= 2);

/**
 * 이 배포본이 **실제로 가진 실측**. 없으면 빈 배열이다 — 여기서 값을 지어내지 않는다.
 *
 *   runs    분석 실행 산출물(results.js RESULTS). services.js 의 `results` 배열이 정본.
 *   pairs   변화 지수(change.js). 학습 모델의 탐지가 아니므로 화면은 반드시 '변화 지수(비지도)' 로 적는다.
 *   epochs  이 지역 정사영상 시점(imagery.js). 타일이 실제로 구워져 있어 지도 바탕으로 쓴다.
 *   crops   근거 크롭 이미지(crops.js) — 실행 산출물에 달려 있다.
 */
export function evidenceOf(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId);
  if (!d) return { runs: [], pairs: [], epochs: [], crops: [] };
  const card = cardById(d.cardId) || {};
  const ids = new Set(card.services || []);
  const runs = modelsOfCard(card).flatMap((m) => (m.results || []).map(resultById)).filter(Boolean);
  // 변화 지수는 services.js 에 `results` 가 없다(탐지 결과가 아니라 지수라서).
  // 모델 id 로 잇는다 — 카드 이름이 아니다.
  const pairs = ids.has('change') ? CHANGE : [];
  const toks = regionTokens(d.region);
  const epochs = IMAGERY.filter((i) => i.kind === 'ortho' && toks.some((t) => i.label.includes(t)));
  const crops = runs.flatMap((r) => (CROPS[r.id] || []).map((c) => ({ ...c, of: r.title, unit: r.unit })));
  return { runs, pairs, epochs, crops };
}

/** 실측 값 한 줄씩 — **단위가 다른 것을 더하지 않는다**. 모델마다 제 단위로 하나씩 든다. */
export function measuresOf(deployId) {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return [];
  const card = cardById(d.cardId) || {};
  return modelsOfCard(card).filter((m) => m.real && m.count > 0)
    .map((m) => {
      const run = (m.results || []).map(resultById).find(Boolean);
      return { id: m.id, name: m.name, value: m.count, unit: m.unit, lastRun: m.lastRun,
        // 실행 산출물이 있으면 그쪽 수치가 더 정확하다(필지 수 · 면적 · 신뢰도).
        run: run || null, area: run ? run.stats.areaHa : null, conf: run ? run.stats.confMean : null };
    });
}

/** 기관이 하는 일 — `owner:'local'` 전용 모듈. **이 자리가 2층(기관)의 정체성이다.** */
export const localModules = (deployId) => {
  const d = DEPLOYS.find((x) => x.id === deployId); if (!d) return [];
  return extByOwner((cardById(d.cardId) || {}).ext, 'local');
};

/* ── 블록의 자리 성질 ──────────────────────────────────────────────────────
 * "업무 화면은 한 화면에서 끝난다." 그러려면 블록마다 **어떻게 서는가**를 알아야 한다.
 *   band  얇게 한 줄로 — 높이는 내용만큼 (머리 숫자 · 시간 축 · 구간 등급 범례)
 *   grow  남은 높이를 채운다 — 여러 개면 **좌우로 나란히** 선다 (지도 · 표 · 차트 …)
 *
 * 1차 구현은 블록을 전부 세로로 쌓아 지도탭이 301px 넘쳤다. 내용을 지워서 맞추는 대신
 * **구조를 바꿨다** — 대시보드가 아래 두 구역을 좌우로 나란히 놓아 한 줄을 없앤 것과 같은 수다.
 *
 * 자리는 화면의 관심사라 블록 사전(studio.js BLOCKS)에 두지 않는다. 그쪽은 LX 생산 라인이
 * 공유하는 사전이고, 여기 것은 포털 골격의 배치 규칙이다. */
export const BLOCK_SEAT = {
  kpi: 'band', timeline: 'band', grade: 'band',
  map: 'grow', heatmap: 'grow', player: 'grow', parcel: 'grow',
  chart: 'grow', table: 'grow', stats: 'grow', report: 'grow', cards: 'grow',
  ext: 'grow', basis: 'grow',
};
export const seatOf = (blockId) => BLOCK_SEAT[blockId] || 'grow';

/**
 * 포털 블록 둘 — **카드 선언이 아니라 이원화 구조가 요구하는 것**이라 여기서 붙인다.
 * 카드의 kind 는 "무엇을 판독하는가"만 말한다. 그것을 받아 **기관이 무엇을 하는가**(ext)와
 * **그 판독을 누가 책임지는가**(basis)는 2층 화면의 고정 부위다 — 서비스마다 다르지 않다.
 */
export const PORTAL_BLOCKS = {
  ext: { name: '기관 행정 가공', what: '판독 결과를 우리 업무 규칙으로 바꾸는 자리' },
  basis: { name: '이 서비스의 근거', what: '묶인 AI 모델 · 사용 영상 · 갱신 상태' },
};

/**
 * 블록 사전(studio.js BLOCKS)의 말은 **만드는 쪽 말**이다 — '머리 숫자' · '결과 목록'.
 * 기관 화면에는 **쓰는 쪽 말**로 건다. 사전을 고치지 않고 여기서 덮는 이유는,
 * 같은 블록이 LX 생산 관리 화면에서는 생산 용어로 불려야 하기 때문이다.
 */
const PORTAL_TITLES = {
  kpi: { name: '한눈 현황', what: '이 서비스가 지금까지 찾아 준 것' },
  table: { name: '탐지 결과 목록', what: '건별로 보고 현장 확인을 잡는다' },
  parcel: { name: '필지별 판정', what: '필지 단위 결과 · 지적 대장 대조' },
  chart: { name: '분포 · 추이', what: '무엇이 어디에 몰려 있나' },
  stats: { name: '행정구역 집계', what: '행정 단위로 묶어 표로' },
  player: { name: '드론 영상 판독', what: '영상 위에 탐지 상자를 얹어 본다' },
  timeline: { name: '시점', what: '시각을 끌면 그때의 결과' },
  grade: { name: '구간 등급', what: '선을 구간으로 끊어 등급으로' },
  heatmap: { name: '밀도 격자', what: '격자로 묶은 분포' },
  report: { name: '보고서 발급', what: '공문에 붙일 서식으로' },
};

/** 블록 한 종류의 이름과 한 줄 설명 — 사전 + 포털 블록 + 기관 말. */
export function blockInfo(id) {
  return { ...(BLOCKS[id] || { name: id, what: '' }), ...(PORTAL_BLOCKS[id] || {}), ...(PORTAL_TITLES[id] || {}) };
}

/**
 * 실제로 찍히는 포털 명세 = 기본 명세(studio.js) + 2층 고정 블록 + 자리 성질.
 * studio.js 는 건드리지 않는다 — 기본 명세는 그대로 두고 포털 쪽에서 얹는다(R10 과 같은 결).
 */
export function portalSpec(deployId) {
  const spec = specOf(deployId); if (!spec) return null;
  const hasLocal = localModules(deployId).length > 0;
  const tabs = spec.tabs.map((t) => {
    let blocks = [...t.blocks];
    if (t.id === 'dash') blocks = [...blocks, ...(hasLocal ? ['ext'] : []), 'basis'];
    return { ...t, blocks,
      band: blocks.filter((b) => seatOf(b) === 'band'),
      grow: blocks.filter((b) => seatOf(b) === 'grow') };
  });
  return { ...spec, tabs };
}
