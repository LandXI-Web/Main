/* admin-menu.js — LX 관리자 왼쪽 메뉴 한 곳(11-07 확인 · PM '1. 맞춘다.' — 직원 메뉴 kit/lx-menu.js 와 같은 방식).
   현황 · 인프라 · 기관 · 배포 · 요청 관리 · 검토 요청 · 계정 관리 · 공유 데이터 · 게시판 — 어느 관리자 화면이든 같은 칸 · 같은 이름 · 같은 주소 · 같은 숫자.
   숫자(빨간 동그라미 · 직원 메뉴와 같은 모양 — 셸이 그린다) = adminCounts() 한 곳:
     요청 관리 = 분석 요청 + 승인 요청 + API 키 신청 대기(요청 관리 화면 세 탭과 같은 출처)
     배포     = 배포 신청 검토 중(배포 신청 탭과 같은 출처)
     검토 요청 = 답할 것(모든 기관)
     계정 관리 = 가입 신청 + 비밀번호 재설정 + 저장 용량 요청 대기
   서버 GET /ops/menu-counts 한 번 — 아직 없는 게이트웨이(404)면 예전 목록 API 여럿을 모아 같은 규칙으로 센다. 0 이면 그리지 않는다 · 못 센 칸은 null(지어내지 않음).
   const S = shell({ who, home, title: 'LX 관리자 대시보드', rail: adminMenu('accounts') }); */
import { api } from './util.js';

const at = (p) => new URL(p, import.meta.url).pathname;   // 이 파일 기준 상대 주소(GitHub Pages /Main/ 아래에서도)
const OPS = at('../ops-core/'), INFRA = at('../ops-infra/');
export const ADMIN_MENU = [
  { id: 'overview', label: '현황', icon: 'map', href: OPS + '#/overview' },
  { id: 'infra', label: '인프라', icon: 'gear', href: INFRA + '#/infra' },
  { id: 'tenants', label: '기관', icon: 'org', href: INFRA + '#/tenants' },
  { id: 'deploys', label: '배포', icon: 'deploy', href: INFRA + '#/deploys' },          // 들어가면 '배포된 카드'(lx-cards)가 먼저(10-25)
  { id: 'approvals', label: '요청 관리', icon: 'inbox', href: OPS + '#/approvals' },     // 분석 요청 · 승인 요청 · API 키 신청 세 탭
  { id: 'reviews', label: '검토 요청', icon: 'list', href: at('../lx-inbox/') },         // 기관에서 온 모든 요청 · 대화(알림-1)
  { id: 'accounts', label: '계정 관리', icon: 'check', href: at('../ops-accounts/') },   // 가입 신청 · 재설정 · 계정
  { id: 'shared', label: '공유 데이터', icon: 'data', href: INFRA + '#/shared' },        // 영상 목록 · 올리기 · 정보 고치기(10-13 · 원칙 238)
  { id: 'board', label: '게시판', icon: 'board', href: at('../lx-board/') },             // 11-07 PM 관리자 게시판 = 왼쪽 메뉴
];

/** 셸 rail 정의 — current = 칸 id. counts = 칸 숫자(셸이 처음 · 1분마다 · 창에 돌아올 때 · 'lx:reviews' 알림 때 부른다) */
export function adminMenu(current = 'overview', { onPick } = {}) {
  const items = ADMIN_MENU.map((m) => ({ ...m }));
  return {
    kind: 'menu', menu: 'admin', items, current: items.findIndex((m) => m.id === current), onPick,
    counts: async (force) => {
      const c = await adminCounts({ force });
      return { approvals: c.approvals, deploys: c.deploys, reviews: c.reviews, accounts: c.accounts };
    },
  };
}
/** 메뉴 칸 순번(셸 S.go(i) 용) */
export const adminIndex = (id) => ADMIN_MENU.findIndex((m) => m.id === id);

/* ── 숫자(한 곳) ───────────────────────────────────────
   30초 안에 다시 부르면 같은 답(같은 화면의 메뉴 숫자 · 탭 숫자가 같은 값). 처리한 화면은 refreshAdminCounts() 로 바로 다시. */
let C = null, T = 0, NEW = true;
const v = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e ?? null);
const sum = (xs) => (xs.every((x) => x === null) ? null : xs.reduce((s, x) => s + (x || 0), 0));

export function adminCounts({ force = false } = {}) {
  if (!force && C && Date.now() - T < 30000) return C;
  T = Date.now();
  C = (NEW ? api('/ops/menu-counts').then(fromServer).catch((e) => { if (e?.status === 404) { NEW = false; return legacy(); } throw e; }) : legacy());
  C.catch(() => { C = null; });
  return C;
}
/** 처리(승인 · 거절 · 답)한 뒤 — 숫자를 새로 받고 메뉴도 다시 그리게 알린다(셸은 'lx:reviews' 를 듣는다) */
export function refreshAdminCounts() {
  C = null;
  document.dispatchEvent(new Event('lx:reviews'));
}

function fromServer(j) {
  const ap = j.approvals_parts || {}, ac = j.accounts_parts || {};
  return {
    approvals: v(j.approvals), analyze: v(ap.analyze), approve: v(ap.approve), apikeys: v(ap.apikeys),
    deploys: v(j.deploys), reviews: v(j.reviews),
    accounts: v(j.accounts), signup: v(ac.signup), reset: v(ac.reset), storage: v(ac.storage), inquiries: v(ac.inquiries),
    as_of: j.as_of,
  };
}

/* 예전 게이트웨이(새 API 없음) — 화면들이 쓰는 목록 API 를 모아 같은 규칙으로 센다 */
const APPROVE_KINDS = new Set(['deploy', 'deploy_ga', 'rule', 'quota', 'model', 'card']);
async function legacy() {
  const get = (p) => api(p).catch(() => null);
  const [rq, apv, dep, ak, rel, nt, acc, inq] = await Promise.all(['/requests/manage', '/approvals?state=pending', '/deploys?geom=bbox', '/api-applications',
    '/release/requests', '/reviews/notify', '/accounts/summary', '/inquiries'].map(get));
  const analyze = rq ? (rq.items || []).filter((x) => x.can_decide).length : null;
  let approve = null;
  if (apv) {
    const deps = new Map((dep?.items || []).map((d) => [d.id, d]));
    approve = (apv.items || []).filter((r) => (r.state || 'pending') === 'pending' && APPROVE_KINDS.has(r.kind)).filter((r) => {
      const d = (r.kind === 'deploy' || r.kind === 'deploy_ga') ? deps.get(r.subject?.id) : null;
      return !(d && (d.tenant_id === 'lx-demo' || /-test(-\d+)?$/.test(d.id)));
    }).length;
  }
  const apikeys = ak ? v(ak.pending) ?? (ak.items || []).filter((x) => x.state === 'pending' && !x.test).length : null;
  const signup = acc ? +(acc.counts?.signup || 0) : null, reset = acc ? +(acc.counts?.reset || 0) : null, storage = acc ? +(acc.counts?.storage || 0) : null;
  return {
    approvals: sum([analyze, approve, apikeys]), analyze, approve, apikeys,
    deploys: rel ? +(v(rel.pending) || 0) : null,
    reviews: nt ? +(nt.counts?.todo ?? 0) : null,
    accounts: acc ? signup + reset + storage + (inq ? +(inq.counts?.new || 0) : 0) : null, signup, reset, storage, inquiries: inq ? +(inq.counts?.new || 0) : null,
    as_of: new Date().toISOString(),
  };
}
