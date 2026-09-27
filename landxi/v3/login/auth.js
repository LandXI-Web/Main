/* v3 정문 — 실제 인증(POST /api/v1/auth/login · 게이트웨이 :8700) → 역할별 착지(같은 출처 · lx_api_session).
   착지는 키트 K2 허용표(kit/auth-gate.js LANDING · 명세 §0) 한 곳에서 읽는다:
     LX 직원   → 생산 콘솔       /landxi/v3/lx-console/
     LX 관리자 → 관제            /landxi/v3/ops-core/   (없으면 현행 :8702 관제로 조각 인계 · handoff.js)
     LX 영업   → 서비스 카탈로그 /landxi/v3/sales/      (서버 role 'sales' 또는 tenant 'lx-demo' — 탭은 늘리지 않는다)
     국내 기관 → 서비스          /landxi/v3/gov-fusion/ (scope=local)
     해외 기관 → 글로벌          /landxi/v3/global/     (scope=global · 아직 없으면 현행 /landxi/global/)
   계정 3택은 문(realm)과 기대 역할만 정한다. 착지는 서버가 돌려준 role · 기관 scope 로 정한다(화면이 권한을 지어내지 않는다).
   기관 목록 = GET /auth/tenants(S-1 · 공개). 서버에 아직 없으면 같은 모양({id, name, scope})으로 공개 디렉터리 파일을 읽는 어댑터로 폴백.
   틀린 비밀번호 = 서버 401 문구 그대로. 관리자 문에 관리자 아닌 계정 = 발급된 토큰을 즉시 폐기하고 거절. */

import { API, session, api } from '../../shared/api-v1.js';
import { keyOf, landingFor, ALLOW, FRONT } from '../kit/auth-gate.js';
import { drawer } from '../kit/panel.js';
import { hasRoute, h } from '../kit/util.js';
import { mountPlate } from './plate.js';
import { handoffFragment } from './handoff.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPS_PORT = 8702;
const $ = (id) => document.getElementById(id);
const gate = $('gate'), hero = $('hero'), form = $('form'), go = $('go'), msg = $('msg'), seg = $('seg');
const idIn = $('id'), pwIn = $('pw'), org = $('org'), orgRow = $('orgRow');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LS = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };

/* ── 히어로 카드 ─────────────────────────────────────────────────── */
function bootPlate() {
  const narrow = () => innerWidth <= 960;
  return mountPlate({
    el: $('map'), sweep: $('sweep'), credit: $('credit'),
    ui: { hero, cover: $('cover'), credit2: $('credit2'), ix: $('ix'), title: $('axisT'), line: $('axisL'), axis: $('axis'), res: $('res'),
      where: $('resWhere'), num: $('resNum'), unit: $('resUnit'), sig: $('resSig'), ask: $('ask'), askT: $('askT') },
    // 글이 얹히는 쪽(데스크톱 = 아래 · 모바일 = 위 3축 + 아래 결과 카드)을 비켜 결과가 보이는 곳에 카메라 중심을 둔다
    pad: () => { const hh = hero.clientHeight; return narrow() ? { top: hh * 0.34, bottom: hh * 0.3, left: 0, right: 0 } : { top: 0, bottom: hh * 0.28, left: 0, right: 0 }; },
  });
}
let plate = null;
if (window.maplibregl) plate = bootPlate(); else addEventListener('load', () => { plate = bootPlate(); });
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));

/* ── 기관 목록 — 공개 기관 디렉터리(로그인 전이라 /tenants 는 못 부른다) ── */
let ORGS = [];          // [{id, name(표시), scope}]
let ORG_SRC = 'server';
/* 표기 통일 — 디렉터리 원문이 '키르기스 · 키르기즈'로 섞여 있다(서버 공개 GET /auth/tenants 로 옮길 때 원문도 정리 요청).
   국가명은 '키르기스스탄' 표준 표기의 '키르기스'로 맞춘다(형식 '기관명(관할)'은 그대로). */
const orgName = (n) => n.replace(/키르기즈/g, '키르기스').replace(/\s+\(/g, '(');
const DIR = new URL('../../ops/data/fixtures/tenants.json', import.meta.url).href;
async function loadOrgs() {
  if (await hasRoute('/auth/tenants')) {
    try { const j = await api('/auth/tenants'); ORG_SRC = 'server'; return j?.items || []; } catch { /* 아래 어댑터 */ }
  }
  // 어댑터(S-1 전) — 같은 모양으로 접는다: active · 기관(user) · lx-demo 제외 → {id, name, scope}
  ORG_SRC = 'adapter';
  const j = await fetch(DIR).then((r) => (r.ok ? r.json() : null));
  return (j?.items || []).filter((t) => t.kind === 'user' && t.status === 'active')
    .map((t) => ({ id: t.id, name: t.name, scope: t.scope }));
}
const orgsReady = loadOrgs().then((items) => {
  ORGS = items.filter((t) => t.id !== 'lx-demo')
    .map((t) => ({ id: t.id, name: orgName(t.name?.ko || t.name?.en || t.id), scope: t.scope === 'global' ? 'global' : 'local' }));
  org.append(...ORGS.map((t) => new Option(t.name, t.id)));
  const last = LS('lx_login_org'); if (last && ORGS.some((t) => t.id === last)) org.value = last;
}).catch(() => { ORGS = []; });

/* 아이디가 '<기관 id>-…' 로 시작하면 기관 칸을 미리 맞춘다(가장 긴 일치). 못 맞추면 사용자가 고른다 — 추측으로 보내지 않는다. */
function orgFromLogin(login) {
  let best = null;
  for (const t of ORGS) if ((login === t.id || login.startsWith(t.id + '-')) && (!best || t.id.length > best.id.length)) best = t;
  return best?.id || null;
}
idIn.addEventListener('input', () => { if (who() !== 'tenant') return; const g = orgFromLogin(idIn.value.trim()); if (g) org.value = g; });
org.addEventListener('change', () => { clearErr(); if (org.value) LS('lx_login_org', org.value); });

/* ── 계정 3택 — 잉크 밑줄만 움직인다(관리자도 같은 색 · §8) ───────── */
const WHO = ['staff', 'admin', 'tenant'];
const who = () => form.who.value;
function pick(v) {
  seg.querySelector('.seg__bar').style.setProperty('--i', String(WHO.indexOf(v)));
  const t = v === 'tenant';
  orgRow.hidden = !t;
  if (t && !org.value) { const g = orgFromLogin(idIn.value.trim()); if (g) org.value = g; }
  clearErr();
}
for (const r of form.who) r.addEventListener('change', (e) => pick(e.target.value));
pick(who());
/* 집이 정문으로 돌려보낸 경우(?next) — 그 집의 문을 미리 골라 둔다 */
{ const n = new URLSearchParams(location.search).get('next') || '';
  const want = /\/ops/.test(n) ? 'admin' : /\/(?:gov-|global\/)/.test(n) ? 'tenant' : null;
  if (want) { const r = [...form.who].find((x) => x.value === want); if (r) { r.checked = true; pick(want); } } }

/* ── 오류 표시 ──────────────────────────────────────────────────── */
function say(text, fields = []) {
  msg.textContent = text; msg.hidden = false;
  msg.classList.remove('t-in'); void msg.offsetWidth; msg.classList.add('t-in');
  for (const f of document.querySelectorAll('.fld')) f.classList.toggle('bad', fields.includes(f.dataset.f));
  if (!REDUCE) { form.classList.remove('nudge'); void form.offsetWidth; form.classList.add('nudge'); }
}
function clearErr() { msg.hidden = true; msg.textContent = ''; for (const f of document.querySelectorAll('.fld.bad')) f.classList.remove('bad'); }
idIn.addEventListener('input', clearErr); pwIn.addEventListener('input', clearErr);

/* ── 목적지 ─────────────────────────────────────────────────────── */
async function exists(url) {
  try { const r = await fetch(new URL(url, location.href), { method: 'HEAD', cache: 'no-store' }); return r.ok; } catch { return false; }
}
/* 집 — 키트 K2 착지표(명세 §0)가 첫 후보. 그 집이 아직 없으면 가까운 v3 집 → 현행 화면 순서(같은 저장소라 HEAD 로 있는지만 본다). */
const FALLBACK = {
  'lx/staff': ['/landxi/xi/index.html'],
  'lx/admin': [],
  'lx/sales': ['/landxi/v3/xi-clean/', '/landxi/xi/index.html'],
  'tenant/demo': ['/landxi/v3/xi-clean/', '/landxi/xi/index.html'],
  'tenant/local': ['/landxi/xi/index.html'],
  'tenant/global': ['/landxi/global/index.html'],
};
/* 서버 role · realm · 기관 scope → 허용표 키(키트 keyOf 그대로 · 화면이 권한을 지어내지 않는다) */
function houseOf(s) {
  const t = s.realm === 'tenant' ? ORGS.find((x) => x.id === s.tenant_id) || null : null;
  return keyOf({ realm: s.realm, role: s.role, tenant_id: s.tenant_id }, t);
}

/* ?next — 같은 출처 v3 집 경로(또는 현행 XI맵)만, 그리고 그 사람이 들어갈 수 있는 집만(오픈 리다이렉트 0 · 권한 밖 착지 0).
   화이트리스트 = 키트 허용표의 집 이름(main · service-detail · help-my · lx-* · gov-* · ops-* · sales · xi-clean · global). */
const NEXT_OK = /^\/landxi\/(?:v3\/([a-z-]+)\/(?:index\.html)?|(xi)\/(?:index\.html)?)(?:\?[^\s#\\]*)?(?:#[^\s\\]*)?$/;
function nextParam(key) {
  const v = new URLSearchParams(location.search).get('next') || '';
  const m = NEXT_OK.exec(v);
  if (!m || /\.\.|\/\/|%2e|%2f|%5c/i.test(v)) return null;
  if (m[2] === 'xi') return key && ALLOW['xi-clean'].includes(key) ? v : null;
  const home = m[1];
  if (!Object.prototype.hasOwnProperty.call(ALLOW, home) || home === 'login') return null;
  const ok = ALLOW[home];
  return ok === null || (key && ok.includes(key)) ? v : null;
}

async function homeOf(s) {
  const key = houseOf(s);
  const n = nextParam(key); if (n) return n;
  for (const u of [landingFor({ key }), ...(FALLBACK[key] || [])]) if (await exists(/\.html$/.test(u) ? u : u + 'index.html')) return u;
  if (key === 'lx/admin') return `${location.protocol}//${location.hostname}:${OPS_PORT}/landxi/ops/index.html#${handoffFragment(s)}`;   // 현행 관제(:8702) — 조각 인계
  return FRONT;
}

/* ── 들어가기 — 문 카드가 비켜서고 히어로 카드가 화면 전체로 ──────── */
async function enter(s) {
  const url = await homeOf(s);
  document.documentElement.dataset.dest = url.replace(/#.*$/, '');
  if (!REDUCE) {
    if (innerWidth > 960) {
      const r = hero.getBoundingClientRect();
      Object.assign(hero.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
      gate.classList.add('leaving');
      void hero.offsetWidth;
      Object.assign(hero.style, { top: '0px', left: '0px', width: innerWidth + 'px', height: innerHeight + 'px', borderRadius: '0px' });
    } else gate.classList.add('leaving');
    plate?.release?.();
    await wait(760);
  }
  location.assign(url);
}

/* 로그인 호출 — 헬스 프로브로 먼저 막지 않는다(느린 한 번의 프로브가 정상 계정을 막았다).
   바로 POST /auth/login 을 부르고, 응답이 아예 없을 때(네트워크 오류)만 한 번 더 시도한다.
   서버가 답한 오류(401 등)는 다시 부르지 않고 그대로 돌려준다. */
async function signIn(body) {
  if (API.mode === 'off' && LS('lx_api_mode') !== 'off') API.mode = 'auto';   // 앞선 느린 프로브의 'off' 판정을 풀어 준다
  let last;
  for (let i = 0; i < 2; i++) {
    try { const s = await api('/auth/login', { method: 'POST', body }); API.mode = 'on'; return s; }
    catch (err) { if (err.status) throw err; last = err; if (i === 0) await wait(700); }
  }
  throw last;
}

let busy = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const login = idIn.value.trim(), password = pwIn.value;
  const w = who();
  if (!login || !password) { say('아이디와 비밀번호를 입력하세요', [!login && 'id', !password && 'pw'].filter(Boolean)); (login ? pwIn : idIn).focus(); return; }

  busy = true; go.setAttribute('aria-busy', 'true'); clearErr();
  try {
    let tenantId = null;
    if (w === 'tenant') {
      await orgsReady;
      tenantId = org.value || orgFromLogin(login);
      if (!tenantId) { say('기관을 선택하세요', ['org']); org.focus(); return; }
    }
    const body = w === 'tenant' ? { realm: 'tenant', tenant_id: tenantId, login, password } : { realm: 'lx', login, password };
    let s;
    try { s = await signIn(body); }
    catch (err) {
      if (!err.status) { say('서버에 연결할 수 없습니다'); return; }         // 두 번 모두 네트워크 오류일 때만
      if (err.status === 401 || err.code === 'unauthorized') {
        // 서버 401 문구 그대로(명세 §2.2). 기관 문은 기관 칸도 함께 짚는다(무엇이 틀렸는지 서버는 말하지 않는다)
        say(err.message || '아이디 또는 비밀번호가 맞지 않습니다', w === 'tenant' ? ['org', 'pw'] : ['pw']);
        pwIn.value = ''; pwIn.focus();
      } else say('잠시 후 다시 시도하세요');
      return;
    }
    if (w === 'admin' && s.role !== 'admin') {
      try { await fetch(API.prefix + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }); } catch { /* */ }
      say('관리자 계정이 아닙니다', ['id']); return;
    }
    if (w === 'tenant') LS('lx_login_org', tenantId);
    session.set({ token: s.token, realm: s.realm, role: s.role, tenant_id: s.tenant_id, expires_at: s.expires_at, user: s.user });
    await orgsReady;
    window.__login.last = { realm: s.realm, role: s.role, tenant_id: s.tenant_id, house: houseOf(s) };
    await enter(s);
  } finally {
    busy = false; go.removeAttribute('aria-busy');
  }
});

/* ── 이미 들어와 있으면 '계속' 한 줄 · ?logout 이면 서버 세션까지 끝낸다 ──
   헬스 프로브로 먼저 막지 않는다(signIn 과 같은 규칙) — 바로 부르고, 응답이 아예 없을 때(네트워크 오류)만 700ms 뒤 한 번 더.
   토큰은 저장된 세션에서 직접 싣는다(앞선 프로브의 'off' 판정에 걸리지 않게). */
async function authed(path, method, token) {
  let last;
  for (let i = 0; i < 2; i++) {
    let r;
    try { r = await fetch(API.prefix + path, { method, cache: 'no-store', headers: { accept: 'application/json', authorization: 'Bearer ' + token } }); }
    catch (err) { last = err; if (i === 0) { await wait(700); continue; } throw err; }
    API.mode = 'on';
    const j = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(j?.error?.message || 'http_' + r.status); e.status = r.status; throw e; }
    return j;
  }
  throw last;
}
(async () => {
  const q = new URLSearchParams(location.search);
  if (q.has('logout')) {
    const s = session.get();
    if (s) { try { await authed('/auth/logout', 'POST', s.token); } catch { /* 이미 끝남 · 두 번 모두 연결 실패 */ } }
    session.clear();
    q.delete('logout'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    return;
  }
  const s = session.get();
  if (!s) return;
  let me;
  try { me = await authed('/me', 'GET', s.token); }
  catch (err) { if (err.status === 401) session.clear(); return; }   // 401 = 끝난 세션 · 연결 실패는 세션을 건드리지 않는다
  try {
    const r = $('resume');
    r.textContent = `${me.user?.name || '내 계정'}으로 계속`;          // 화살표는 키트 .t-btn--text::after 가 붙인다
    r.hidden = false;
    window.__login.resumeAt = Math.round(performance.now());
    r.addEventListener('click', async (ev) => { ev.preventDefault(); await orgsReady; await enter({ ...s, realm: me.realm, role: me.role, tenant_id: me.tenant_id }); });
    const want = me.realm === 'tenant' ? 'tenant' : me.role === 'admin' ? 'admin' : 'staff';
    const radio = [...form.who].find((x) => x.value === want); if (radio) { radio.checked = true; pick(want); }
    if (me.realm === 'tenant' && me.tenant_id) { await orgsReady; if (ORGS.some((t) => t.id === me.tenant_id)) org.value = me.tenant_id; }
  } catch { /* 표시 실패는 세션과 무관 */ }
})();

/* ── 계정 찾기 · 신청 — K5 서랍(제목 · 3행 · Esc 닫기 · 같은 자리 재열기 = 교체) ── */
const helpBody = () => h('dl.help__dl', {},
  h('div', {}, h('dt', { text: 'LX 직원 · 관리자' }), h('dd', { text: '관리자 승인 후 발급' })),
  h('div', {}, h('dt', { text: '기관' }), h('dd', { text: '서비스 계약 시 LX가 발급' })),
  h('div', {}, h('dt', { text: '문의' }), h('dd.n', {}, h('a', { href: 'tel:063-713-1218', text: '063-713-1218' }))));
let helpD = null;
$('helpBtn').addEventListener('click', () => {
  if (helpD) { helpD.close(); return; }
  helpD = drawer({ title: '계정 찾기 · 신청', body: helpBody(), slot: 'help', onClose: () => { helpD = null; $('helpBtn').focus(); } });
  helpD.el.classList.add('help');
  helpD.el.querySelector('.k-dr-x')?.focus();
});

/* ── 테스트 훅 ─────────────────────────────────────────────────── */
window.__login = {
  ready: true, last: null,
  who, homeOf, houseOf, orgFromLogin, nextParam, orgs: () => ORGS.slice(), orgSource: () => ORG_SRC,
  plate: () => (plate ? { region: plate.region, axis: plate.axis, arrived: plate.arrived, error: plate.error, visits: plate.visits } : null),
};
