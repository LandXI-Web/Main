/* Land-XI 로그인 — 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 4차 개정 · 구 랜드XI 구도의 중앙 카드).
   카드 좌: 디오라마 오프닝 필름 Leg 01 루프 · 카드 우: 원본 login.html 의 폼 1:1(문구·에러 2종 원본 그대로).

   유지 기능: ?next= 안전 리다이렉트(같은 사이트 *.html 만) · localStorage.lx_logged_in ·
             ?logout(세션 삭제 — 6차: 배너 문구 없음, 제목 아래 소개 문장이 상시) · 아이디 저장(lx_saved_email, 라벨은 원본 '로그인 상태 유지') · 목 인증. */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 원본 login.html 의 에러 문구 2종 — 더하지도 빼지도 않는다. */
const MSG = {
  email: '아이디를 입력해 주세요.',
  pw: '비밀번호를 입력해 주세요.',
};

/* 오픈 리다이렉트 방지 — 같은 사이트의 "이름.html(?쿼리)" 만 허용. */
const safeNext = (v) =>
  (/^[a-z0-9_-]+\.html(?:\?[^\s#]*)?$/i.test(v || '') && !/[:\/\\]/.test(v)) ? v : 'dashboard.html';
const params = () => new URLSearchParams(location.search);
const nextTarget = () => safeNext(params().get('next'));
const isLoggedIn = () => localStorage.getItem('lx_logged_in') === '1';

const $ = (s) => document.querySelector(s);
const form = $('#loginForm');
const btn = $('#lgSubmit');
const video = $('#lgVideo');

/* ?logout — 세션만 지운다(6차: 배너 문구 삭제, 로그인 아래에는 소개 문장이 상시). 이미 로그인 상태면 바로 next 로. */
if (params().has('logout')) {
  localStorage.removeItem('lx_logged_in');
/* **이미 로그인돼 있어도 넘기지 않는다** (2026-09-22).
   발주자: "로그인 창에서 바로 로그인 되버린다." → "아. 로그아웃 해야 그다음 들어가면 되는 구나"
   계정이 하나뿐일 때는 바로 넘기는 게 편의였다. **계정 종류가 셋으로 갈린 지금은 길을 막는 것**이다 —
   관리자로 보다가 영업용으로 바꿔 보려고 로그인 화면에 오면 그대로 튕겨 나갔고,
   로그아웃부터 해야 한다는 걸 사용자가 스스로 알아내야 했다. 그건 설계가 시킨 헤맴이다.
   로그인 화면은 **계정을 바꾸러 오는 자리**이기도 하므로 늘 선다.
   ?next 로 온 경우만 예전처럼 바로 넘긴다 — 관문이 잠깐 막아서 보낸 것이니 다시 묻지 않는다. */
} else if (isLoggedIn() && params().has('next')) {
  location.replace(nextTarget());
}

/* 이미 들어와 있으면 **지금 어느 계정인지** 알려 주고 고르개를 그 값으로 맞춰 둔다 —
   모르고 다른 계정으로 갈아타는 일이 없게. */
if (isLoggedIn()) {
  const NAME = { admin: 'LX 관리자', staff: 'LX 직원', sales: '영업용 계정' };
  let cur = 'admin';
  try { cur = localStorage.getItem('lx_role') || 'admin'; } catch { /* 저장소 차단 */ }
  const r = form?.role && [...form.role].find((x) => x.value === cur);
  if (r) r.checked = true;
  const fs = document.getElementById('lgRole');
  if (fs && NAME[cur]) {
    const p2 = document.createElement('p');
    p2.className = 'lg-role-now';
    p2.textContent = `지금 ${NAME[cur]}로 들어와 있습니다 — 다시 로그인하면 고른 계정으로 바뀝니다.`;
    fs.append(p2);
  }
}

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
const saved = localStorage.getItem('lx_saved_email');
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

  /* 목 인증 — 값이 있으면 통과(기존 프로토와 동일). */
  setTimeout(() => {
    localStorage.setItem('lx_logged_in', '1');
    /* 계정 종류를 함께 기억한다 — 레일과 관문이 이 값을 읽어 위계를 가른다(roles.js).
       ?next 가 있으면 그리로, 없으면 **그 역할의 첫 화면**으로 간다.
       영업용 계정을 대시보드로 떨구면 볼 것이 없다 — 지도부터 여는 게 맞다. */
    const role = form.role ? [...form.role].find((r) => r.checked)?.value || 'admin' : 'admin';
    localStorage.setItem('lx_role', role);
    if (form.remember.checked) localStorage.setItem('lx_saved_email', email);
    else localStorage.removeItem('lx_saved_email');
    const HOME = { admin: 'admin-home.html', staff: 'ai-project.html', sales: 'ximap.html' };
    const q = new URLSearchParams(location.search).get('next');
    location.assign(q ? nextTarget() : HOME[role]);
  }, REDUCE ? 0 : 240);
});

/* 정책 링크 — 모달 3종은 아직 이식 전. 페이지 점프만 막는다. */
for (const a of document.querySelectorAll('[data-policy]')) a.addEventListener('click', (e) => e.preventDefault());

/* ── 테스트 훅 ────────────────────────────────────────────────────────────── */
window.__login = {
  ready: true,
  MSG,
  safeNext,
  next: nextTarget,
  source: () => (video.currentSrc || null),
  drifting: () => !!(video && !video.paused && !video.ended && video.readyState > 2),
};
