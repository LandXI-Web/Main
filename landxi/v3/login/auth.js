/* v3 로그인 — 실제 인증(POST /api/v1/auth/login · 게이트웨이 :8700) → 역할별 첫 화면(같은 출처 · lx_api_session).
   역할 탭 없음(확인 대장 6·7 · 원칙 27). 입구(주소)가 로그인 문(realm)과 화면 모습을 정한다 — 주소 이름은 kit/sites.js 한 곳:
     app   = LX 직원 · 영업(아이디로 구분) → 아이디 · 비밀번호 · 문 lx
     admin = LX 관리자                     → 아이디 · 비밀번호 · 문 lx · 관리자 계정만(서버가 확인 — 아니면 토큰을 내주지 않는다)
     gov   = 기관(국내 · 해외)              → 기관 고르기 + 아이디 · 비밀번호 · 문 tenant
   바깥 주소는 주소 이름으로, 이 PC(localhost)에서는 ?site=app|admin|gov 로(없으면 ?next 화면으로 짐작 → 없으면 app).
   서버가 정본 — 바깥 주소는 공개 관문이 입구를 서버에 알리고(x-lx-site), 이 PC 에서는 본문 site 로 알린다.
   첫 화면은 키트 K2 표(kit/auth-gate.js LANDING · LANDING_AT) 한 곳에서 읽는다:
     LX 직원   → LX 직원 대시보드      /landxi/v3/lx-console/
     LX 관리자 → LX 관리자 대시보드    /landxi/v3/ops-core/   (app 입구에서는 LX 직원 대시보드 — lxadmin 한 계정으로 세 입구)
     LX 영업   → 서비스 카탈로그       /landxi/v3/sales/      (서버 role 'sales' 또는 tenant 'lx-demo')
     국내 기관 → 기관 화면             /landxi/v3/gov-fusion/ (scope=local)
     해외 기관 → 글로벌                /landxi/v3/global/     (scope=global)
   착지는 서버가 돌려준 role · 기관 scope 로 정한다(화면이 권한을 지어내지 않는다).
   기관 목록 = GET /auth/tenants(S-1 · 공개 · 기관 입구에서만 부른다). 서버에 없으면 같은 모양({id, name, scope})으로 공개 디렉터리 파일을 읽는 어댑터로 폴백.
   틀린 비밀번호 = 서버 401 문구 그대로. 관리자 입구에 관리자 아닌 계정 = 서버 403(토큰 없음) · 옛 서버가 토큰을 내주면 즉시 폐기하고 거절. */

import { API, session, api } from '../../shared/api-v1.js';
import { keyOf, landingFor, ALLOW, FRONT, SITES, siteHere } from '../kit/auth-gate.js';
import { drawer } from '../kit/panel.js';
import { h } from '../kit/util.js';
import { mountPlate } from './plate.js';
import { handoffFragment } from './handoff.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPS_PORT = 8702;
const $ = (id) => document.getElementById(id);
const gate = $('gate'), hero = $('hero'), form = $('form'), go = $('go'), msg = $('msg');
const idIn = $('id'), pwIn = $('pw'), org = $('org'), orgRow = $('orgRow');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LS = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };

/* ── 입구 — 주소가 정한다(이 PC 에서는 ?site=) ─────────────────────── */
function siteFromNext() {   // 이 PC 에서 ?site 없이 화면이 로그인으로 돌려보낸 경우(?next) — 그 화면의 입구
  const n = new URLSearchParams(location.search).get('next') || '';
  return /\/ops/.test(n) ? 'admin' : /\/(?:gov-|global\/)/.test(n) ? 'gov' : null;
}
const SITE = siteHere() || siteFromNext() || 'app';
const GOV = SITES[SITE].realm === 'tenant';
document.documentElement.dataset.site = SITE;
{ const lb = SITES[SITE].label, el = $('site');
  if (lb) { el.textContent = lb; el.hidden = false; document.title = 'Land-XI · ' + lb; }
  orgRow.hidden = !GOV; }

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
/* 등장 — 두 프레임 뒤 스태거. 프레임이 300ms 안에 오지 않으면(뒤에서 열린 탭 · 그리기 멈춘 탭) 등장 없이 바로 보인다.
   (c2-xi 실증: 폼이 처음에 비어 보이고 휠 한 번에 나타났다 — 프레임이 오지 않아 is-ready 가 붙지 않았던 것) */
let entered = false;
const enterNow = (instant) => { if (entered) return; entered = true; if (instant) document.body.classList.add('no-enter'); document.body.classList.add('is-ready'); };
requestAnimationFrame(() => requestAnimationFrame(() => enterNow(false)));
setTimeout(() => enterNow(true), 300);
if (document.visibilityState === 'hidden') enterNow(true);

/* ── 기관 목록 — 공개 기관 디렉터리(로그인 전이라 /tenants 는 못 부른다) ── */
let ORGS = [];          // [{id, name(표시), scope}]
let ORG_SRC = 'server';
/* 표기 통일 — 디렉터리 원문이 '키르기스 · 키르기즈'로 섞여 있다(서버 공개 GET /auth/tenants 로 옮길 때 원문도 정리 요청).
   국가명은 '키르기스스탄' 표준 표기의 '키르기스'로 맞춘다(형식 '기관명(관할)'은 그대로). */
const orgName = (n) => n.replace(/키르기즈/g, '키르기스').replace(/\s+\(/g, '(');
const DIR = new URL('../../ops/data/fixtures/tenants.json', import.meta.url).href;
/* 늦음 안내(M8 · r3-ops) — 옛 탭이 서버 연결을 쥐고 있으면 기관 목록 요청이 끝나지 않는다.
   ① 요청마다 제한 시간(8초) · 넘으면 한 번 더 ② 6초가 지나도 목록이 없으면, '기관'을 늦게 눌러도 안내 + '다시 불러오기'
   ③ '다시 불러오기' = 목록을 처음부터 다시 부른다(다른 탭을 닫은 뒤 누르면 이어진다). */
const SLOW_MS = 6000, ORG_TIMEOUT_MS = 8000;
const SLOW_TXT = '서버 응답이 늦습니다 — 다른 Land-XI 탭을 닫거나 새로 고친 뒤 다시 시도하세요';
/* 서버가 멈춰 있을 때(연결 거절 · 관문 502–504) — 서버 다시 시작 중이거나 꺼진 때. 할 일 = 잠시 뒤 다시 불러오기 */
const DOWN_TXT = '서버에 연결할 수 없습니다 — 잠시 뒤 다시 불러오기를 누르세요';
async function getJson(url, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ac.signal, headers: { accept: 'application/json' } });
    if (!r.ok) { const e = new Error('http_' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(t); }
}
async function loadOrgsOnce() {
  try { const j = await getJson(API.prefix + '/auth/tenants', ORG_TIMEOUT_MS); ORG_SRC = 'server'; return j?.items || []; }
  catch (e) { if (!e.status || e.status >= 502) throw e; }   // 응답 없음(시간 초과 · 연결 막힘 · 관문이 서버를 못 찾음) = 다시 시도 · 서버가 답한 오류(경로 없음 등) = 아래 어댑터
  // 어댑터(S-1 전) — 같은 모양으로 접는다: active · 기관(user) · lx-demo 제외 → {id, name, scope}
  ORG_SRC = 'adapter';
  const j = await getJson(DIR, ORG_TIMEOUT_MS).catch(() => null);
  return (j?.items || []).filter((t) => t.kind === 'user' && t.status === 'active')
    .map((t) => ({ id: t.id, name: t.name, scope: t.scope }));
}
let orgsWhy = 'slow';        // 마지막 실패 이유: 'slow'(제한 시간) | 'down'(연결 거절 · 502–504)
const whyOf = (e) => (e?.name === 'AbortError' ? 'slow' : 'down');
async function loadOrgs() {
  try { return await loadOrgsOnce(); }
  catch (e) {                                                   // 제한 시간 뒤 한 번 더 · 연결 거절이면 2초 쉬고 한 번 더(짧은 다시 시작은 여기서 넘긴다)
    orgsWhy = whyOf(e);
    if (orgsWhy === 'down') await wait(2000);
    try { return await loadOrgsOnce(); } catch (e2) { orgsWhy = whyOf(e2); throw e2; }
  }
}
const slowEl = $('slow'), reloadBtn = $('reload');
let orgsDone = false, orgsAt = Date.now(), slowTimer = 0;
const orgsLate = () => !orgsDone && Date.now() - orgsAt >= SLOW_MS;
const slowT = slowEl.querySelector('.slow__t');
function showSlow(on) {
  if (on && slowT) slowT.textContent = orgsWhy === 'down' ? DOWN_TXT : SLOW_TXT;
  slowEl.hidden = !on;
  if (on) { slowEl.classList.remove('t-in'); void slowEl.offsetWidth; slowEl.classList.add('t-in'); }
}
function fillOrgs(items) {
  ORGS = items.filter((t) => t.id !== 'lx-demo')
    .map((t) => ({ id: t.id, name: orgName(t.name?.ko || t.name?.en || t.id), scope: t.scope === 'global' ? 'global' : 'local' }));
  while (org.options.length > 1) org.remove(1);
  org.append(...ORGS.map((t) => new Option(t.name, t.id)));
  const last = LS('lx_login_org'); if (last && ORGS.some((t) => t.id === last)) org.value = last;
}
function startOrgs() {
  orgsDone = false; orgsAt = Date.now(); orgsWhy = 'slow';
  if (org.options[0]) org.options[0].textContent = '기관 목록을 불러오는 중';
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => { if (!orgsDone && GOV) showSlow(true); }, SLOW_MS);
  return loadOrgs().then((items) => {
    orgsDone = true; clearTimeout(slowTimer);
    if (org.options[0]) org.options[0].textContent = '기관 선택';
    fillOrgs(items); showSlow(false);
  }).catch(() => {
    // 두 번 모두 응답 없음 — 목록은 비운 채 안내를 남긴다
    if (org.options[0]) org.options[0].textContent = '기관 목록을 불러오지 못했습니다';
    orgsAt = 0;
    showSlow(true);
  });
}
/* 기관 목록은 기관 입구에서만 부른다(LX 입구에는 기관 칸이 없다) */
let orgsReady = GOV ? startOrgs() : Promise.resolve();
if (!GOV) orgsDone = true;
reloadBtn.addEventListener('click', () => {
  reloadBtn.disabled = true; reloadBtn.setAttribute('aria-busy', 'true');
  orgsReady = startOrgs().finally(() => { reloadBtn.disabled = false; reloadBtn.removeAttribute('aria-busy'); });
});

/* 아이디가 '<기관 id>-…' 로 시작하면 기관 칸을 미리 맞춘다(가장 긴 일치). 못 맞추면 사용자가 고른다 — 추측으로 보내지 않는다. */
function orgFromLogin(login) {
  let best = null;
  for (const t of ORGS) if ((login === t.id || login.startsWith(t.id + '-')) && (!best || t.id.length > best.id.length)) best = t;
  return best?.id || null;
}
idIn.addEventListener('input', () => { if (!GOV) return; const g = orgFromLogin(idIn.value.trim()); if (g) org.value = g; });
org.addEventListener('change', () => { clearErr(); if (org.value) LS('lx_login_org', org.value); });
/* 옛 호출 호환(테스트 훅 who) — 입구를 옛 문 이름으로 */
const who = () => (GOV ? 'tenant' : SITE === 'admin' ? 'admin' : 'staff');

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
/* 첫 화면 — 키트 K2 표(입구별 표 → 역할 표)가 첫 후보. 아직 없으면 가까운 v3 화면 → 현행 화면 순서(같은 저장소라 HEAD 로 있는지만 본다). */
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
  /* 경로 부분만 검사 — 화면 상태(?model=…)의 값에 인코딩된 '/'(%2F)가 들어 있어도 되돌아갈 수 있게(경로 탈출은 여전히 0) */
  const path = v.split(/[?#]/)[0];
  if (!m || /\.\.|\/\/|%2e|%2f|%5c/i.test(path)) return null;
  if (m[2] === 'xi') return key && ALLOW['xi-clean'].includes(key) ? v : null;
  const home = m[1];
  if (!Object.prototype.hasOwnProperty.call(ALLOW, home) || home === 'login') return null;
  const ok = ALLOW[home];
  return ok === null || (key && ok.includes(key)) ? v : null;
}

async function homeOf(s) {
  const key = houseOf(s);
  const n = nextParam(key); if (n) return n;
  /* 입구별 첫 화면(확인 대장 7 — lxadmin 하나로 세 입구: app → LX 직원 · admin → LX 관리자 · gov → 고른 기관) */
  const land = landingFor({ key }, SITE);
  for (const u of [land, ...(FALLBACK[key] || [])]) if (await exists(/\.html$/.test(u) ? u : u + 'index.html')) return u;
  if (key === 'lx/admin' && SITE !== 'app') return `${location.protocol}//${location.hostname}:${OPS_PORT}/landxi/ops/index.html#${handoffFragment(s)}`;   // 현행 관리자 화면(:8702) — 조각 인계
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
  if (!login || !password) { say('아이디와 비밀번호를 입력하세요', [!login && 'id', !password && 'pw'].filter(Boolean)); (login ? pwIn : idIn).focus(); return; }

  busy = true; go.setAttribute('aria-busy', 'true'); clearErr();
  try {
    let tenantId = null;
    if (GOV) {
      if (!orgsDone && orgsLate()) { showSlow(true); return; }
      await orgsReady;
      if (!orgsDone) { showSlow(true); return; }
      tenantId = org.value || orgFromLogin(login);
      if (!tenantId) { say('기관을 선택하세요', ['org']); org.focus(); return; }
    }
    /* 입구를 함께 보낸다 — 서버가 입구별 문(realm)과 관리자 여부를 확인한다(바깥 주소는 관문이 알린 입구가 이긴다) */
    const body = GOV ? { site: SITE, realm: 'tenant', tenant_id: tenantId, login, password } : { site: SITE, realm: 'lx', login, password };
    let s;
    const slow = setTimeout(() => say(SLOW_TXT), SLOW_MS);
    try { s = await signIn(body); clearTimeout(slow); if (msg.textContent === SLOW_TXT) clearErr(); }
    catch (err) {
      clearTimeout(slow);
      if (!err.status) { say('서버에 연결할 수 없습니다'); return; }         // 두 번 모두 네트워크 오류일 때만
      if (err.status === 401 || err.code === 'unauthorized') {
        // 서버 401 문구 그대로(명세 §2.2). 기관 입구는 기관 칸도 함께 짚는다(무엇이 틀렸는지 서버는 말하지 않는다)
        say(err.message || '아이디 또는 비밀번호가 맞지 않습니다', GOV ? ['org', 'pw'] : ['pw']);
        pwIn.value = ''; pwIn.focus();
      } else if (err.status === 403) {
        say(err.message || '관리자 계정이 아닙니다', ['id']);           // 관리자 입구에 관리자 아닌 계정 — 서버가 토큰을 내주지 않았다
        pwIn.value = '';
      } else say('잠시 후 다시 시도하세요');
      return;
    }
    if (SITE === 'admin' && s.role !== 'admin') {
      try { await fetch(API.prefix + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }); } catch { /* */ }
      say('관리자 계정이 아닙니다', ['id']); return;
    }
    if (GOV) LS('lx_login_org', tenantId);
    session.set({ token: s.token, realm: s.realm, role: s.role, tenant_id: s.tenant_id, expires_at: s.expires_at, user: s.user, site: SITE });
    await orgsReady;
    window.__login.last = { realm: s.realm, role: s.role, tenant_id: s.tenant_id, house: houseOf(s), site: SITE };
    await enter(s);
  } finally {
    busy = false; go.removeAttribute('aria-busy');
  }
});
/* 화면 코드가 올라오기 전에 누른 로그인(index.html onsubmit 이 막아 둠) — 이제 이어서 보낸다 */
if (window.__lxSubmit) { window.__lxSubmit = 0; setTimeout(() => form.requestSubmit(), 0); }   // 모듈 끝까지 읽힌 뒤


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
  /* 이 입구에 맞는 세션일 때만 '계속' — app = LX 계정 · admin = LX 관리자 · gov = 기관 계정(이 PC 에서 입구를 바꿔 열 때 다른 입구의 세션으로 넘어가지 않게) */
  if (me.realm !== SITES[SITE].realm || (SITE === 'admin' && me.role !== 'admin')) return;
  try {
    const r = $('resume');
    const nm = me.user?.name || '내 계정';
    const last = nm.charCodeAt(nm.length - 1);                            // 받침 없는 말·ㄹ 받침 = '로'('LX 관리자로') · 그 밖 = '으로'
    const jong = last >= 0xac00 && last <= 0xd7a3 ? (last - 0xac00) % 28 : 0;
    r.textContent = `${nm}${jong === 0 || jong === 8 ? '로' : '으로'} 계속`;   // 화살표는 키트 .t-btn--text::after 가 붙인다
    r.hidden = false;
    window.__login.resumeAt = Math.round(performance.now());
    r.addEventListener('click', async (ev) => { ev.preventDefault(); await orgsReady; await enter({ ...s, realm: me.realm, role: me.role, tenant_id: me.tenant_id }); });
    if (GOV && me.tenant_id) { await orgsReady; if (ORGS.some((t) => t.id === me.tenant_id)) org.value = me.tenant_id; }
  } catch { /* 표시 실패는 세션과 무관 */ }
})();

/* ── 계정 찾기 · 신청 — K5 서랍(제목 · 행 · Esc 닫기 · 같은 자리 재열기 = 교체) · 이 입구의 계정 한 줄 + 문의 ── */
const helpBody = () => h('dl.help__dl', {},
  GOV ? h('div', {}, h('dt', { text: '기관' }), h('dd', { text: '서비스 계약 시 LX가 발급' }))
    : h('div', {}, h('dt', { text: 'LX 직원 · 관리자' }), h('dd', { text: '관리자 승인 후 발급' })),
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
  site: () => SITE, who, homeOf, houseOf, orgFromLogin, nextParam, orgs: () => ORGS.slice(), orgSource: () => ORG_SRC,
  plate: () => (plate ? { region: plate.region, axis: plate.axis, arrived: plate.arrived, error: plate.error, visits: plate.visits } : null),
};
