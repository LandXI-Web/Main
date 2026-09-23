/* Land-XI 로그인 — 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 4차 개정 · 구 랜드XI 구도의 중앙 카드).
   카드 좌: 디오라마 오프닝 필름 Leg 01 루프 + 계정 캡션 띠 · 카드 우: 원본 login.html 의 폼 1:1(문구·에러 2종 원본 그대로).

   유지 기능: ?next= 안전 리다이렉트(같은 사이트 *.html 만) · ?logout · 아이디 저장(lx_saved_email, 라벨은 원본 '로그인 상태 유지') · 목 인증.

   세션 계약(MASTER-PLAN §7.1 · E0-2 · 2026-09-24) — LX 문은 LX 세션만 세운다.
     키           값                              누가
     lx_logged_in '1'                             LX 세션
     lx_role      'admin' | 'staff' | 'sales'     LX 세션
     lx_tenant_session {"tenant":…,"at":…}        기관 세션(Q1 — 완전 별도. 이 문은 세우지 않는다)
   LX signIn  = lx_logged_in · lx_role 세우고 **lx_tenant_session 제거**(기관 세션은 끝난다).
   signOut(?logout) = 세 키 전부 제거(C-09 — 예전엔 lx_logged_in 하나만 지워 lx_role 이 남았다).
   두 세션이 동시에 있으면 손상 — 셋 다 지우고 이 화면에 선다.
   목적지 = ?next(안전한 것만) 우선, 없으면 roles.js homeOf(role) — 이 파일에 역할 표를 따로 두지 않는다. */

import { ROLES, CAPS, roleById, homeOf } from '../assets/data/roles.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.15,1,0.3,1)';   // 법전 §4 이징 하나

const K = { in: 'lx_logged_in', role: 'lx_role', tenant: 'lx_tenant_session' };
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장소 차단 */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* 저장소 차단 */ } },
};
const signOut = () => { ls.del(K.in); ls.del(K.role); ls.del(K.tenant); };
const signIn = (role) => { ls.set(K.in, '1'); ls.set(K.role, role); ls.del(K.tenant); };

/* 원본 login.html 의 에러 문구 2종 — 더하지도 빼지도 않는다. */
const MSG = {
  email: '아이디를 입력해 주세요.',
  pw: '비밀번호를 입력해 주세요.',
};

/* 오픈 리다이렉트 방지 — 같은 사이트의 "이름.html(?쿼리)" 만 허용. 아니면 null(→ 역할의 첫 화면). */
const safeNext = (v) =>
  (/^[a-z0-9_-]+\.html(?:\?[^\s#]*)?$/i.test(v || '') && !/[:\/\\]/.test(v)) ? v : null;
const params = () => new URLSearchParams(location.search);
const nextTarget = () => safeNext(params().get('next'));
const isLoggedIn = () => ls.get(K.in) === '1';
const tenantSession = () => {
  const raw = ls.get(K.tenant);
  if (!raw) return null;
  try { const o = JSON.parse(raw); return o && typeof o.tenant === 'string' ? o : { tenant: null }; } catch { return { tenant: null }; }
};
const destination = (role) => nextTarget() || homeOf(role);

const $ = (s) => document.querySelector(s);
const form = $('#loginForm');
const btn = $('#lgSubmit');
const video = $('#lgVideo');

/* ── 세션 정리 — ?logout · 손상 ──────────────────────────────────────────── */
if (params().has('logout')) {
  signOut();
/* **이미 로그인돼 있어도 넘기지 않는다** (2026-09-22).
   로그인 화면은 **계정을 바꾸러 오는 자리**이기도 하므로 늘 선다.
   ?next 로 온 경우만 예전처럼 바로 넘긴다 — 관문이 잠깐 막아서 보낸 것이니 다시 묻지 않는다.
   기관 세션은 LX 화면으로 넘기지 않는다(Q1) — 이 문에서 LX 계정으로 다시 로그인해야 한다. */
} else if (isLoggedIn() && tenantSession()) {
  signOut();                                   // 두 세션이 동시에 — 손상. 전부 지우고 여기 선다.
} else if (isLoggedIn() && params().has('next') && nextTarget()) {
  location.replace(nextTarget());
}

/* 이미 들어와 있으면 **지금 어느 계정인지** 알려 주고 고르개를 그 값으로 맞춰 둔다 —
   모르고 다른 계정으로 갈아타는 일이 없게. */
const nowLine = (text) => {
  const fs = document.getElementById('lgRole');
  if (!fs) return;
  const p = document.createElement('p');
  p.className = 'lg-role-now';
  p.id = 'lgRoleNow';
  p.textContent = text;
  fs.append(p);
};
if (isLoggedIn()) {
  const cur = roleById(ls.get(K.role));
  if (cur) {
    const r = [...form.role].find((x) => x.value === cur.id);
    if (r) r.checked = true;
    const as = /계정$/.test(cur.name) ? `${cur.name}으로` : `${cur.name} 계정으로`;   // 'LX 관리자 계정으로' · '영업용 계정으로'
    nowLine(`지금 ${as} 들어와 있습니다 — 다시 로그인하면 고른 계정으로 바뀝니다.`);
  }
} else if (tenantSession()) {
  /* 기관 세션 — 기관 이름은 portal.js 가 정본. 이 화면에서만 필요하니 그때만 불러온다. */
  const t = tenantSession();
  const say = (name) => nowLine(`지금 ${name} 계정으로 들어와 있습니다 — LX 계정으로 로그인하면 기관 세션은 끝납니다.`);
  import('../assets/data/portal.js')
    .then(({ tenantById }) => { const x = t.tenant && tenantById(t.tenant); say(x && x.id === t.tenant ? x.name : '기관'); })
    .catch(() => say('기관'));
}

/* ── 계정 캡션 — 고른 계정이 하는 일. 문구는 roles.js 에서만(ROLES[].what · CAPS). ─────
   바뀔 때마다 이름 → 설명 → 할 수 있는 일 3개가 600ms · 60ms 스태거로 들어온다. 축소 모션 = 즉시. */
const cap = { name: $('#lgCapName'), what: $('#lgCapWhat'), caps: $('#lgCapCaps'), who: $('.lg-cap__who') };
const CAP_N = 3;
const checkedRole = () => [...form.role].find((r) => r.checked)?.value || ROLES[0].id;
function caption(roleId, animate = !REDUCE) {
  const r = roleById(roleId);
  if (!r || !cap.name) return;
  cap.name.textContent = r.name;
  cap.what.textContent = r.what;
  cap.caps.replaceChildren(...r.caps.slice(0, CAP_N).map((k) => {
    const li = document.createElement('li');
    li.textContent = CAPS[k];
    li.dataset.cap = k;
    return li;
  }));
  document.getElementById('lgCap').dataset.role = r.id;
  if (!animate || typeof Element.prototype.animate !== 'function') return;
  const items = [cap.who, ...cap.caps.children];
  items.forEach((el, i) => {
    for (const a of el.getAnimations()) a.cancel();
    el.animate([{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 600, delay: i * 60, easing: EASE, fill: 'backwards' });
  });
}
caption(checkedRole());
form.addEventListener('change', (e) => { if (e.target.name === 'role') caption(e.target.value); });

/* ── 판 — Leg 01 루프. 축소 모션이면 소스를 떼고 포스터만 남긴다. ─────────── */
if (REDUCE) {
  for (const s of video.querySelectorAll('source')) s.remove();
  video.removeAttribute('autoplay');
  video.load();
} else {
  video.play().catch(() => { /* 자동재생 거부 — 포스터로 남는다 */ });
}

/* ── 폼 — 밑줄 필드. 포커스는 색이 아니라 선이 그어지는 사건이다. ─────────── */
const fields = {};
for (const wrap of document.querySelectorAll('.lx-field')) {
  const key = wrap.dataset.field;
  const input = wrap.querySelector('.lx-field__input');
  const msg = wrap.querySelector('.lx-field__msg');
  fields[key] = { wrap, input, msg };
  input.addEventListener('focus', () => wrap.classList.add('is-focus'));
  input.addEventListener('blur', () => wrap.classList.remove('is-focus'));
  input.addEventListener('input', () => clearErr(key));
}
const setErr = (key, text) => {
  const f = fields[key];
  f.wrap.classList.add('is-error');
  f.msg.textContent = text; f.msg.hidden = false;
  f.input.setAttribute('aria-invalid', 'true');
};
const clearErr = (key) => {
  const f = fields[key];
  if (!f.wrap.classList.contains('is-error')) return;
  f.wrap.classList.remove('is-error');
  f.msg.hidden = true; f.msg.textContent = '';
  f.input.removeAttribute('aria-invalid');
};

/* 아이디 저장(기존 기능 유지) */
const saved = ls.get('lx_saved_email');
if (saved) { form.email.value = saved; form.remember.checked = true; }

let busy = false;
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;

  const email = form.email.value.trim();
  const pw = form.pw.value;
  let bad = null;

  if (!email) { setErr('email', MSG.email); bad = bad || 'email'; } else clearErr('email');
  if (!pw) { setErr('pw', MSG.pw); bad = bad || 'pw'; } else clearErr('pw');
  if (bad) { fields[bad].input.focus(); return; }

  busy = true;
  btn.disabled = true;

  /* 목 인증 — 값이 있으면 통과(기존 프로토와 동일). §7.1 signIn: 기관 세션은 여기서 끝난다. */
  const role = checkedRole();
  setTimeout(() => {
    signIn(role);
    if (form.remember.checked) ls.set('lx_saved_email', email);
    else ls.del('lx_saved_email');
    location.assign(destination(role));
  }, REDUCE ? 0 : 240);
});

/* 정책 링크 — 정책 화면(site/policy.html)은 E1-1 에서 선다. 없는 페이지로 보내지 않는다 — 점프만 막는다. */
for (const a of document.querySelectorAll('[data-policy]')) a.addEventListener('click', (e) => e.preventDefault());

/* ── 테스트 훅 ────────────────────────────────────────────────────────────── */
window.__login = {
  ready: true,
  MSG,
  safeNext,
  next: nextTarget,
  destination,
  role: checkedRole,
  caption: () => ({ role: document.getElementById('lgCap')?.dataset.role || null, name: cap.name?.textContent || '', what: cap.what?.textContent || '', caps: [...(cap.caps?.children || [])].map((li) => li.textContent) }),
  source: () => (video.currentSrc || null),
  drifting: () => !!(video && !video.paused && !video.ended && video.readyState > 2),
};
