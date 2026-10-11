/* K2 auth-gate.js — 관문. 화면에 글자 0(정문이 말한다).
   세션(api-v1 session) 읽기 → GET /me 확인 → 집 허용표(명세 §0) 대조.
   · 세션 없음/만료 → location.replace('/landxi/v3/login/?next=' + 현재 경로)
   · 역할 밖 집   → 정문 '/landxi/v3/login/?denied=<집>' (next 없음 — 되돌이 고리 방지)
   const who = await gate();            // 현재 경로에서 집 id 를 읽는다
   const who = await gate('gov-fusion'); // 명시
   → { session, me, tenant, home, landing }   (tenant = /tenants 항목 · 기관 세션만)
   landingFor(who, site?) → 그 사람의 첫 집 경로(정문 · 셸 '처음' 이 쓴다) — 들어온 입구(site)가 있으면 입구별 표가 먼저 */
import { api, session, hasRoute, bboxOf, h } from './util.js';
import './sites.js';   // 입구 셋 — 주소 이름 한 곳(globalThis.LX_SITES)

export const FRONT = '/landxi/v3/login/';
const V3 = '/landxi/v3/';

/** 입구 셋(확인 대장 6·7) — app · admin · gov → { host, realm, label } */
export const SITES = globalThis.LX_SITES;
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
/** 지금 입구 — 바깥 주소는 주소 이름으로, 이 PC(localhost)에서는 ?site= 로. 모르면 null */
export function siteHere(loc = location) {
  const host = String(loc.hostname || '').toLowerCase();
  for (const [k, v] of Object.entries(SITES)) if (v.host === host) return k;
  if (orgOfHost(host)) return 'gov';                                  // 기관 주소({기관}.land-xi.dev · 자체 도메인) = 기관 입구
  if (DEV_HOST.test(host)) { const q = new URLSearchParams(loc.search).get('site'); if (q && Object.prototype.hasOwnProperty.call(SITES, q)) return q; }
  return null;
}

/** 집 → 들어올 수 있는 사람. key = 'lx/staff' 'lx/admin' 'lx/sales' 'tenant/local' 'tenant/global' 'tenant/demo' */
export const ALLOW = {
  'lx-console': ['lx/staff', 'lx/admin'],
  'lx-ingest': ['lx/staff', 'lx/admin'],
  'lx-train': ['lx/staff', 'lx/admin'],
  'lx-review': ['lx/staff', 'lx/admin'],
  'lx-deploy': ['lx/staff', 'lx/admin'],
  'lx-release': ['lx/staff', 'lx/admin'],   // 프로젝트 안 추론 · 배포 신청(10-09 배포-1 · 2)
  'lx-project': ['lx/staff', 'lx/admin'],   // 프로젝트 목록 · 한 장(구현 2차 T1)
  'lx-inbox': ['lx/staff', 'lx/admin'],     // 기관에서 온 요청(구현 2차 검토 요청)
  'lx-analyze': ['lx/staff', 'lx/admin'],   // 분석하기 — 로그인이 끝난 뒤 다시 로그인하면 이 화면으로(?next · QA-세션 10-11)
  'lx-map': ['lx/staff', 'lx/admin'],       // 지도 서비스 — 내가 돌린 분석 결과 층(원칙 149 · 154 · 163)
  'ops-core': ['lx/admin'],
  'ops-infra': ['lx/admin'],
  'ops-accounts': ['lx/admin'],             // 계정 관리(구현 2차 T5 — 가입 신청 · 재설정 · 계정 · 로그인 실패 · 처리 기록)
  sales: ['lx/sales', 'lx/admin', 'tenant/demo'],
  'xi-clean': ['lx/staff', 'lx/admin', 'lx/sales', 'tenant/demo', 'tenant/local'],
  'gov-fusion': ['tenant/local'],
  'gov-report': ['tenant/local'],
  'gov-select': ['tenant/local'],   // 서비스 선택 · 서비스 대시보드 · 기관 정보(구현 2차 T3)
  'gov-request': ['tenant/local', 'tenant/global'],    // 분석 의뢰(구현 2차 — 우리 영상 · LX 공유 영상 → LX 관리자 승인)
  'gov-accounts': ['tenant/local', 'tenant/global'],   // 기관 관리자 계정(가입 신청 승인 · 재설정 · 계정) — 기관 관리자 여부는 화면 · 서버가 본다
  'gov-space': ['tenant/local', 'tenant/global'],      // 우리 공간(구현 3차 · 13차 분기-2 — 결과 설명서 · 내려받기 · 공간 안 알림)
  'gov-home': null,                 // 기관 메인(로그인 전 · 그 기관 모습의 로그인) — 관문 없음
  global: ['tenant/global', 'lx/staff', 'lx/admin', 'lx/sales'],
  'help-my': ['lx/staff', 'lx/admin', 'lx/sales', 'tenant/demo', 'tenant/local', 'tenant/global'],
  'service-detail': null,   // 공용(게스트 포함) — 관문 없음
  main: null,
  login: null,
};
/* 국내 기관 → 서비스 선택(구현 2차 T3 · 체계-2 ⓑ · GF-1 — 기관 메인 → 로그인 → 서비스 선택 → 서비스 대시보드 → 서비스별 기능).
   서비스가 하나뿐인 기관은 서비스 선택이 그 서비스 대시보드로 바로 넘긴다(모든 기관이 같은 틀 — 사용자 구현 확인 I-4). */
export const LANDING = { 'lx/staff': 'lx-console', 'lx/admin': 'ops-core', 'lx/sales': 'sales', 'tenant/demo': 'sales', 'tenant/local': 'gov-select', 'tenant/global': 'global' };
/** 입구별 첫 화면 — 같은 계정이라도 들어온 입구가 첫 화면을 정할 때만 적는다. 표에 없으면 LANDING.
    10-09 고장 고침(fix9): LX 관리자 계정은 어느 입구로 들어와도 LX 관리자 대시보드(LANDING). 확인 대장 7(09-30 '메인 → LX 직원 화면')은
    LX 직원 전용 계정(test@lx.or.kr · 10-01 PW-4)이 생기기 전 임시 규칙 — 관리자가 직원 화면을 볼 때는 메뉴로 간다(lx-console 허용표에 관리자 있음). */
export const LANDING_AT = {};

export const homeFromPath = (p = location.pathname) => (new RegExp('^' + V3 + '([^/]+)/').exec(p) || [])[1] || null;

/* ── 기관 주소(구현 2차 T3 · 사용자 구현 확인 I-1 "Land-XI 로그인은 LX 직원만 이용하는 창구" · 7차 결정 기관-주소 ⓒ) ──
   기관 사용자는 Land-XI 로그인으로 들어오지 않는다 — 자기 기관 주소({기관}.land-xi.dev)의 로그인으로 들어오고, 끝난 세션 · 나가기도 거기로 돌아간다.
   주소 규칙은 sites.js 한 곳(gov.orgHost · gov.orgDomains). 이 PC 에서는 같은 화면을 /landxi/v3/gov-home/?org= 로 연다. id 가 없으면 기관 고르기 목록. */
const ORG_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const ORG_HOST = new RegExp('^' + String(SITES.gov.orgHost || '').replace(/[.]/g, '\.').replace('{org}', '([a-z0-9][a-z0-9-]{1,40})') + '$', 'i');
/** 주소 이름 → 기관 id(자체 도메인 → 기관 주소 규칙) · 입구 셋 · 예약 이름은 null */
export function orgOfHost(host = typeof location === 'undefined' ? '' : location.hostname) {
  const hn = String(host || '').toLowerCase().replace(/\.$/, '');
  for (const [id, d] of Object.entries(SITES.gov.orgDomains || {})) if (String(d).toLowerCase() === hn) return id;
  const m = ORG_HOST.exec(hn);
  return m && !(SITES.gov.reserved || []).includes(m[1]) ? m[1] : null;
}
const PUBLIC_HOST = /\.land-xi\.dev$/i;
const onPublic = () => PUBLIC_HOST.test(location.hostname) || !!orgOfHost();
/** 그 기관 메인 주소 — 바깥 주소에서는 기관 주소(https://{기관}.land-xi.dev/ · 자체 도메인), 이 PC 에서는 같은 화면(?org=) */
export function orgUrl(id) {
  if (!ORG_ID.test(id || '')) return orgHome(null);
  if (orgOfHost() === id) return '/';
  if (onPublic()) return 'https://' + (SITES.gov.orgDomains?.[id] || SITES.gov.orgHost.replace('{org}', id)) + '/';
  return V3 + 'gov-home/?' + new URLSearchParams({ org: id, ...(DEV_HOST.test(location.hostname) ? { site: 'gov' } : {}) });
}
export function orgHome(id, { next } = {}) {
  let url;
  if (ORG_ID.test(id || '')) url = orgUrl(id);
  else url = onPublic() ? 'https://' + SITES.gov.host + '/' : V3 + 'gov-home/' + (DEV_HOST.test(location.hostname) ? '?site=gov' : '');
  if (next && url.startsWith('/')) url += (url.includes('?') ? '&' : '?') + new URLSearchParams({ next });   // 되돌아갈 화면은 같은 주소일 때만
  return url;
}
/** 마지막으로 들어온 기관 — 끝난 세션(만료)도 기관 id 는 남아 있다 · 없으면 로그인 때 고른 기관 */
function lastOrg() {
  try { const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null'); if (s?.realm === 'tenant' && s.tenant_id) return s.tenant_id; } catch { /* */ }
  try { return localStorage.getItem('lx_login_org') || null; } catch { return null; }
}
const govPage = (home) => /^gov-/.test(home || '') || siteHere() === 'gov';

/** 세션·/me·기관 → 허용표 키 */
export function keyOf(me, tenant) {
  if (!me) return null;
  if (me.realm === 'lx') return 'lx/' + (me.role === 'admin' ? 'admin' : me.role === 'sales' ? 'sales' : 'staff');
  if (me.tenant_id === 'lx-demo') return 'tenant/demo';
  return tenant?.scope === 'global' ? 'tenant/global' : 'tenant/local';
}
export const landingFor = (who, site = who?.site) => V3 + ((site && LANDING_AT[site]?.[who?.key]) || LANDING[who?.key] || 'main') + '/';
export const allowed = (home, key) => ALLOW[home] === null || ALLOW[home] === undefined ? true : !!key && ALLOW[home].includes(key);

/** 기관 정보 — 공개 디렉터리(S-1 GET /auth/tenants)가 있으면 그것, 없으면 그 기관의 배포 기록에서 국내/해외를 읽는다(접두어 추론 0). */
async function tenantOf(id) {
  if (await hasRoute('/auth/tenants')) {
    try { const j = await api('/auth/tenants'); const t = (j.items || []).find((x) => x.id === id); if (t) return t; } catch { /* 아래로 */ }
  }
  try {
    const j = await api('/deploys');
    const mine = (j.items || []).filter((d) => d.tenant_id === id);
    const boxes = mine.map((d) => bboxOf(d.aoi)).filter(Boolean);
    const kr = (b) => b[0] >= 124 && b[2] <= 132.5 && b[1] >= 32.5 && b[3] <= 39.5;
    const scope = boxes.length && !boxes.some(kr) ? 'global' : 'local';
    const nm = mine[0]?.region_name || {};
    return { id, scope, name: { ko: nm.ko || '', en: nm.en || '' }, approx: true };
  } catch { return { id, scope: 'local', name: { ko: '', en: '' }, approx: true }; }
}

let WHO = null;
/** 확인만(이동 없음) — 세션이 없거나 서버가 거절하면 null */
export async function whoami() {
  if (WHO) return WHO;
  const s = session.get();
  if (!s) return null;
  let me;
  try { me = await api('/me'); } catch (e) { if (e.status === 401 || e.status === 403) session.clear(); return null; }
  let tenant = null;
  if (me.realm === 'tenant') tenant = await tenantOf(me.tenant_id);
  const key = keyOf(me, tenant);
  WHO = { session: s, me, tenant, key, name: me.user?.name || '', org: tenant?.name?.ko || tenant?.name?.en || '', site: siteHere() || s.site || null };
  WHO.landing = landingFor(WHO);
  return WHO;
}

export async function gate(home = homeFromPath()) {
  /* GitHub Pages(보기 전용 사본)에서 로그인이 필요한 화면을 열면 운영 주소의 같은 화면으로 */
  if (/\.github\.io$/i.test(location.hostname)) {
    location.replace('https://' + SITES.app.host + location.pathname.replace(/^\/[^/]+(?=\/landxi\/)/, '') + location.search);
    return new Promise(() => {});
  }
  const who = await whoami();
  const here = location.pathname + location.search;
  if (!who) {
    if (govPage(home)) location.replace(orgHome(lastOrg(), { next: here }));   // 기관 화면 — 그 기관 메인의 로그인으로(Land-XI 로그인 아님)
    else location.replace(FRONT + '?next=' + encodeURIComponent(here));
    return new Promise(() => {});
  }
  if (!allowed(home, who.key)) {
    location.replace(FRONT + '?denied=' + encodeURIComponent(home || ''));
    return new Promise(() => {});
  }
  expiryWatch(home);
  /* 기관 세션 화면의 머리 = 기관 마크 · 이름(구현 2차 T3 · 모든 기관 화면이 같은 틀) — 서비스 선택은 스스로 그린다 */
  if (who.key === 'tenant/local' && home !== 'gov-select') import('../gov-select/brand.js').then((m) => m.brandMast(who.me.tenant_id)).catch(() => {});
  return { ...who, home };
}

/* 쓰던 중 세션이 끝나면(서버 401) 가운데 창 하나 — 다시 로그인하면 보던 화면으로 돌아온다(?next). 조용히 '로그인이 필요합니다' 글줄만 남지 않게(QA-세션 · 10-11 종단 시험) */
let expiryOn = false;
function expiryWatch(home) {
  if (expiryOn) return;
  expiryOn = true;
  let open = false;
  addEventListener('lx:session-expired', async () => {
    if (open) return;
    open = true;
    const here = location.pathname + location.search;
    const go = () => { session.clear(); WHO = null; location.replace(govPage(home) ? orgHome(lastOrg(), { next: here }) : FRONT + '?next=' + encodeURIComponent(here)); };
    try {
      const { modal } = await import('./modal.js');
      modal({ title: '로그인이 끝났습니다', size: 'md', onClose: () => { open = false; },
        body: h('div', {}, h('p', { text: '오래 쓰지 않아 로그인이 끝났습니다. 다시 로그인하면 보던 화면으로 돌아옵니다.' }),
          h('p', { style: 'margin-top:20px' }, h('button.t-btn', { type: 'button', text: '다시 로그인', onclick: go }))) });
    } catch { go(); }
  });
}

/** 나가기 — 서버 세션 삭제 후 정문 */
export async function logout() {
  const s = session.get();
  const org = s?.realm === 'tenant' ? s.tenant_id : null;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* 만료여도 지운다 */ }
  session.clear(); WHO = null;
  location.replace(org ? orgHome(org) : FRONT);   // 기관 세션 = 그 기관 메인으로
}
