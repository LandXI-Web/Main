/* K2 auth-gate.js — 관문. 화면에 글자 0(정문이 말한다).
   세션(api-v1 session) 읽기 → GET /me 확인 → 집 허용표(명세 §0) 대조.
   · 세션 없음/만료 → location.replace('/landxi/v3/login/?next=' + 현재 경로)
   · 역할 밖 집   → 정문 '/landxi/v3/login/?denied=<집>' (next 없음 — 되돌이 고리 방지)
   const who = await gate();            // 현재 경로에서 집 id 를 읽는다
   const who = await gate('gov-fusion'); // 명시
   → { session, me, tenant, home, landing }   (tenant = /tenants 항목 · 기관 세션만)
   landingFor(who, site?) → 그 사람의 첫 집 경로(정문 · 셸 '처음' 이 쓴다) — 들어온 입구(site)가 있으면 입구별 표가 먼저 */
import { api, session, hasRoute, bboxOf } from './util.js';
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
  'ops-core': ['lx/admin'],
  'ops-infra': ['lx/admin'],
  sales: ['lx/sales', 'lx/admin', 'tenant/demo'],
  'xi-clean': ['lx/staff', 'lx/admin', 'lx/sales', 'tenant/demo', 'tenant/local'],
  'gov-fusion': ['tenant/local'],
  'gov-report': ['tenant/local'],
  global: ['tenant/global', 'lx/staff', 'lx/admin', 'lx/sales'],
  'help-my': ['lx/staff', 'lx/admin', 'lx/sales', 'tenant/demo', 'tenant/local', 'tenant/global'],
  'service-detail': null,   // 공용(게스트 포함) — 관문 없음
  main: null,
  login: null,
};
export const LANDING = { 'lx/staff': 'lx-console', 'lx/admin': 'ops-core', 'lx/sales': 'sales', 'tenant/demo': 'sales', 'tenant/local': 'gov-fusion', 'tenant/global': 'global' };
/** 입구별 첫 화면(확인 대장 7 — lxadmin 한 계정으로 세 입구) — 같은 계정이라도 들어온 입구가 첫 화면을 정한다. 표에 없으면 LANDING.
    app 에서 관리자 계정 → LX 직원 대시보드 · admin → LX 관리자 대시보드(LANDING) · gov → 고른 기관의 화면(기관 세션 · LANDING) */
export const LANDING_AT = { app: { 'lx/admin': 'lx-console' } };

export const homeFromPath = (p = location.pathname) => (new RegExp('^' + V3 + '([^/]+)/').exec(p) || [])[1] || null;

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
    location.replace(FRONT + '?next=' + encodeURIComponent(here));
    return new Promise(() => {});
  }
  if (!allowed(home, who.key)) {
    location.replace(FRONT + '?denied=' + encodeURIComponent(home || ''));
    return new Promise(() => {});
  }
  return { ...who, home };
}

/** 나가기 — 서버 세션 삭제 후 정문 */
export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* 만료여도 지운다 */ }
  session.clear(); WHO = null;
  location.replace(FRONT);
}
