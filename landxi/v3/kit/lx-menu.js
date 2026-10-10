/* lx-menu.js — LX 직원 왼쪽 메뉴 한 곳(확인 대장 10차 메뉴-1 ⓐ · 지도-1 ⓐ · 서비스카드-1 ⓐ · 원칙 81 · 99 · 149 · 151 · 163).
   대시보드 · 프로젝트 · 분석하기 · 지도 서비스 · XI맵 | 데이터 · 요청함 — 분석 흐름 순서(원칙 149). '서비스 카드'는 메뉴에 없다(화면 lx-cards 는 그대로 · 분석하기에서 들어간다).
   지도 서비스(lx-map) = 내가 돌린 분석 결과가 분석서비스 묶음별 층으로(질문 1 ⓑ · 원칙 163) — 아이콘은 셸에 있던 지도 그림(map · 새로 그리지 않음).
   XI맵 = 전국 · 해외 실시간 분석(원칙 147) · 글자 'XI' 표기(glyph · 새 아이콘 없음) · 위 머리의 XI맵 단추는 이 메뉴가 있는 화면에서 뺀다(셸).
   sep = 그 칸 위에 구분선. 생산 6단계는 메뉴가 아니라 프로젝트 안(lx-project/context.js).
   휴대폰(≤ 960) 아래 탭 = 대시보드 · 프로젝트 · 분석하기 · 요청함 · 메뉴(펼치면 지도 서비스 · XI맵 · 데이터 · 도움말 · 나가기 — 셸이 그린다).
   요청함 숫자 = 검토 요청(답할 것) + 분석 의뢰(확인 대기 · 내 담당) + 내 결재(대기) — 대시보드 '요청함' 칸과 같은 한 곳(requestCounts).
   const S = shell({ who, home, rail: staffMenu('home') });   // 'home' | 'projects' | 'analyze' | 'mapsvc' | 'ximap' | 'data' | 'inbox' */
import { api } from './util.js';

const at = (p) => new URL(p, import.meta.url).pathname;   // 이 파일 기준 상대 주소(GitHub Pages /Main/ 아래에서도)
export const STAFF_HREF = {
  home: at('../lx-console/'), projects: at('../lx-project/'), analyze: at('../lx-analyze/'), mapsvc: at('../lx-map/'),
  ximap: at('../xi-clean/'), cards: at('../lx-cards/'), data: at('../lx-ingest/'), inbox: at('../lx-inbox/'),
};
export const STAFF_MENU = [
  { id: 'home', label: '대시보드', icon: 'home' },
  { id: 'projects', label: '프로젝트', icon: 'folder' },
  { id: 'analyze', label: '분석하기', icon: 'scan' },
  { id: 'mapsvc', label: '지도 서비스', icon: 'map', more: true },
  { id: 'ximap', label: 'XI맵', glyph: 'XI', more: true },
  { id: 'data', label: '데이터', icon: 'data', more: true, sep: true },
  { id: 'inbox', label: '요청함', icon: 'inbox' },
];
/* 화면(셸 home) → 메뉴 칸. 프로젝트 맥락(?project=)이 있으면 단계 화면도 '프로젝트'(context.js 가 정한다).
   lx-cards(서비스 카드 화면)는 메뉴 칸이 없다 — 들어오는 길인 '분석하기'에 불(서비스카드-1 ⓐ) */
export const STAFF_OF = { 'lx-console': 'home', 'lx-project': 'projects', 'lx-analyze': 'analyze', 'lx-cards': 'analyze', 'lx-map': 'mapsvc', 'lx-ingest': 'data', 'lx-inbox': 'inbox' };

/** 셸 rail 정의 — 같은 메뉴 · 같은 이름 · 같은 주소(어느 LX 직원 화면이든). counts = 칸 숫자(셸이 부르고 그린다 · 요청함만) */
export function staffMenu(current = 'home') {
  const items = STAFF_MENU.map((m) => ({ ...m, href: STAFF_HREF[m.id] }));
  return {
    kind: 'menu', menu: 'staff', items, current: items.findIndex((m) => m.id === current),
    counts: async (force) => { const c = await requestCounts({ force }); return { inbox: c?.total ?? null }; },
  };
}

/* ── 요청함 숫자(한 곳) ─────────────────────────────────────
   GET /reviews/notify — counts.todo(검토 요청 · 답할 것) · extra[kind=request].n(분석 의뢰 확인 대기 · 내 담당)
   GET /approvals?state=pending — pending(내가 올린 결재 중 대기 · 관리자는 모두)
   실패한 칸은 null(지어내지 않는다). 30초 안에 다시 부르면 같은 답(같은 화면의 메뉴 배지 · 대시보드 칸이 같은 값). */
let C = null, T = 0;
export function requestCounts({ force = false } = {}) {
  if (!force && C && Date.now() - T < 30000) return C;
  T = Date.now();
  C = Promise.allSettled([api('/reviews/notify'), api('/approvals?state=pending')]).then(([n, a]) => {
    const nv = n.status === 'fulfilled' ? n.value : null, av = a.status === 'fulfilled' ? a.value : null;
    const review = nv ? +(nv.counts?.todo ?? 0) : null;
    const reqX = nv ? (nv.extra || []).find((x) => x.kind === 'request') : null;
    const request = nv ? +(reqX?.n ?? 0) : null;
    const approval = av ? +(av.pending?.value ?? (av.items || []).filter((x) => x.state === 'pending').length) : null;
    const parts = [review, request, approval];
    return {
      review, request, approval,
      total: parts.every((x) => x === null) ? null : parts.reduce((s, x) => s + (x || 0), 0),
      requests: reqX?.items || [], approvals: (av?.items || []).filter((x) => x.state === 'pending'),
      as_of: nv?.as_of || av?.as_of || new Date().toISOString(),
    };
  });
  C.catch(() => { C = null; });
  return C;
}
