/* Land-XI 로그인 — 마스터 design-canvas/v2/B5-Login.dc.html (NOTES §14 · 4차 개정 · 구 랜드XI 구도의 중앙 카드).
   카드 좌: 디오라마 오프닝 필름 Leg 01 루프 · 카드 우: 원본 login.html 의 폼 1:1(문구·에러 2종 원본 그대로).

   유지 기능: ?next= 안전 리다이렉트(같은 사이트 *.html 만) · localStorage.lx_logged_in ·
             ?logout 배너 · 아이디 저장(lx_saved_email, 라벨은 원본 '로그인 상태 유지') · 목 인증. */

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

/* ?logout — 세션을 지우고 배너를 켠다. 이미 로그인 상태면 바로 next 로. */
if (params().has('logout')) {
  localStorage.removeItem('lx_logged_in');
  $('#lgBanner').hidden = false;
} else if (isLoggedIn()) {
  location.replace(nextTarget());
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
    if (form.remember.checked) localStorage.setItem('lx_saved_email', email);
    else localStorage.removeItem('lx_saved_email');
    location.assign(nextTarget());
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
