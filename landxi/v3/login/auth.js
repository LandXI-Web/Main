/* v3 정문 — 실제 인증(POST /api/v1/auth/login · 게이트웨이 :8700) → 역할별 착지(같은 출처 · lx_api_session).
     LX 직원(영업 포함) → 생산 콘솔 /landxi/v3/lx-console/
     LX 관리자          → 관제     /landxi/v3/ops-core/   (없으면 현행 :8702 관제로 조각 인계 · handoff.js)
     기관               → 서비스   /landxi/v3/gov-fusion/
   계정 3택은 문(realm)과 기대 역할만 정한다. 착지는 서버가 돌려준 role 로 정한다(화면이 권한을 지어내지 않는다).
   틀린 비밀번호 = 서버 401 문구 그대로. 관리자 문에 관리자 아닌 계정 = 발급된 토큰을 즉시 폐기하고 거절.
   아직 v3 집이 없으면 같은 역할의 현행 화면으로 간다(xi · 관제) — 죽은 링크 0. */

import { API, session, probe, api } from '../../shared/api-v1.js';
import { mountPlate } from './plate.js';
import { handoffFragment } from './handoff.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const OPS_PORT = 8702;
const $ = (id) => document.getElementById(id);
const gate = $('gate'), door = $('door'), form = $('form'), go = $('go'), msg = $('msg'), seg = $('seg');
const idIn = $('id'), pwIn = $('pw');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 판 ─────────────────────────────────────────────────────────── */
function bootPlate() {
  const plate = mountPlate({
    el: $('map'), sweep: $('sweep'), ticks: $('ticks'), credit: $('credit'),
    cap: { root: $('cap'), name: $('capName'), task: $('capTask'), num: $('capNum'), unit: $('capUnit'), sigK: $('capSigK'), tip: $('capTip'),
      where: document.querySelector('.cap__where'), row: document.querySelector('.cap__num') },
    padRight: () => door.getBoundingClientRect().width,
  });
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
  return plate;
}
const plate = window.maplibregl ? bootPlate() : (addEventListener('load', () => { window.__plateState = bootPlate(); }), null);
const plateState = () => plate || window.__plateState || null;

/* ── 계정 3택 — 관리자 = 문이 잉크로 반전(관제의 집 미리보기) ─────── */
const WHO = ['staff', 'admin', 'tenant'];
const who = () => form.who.value;
function pick(v, from) {
  const i = WHO.indexOf(v);
  seg.querySelector('.seg__bar').style.setProperty('--i', String(i));
  if (from) {
    const d = door.getBoundingClientRect(), c = from.getBoundingClientRect();
    door.style.setProperty('--ox', (c.left + c.width / 2 - d.left) + 'px');
    door.style.setProperty('--oy', (c.top + c.height / 2 - d.top) + 'px');
  }
  door.dataset.house = v === 'admin' ? 'ops' : 'paper';
  clearErr();
}
for (const r of form.who) r.addEventListener('change', (e) => pick(e.target.value, e.target.closest('.seg__c')));
pick(who());
/* 집이 정문으로 돌려보낸 경우(?next) — 그 집의 문을 미리 골라 둔다 */
{ const n = new URLSearchParams(location.search).get('next') || '';
  const want = /ops/.test(n) ? 'admin' : /gov-fusion|service/.test(n) ? 'tenant' : null;
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
/* 집 — 역할마다 후보를 순서대로(v3 집 → 현행 화면). 같은 저장소라 HEAD 로 있는지만 본다. */
const HOMES = {
  staff:  ['/landxi/v3/lx-console/', '/landxi/v3/console/'],
  admin:  ['/landxi/v3/ops-core/', '/landxi/v3/ops/'],
  tenant: ['/landxi/v3/gov-fusion/', '/landxi/v3/service/'],
};
const LEGACY = { staff: '/landxi/xi/index.html', tenant: '/landxi/xi/index.html' };
const houseOf = (s) => (s.realm === 'tenant' ? 'tenant' : s.role === 'admin' ? 'admin' : 'staff');

/* ?next — 같은 출처 절대 경로만, 그리고 그 역할이 들어갈 수 있는 집만(오픈 리다이렉트 0 · 권한 밖 착지 0).
   집 화면들이 세션 없이 열리면 정문으로 ?next=<경로+해시> 를 달아 보낸다. */
const NEXT_OK = /^\/landxi\/(?:v3\/[a-z-]+\/(?:index\.html)?|xi\/(?:index\.html)?)(?:\?[^\s#\\]*)?(?:#[^\s\\]*)?$/;
const NEXT_FOR = { staff: ['lx-console', 'console', 'xi-clean', 'xi'], admin: ['ops-core', 'ops', 'xi-clean', 'xi'], tenant: ['gov-fusion', 'service', 'xi-clean', 'xi'] };
function nextParam(house) {
  const v = new URLSearchParams(location.search).get('next') || '';
  if (!NEXT_OK.test(v) || /\.\./.test(v)) return null;
  const dir = (/^\/landxi\/(?:v3\/)?([a-z-]+)\//.exec(v) || [])[1];
  return house && !NEXT_FOR[house].includes(dir) ? null : v;
}

async function homeOf(s) {
  const house = houseOf(s);
  const n = nextParam(house); if (n) return n;
  for (const h of HOMES[house]) if (await exists(h + 'index.html')) return h;
  if (house === 'admin') return `${location.protocol}//${location.hostname}:${OPS_PORT}/landxi/ops/index.html#${handoffFragment(s)}`;   // 현행 관제(:8702) — 조각 인계
  return LEGACY[house];
}

/* 기관 계정: 로그인 아이디 = '<기관>-<역할>'(예 namwon-manager) — 기관은 아이디에서 읽는다(입력칸 하나 덜기) */
const tenantOf = (login) => (/^(.+)-[a-z]+$/.exec(login) || [])[1] || login;

/* ── 들어가기 ───────────────────────────────────────────────────── */
async function enter(s) {
  const url = await homeOf(s);
  document.documentElement.dataset.dest = url.replace(/#.*$/, '');
  if (!REDUCE) {
    gate.classList.add('leaving');
    plateState()?.release?.();
    await wait(760);
  }
  location.assign(url);
}

let busy = false;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  const login = idIn.value.trim(), password = pwIn.value;
  if (!login || !password) { say('아이디와 비밀번호를 입력하세요', [!login && 'id', !password && 'pw'].filter(Boolean)); (login ? pwIn : idIn).focus(); return; }

  busy = true; go.setAttribute('aria-busy', 'true'); clearErr();
  try {
    const p = await probe(true);
    if (!p.ok) { say('서버에 연결할 수 없습니다'); return; }
    const w = who();
    const body = w === 'tenant' ? { realm: 'tenant', tenant_id: tenantOf(login), login, password } : { realm: 'lx', login, password };
    let s;
    try { s = await api('/auth/login', { method: 'POST', body }); }
    catch (err) {
      if (err.status === 401 || err.code === 'unauthorized') { say(err.message || '아이디 또는 비밀번호가 맞지 않습니다', ['pw']); pwIn.value = ''; pwIn.focus(); }
      else say('잠시 후 다시 시도하세요');
      return;
    }
    if (w === 'admin' && s.role !== 'admin') {
      try { await fetch(API.prefix + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }); } catch { /* */ }
      say('관리자 계정이 아닙니다', ['id']); return;
    }
    session.set({ token: s.token, realm: s.realm, role: s.role, tenant_id: s.tenant_id, expires_at: s.expires_at, user: s.user });
    window.__login.last = { realm: s.realm, role: s.role, tenant_id: s.tenant_id };
    await enter(s);
  } finally {
    busy = false; go.removeAttribute('aria-busy');
  }
});

/* ── 이미 들어와 있으면 '계속' 한 줄 · ?logout 이면 서버 세션까지 끝낸다 ── */
(async () => {
  const q = new URLSearchParams(location.search);
  if (q.has('logout')) {
    const s = session.get();
    if (s) { try { await probe(); await api('/auth/logout', { method: 'POST' }); } catch { /* 이미 끝남 */ } }
    session.clear();
    q.delete('logout'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    return;
  }
  const s = session.get();
  if (!s) return;
  const p = await probe();
  if (!p.ok) return;
  try {
    const me = await api('/me');
    const r = $('resume');
    r.textContent = `${me.user?.name || '내 계정'}으로 계속 →`;
    r.hidden = false;
    r.addEventListener('click', async (ev) => { ev.preventDefault(); await enter({ ...s, realm: me.realm, role: me.role, tenant_id: me.tenant_id }); });
    const want = me.realm === 'tenant' ? 'tenant' : me.role === 'admin' ? 'admin' : 'staff';
    const radio = [...form.who].find((x) => x.value === want); if (radio) { radio.checked = true; pick(want); }
  } catch { session.clear(); }
})();

/* ── 계정 찾기 · 신청 서랍 ───────────────────────────────────────── */
const help = $('help');
$('helpBtn').addEventListener('click', () => help.showModal());
help.addEventListener('click', (e) => { if (e.target === help) help.close(); });

/* ── 테스트 훅 ─────────────────────────────────────────────────── */
window.__login = {
  ready: true, last: null,
  who, homeOf, tenantOf, nextParam,
  plate: () => { const p = plateState(); return p ? { region: p.region, arrived: p.arrived, error: p.error, visits: p.visits } : null; },
};
