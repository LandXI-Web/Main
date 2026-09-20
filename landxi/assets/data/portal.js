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
import { CARDS, DEPLOYS, cardById, modelsOfCard, needsOf, extModules, CORE_MODULES } from './cards.js';
import { PROFILES, profileOf, updateState } from './registry.js';

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
    models: models.length, items: real.reduce((a, m) => a + m.count, 0) || null,
    unit: real[0]?.unit || null, lastRun: real.map((m) => m.lastRun).sort().pop() || null,
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

/** 홈 머리의 숫자 — 내 지역에 깔린 서비스 현황. */
export function portalSummary(tenantId) {
  const cs = serviceCards(tenantId);
  return {
    total: cs.length, live: cs.filter((c) => c.status === '운영').length,
    building: cs.filter((c) => c.status === '구축').length, planned: cs.filter((c) => c.status === '예정').length,
    items: cs.reduce((a, c) => a + (c.items || 0), 0),
    updates: cs.filter((c) => c.update && c.update.level !== 'same').length,
    years: [...new Set(cs.map((c) => c.year))].sort(),
  };
}
