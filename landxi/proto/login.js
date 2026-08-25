/* Land-XI 로그인 — "관문이 아니라 도킹".
   화면은 **B안(에디토리얼 아틀라스)** 그대로다. 판(FIG. 01)만 지도가 아니라 **디오라마**다:
   남원 금지면 비닐하우스 단지를 실측 풋프린트 위에 모형으로 재현한 필름.

   카피는 '분위기'가 아니라 **Land-XI 플랫폼 소개**다 — 모토(H1) · 비전 · 3축 색인(실수치).

   유지 기능: ?next= 안전 리다이렉트(상대 *.html 만) · localStorage.lx_logged_in ·
             아이디 저장(lx_saved_email) · 목 인증 · 성공 시 판이 뷰포트를 먹고 남원으로 밀고 들어간다. */

import LXSys from './system.js';          /* 시트 부팅 — revealAll · underlines */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 착지 지점 — 남원 금지면(디오라마가 재현한 실좌표). 성공 후 카메라가 여기 있다. */
const NAMWON = [127.3524, 35.5311];

/* 판 후보 — 앞의 것이 있으면 그것을 쓴다.
   1) AI 미니어처 디오라마 레그(남원 금지면 비닐하우스) — 이 화면이 원하는 그림.
   2) 없으면 히어로 필름을 0.5× 로 늘려 앰비언트로만 돌린다. */
const SOURCES = [
  {
    src: '../assets/proto/film/legs/gen/namwon-greenhouse-test.mp4',
    poster: '../assets/proto/film/legs/gen/namwon-greenhouse-test.png',
    rate: 1,
    cap: '남원 금지면 · 비닐하우스 9,664동 · 모형 재현',
    plate: 'PLATE — 남원 금지면 디오라마 · 실측 풋프린트 위 모형 재현 · 1:2,000',
  },
  {
    src: '../assets/proto/film/hero.mp4',
    poster: '../assets/proto/film/poster.jpg',
    rate: 0.5,
    cap: '남원 금지면 · 비닐하우스 9,664동 · 궤도에서 착지까지',
    plate: 'PLATE — 궤도 → 한반도 → 남원 금지면 · 0.5× 재생',
  },
];

/* 카피 덱 §8 — 사과 없음. 원인 + 다음 행동. */
const MSG = {
  email: '업무 이메일 형식으로 입력해 주세요 (예: hong@lx.or.kr)',
  pw: '비밀번호가 비어 있습니다. 계정은 소속 기관 담당자가 발급합니다.',
  film: '이 브라우저에서는 필름을 재생할 수 없습니다. 정지 화면으로 전체 내용을 볼 수 있습니다.',
};
/* 동사 사슬(카피 덱 §8·§4-1): 로그인하고 시작하기 → 로그인 중… → 시작됨 */
const VERB = { idle: '로그인하고 시작하기', busy: '로그인 중…', done: '시작됨' };

/* 오픈 리다이렉트 방지 — 같은 사이트의 "이름.html(?쿼리)" 만 허용. 기존 규칙 그대로. */
const safeNext = (v) =>
  (/^[a-z0-9_-]+\.html(?:\?[^\s#]*)?$/i.test(v || '') && !/[:\/\\]/.test(v)) ? v : 'dashboard.html';
const nextTarget = () => safeNext(new URLSearchParams(location.search).get('next'));

const isLoggedIn = () => localStorage.getItem('lx_logged_in') === '1';

const $ = (s) => document.querySelector(s);
const root = $('#lg');
const form = $('#loginForm');
const btn = $('#lgSubmit');
const verbEl = btn.querySelector('.lx-cta__t');
const plate = $('#lgPlate');
const video = $('#lgVideo');

/* 이미 로그인 상태면 도킹 과정을 반복하지 않는다(기존 동작 유지). */
if (isLoggedIn()) location.replace(nextTarget());

/* ── 등장 — 헤드라인은 줄 단위 마스크, 나머지는 [data-reveal] 스태거 ────────
   이 화면은 스크롤이 없다(한 판). system.js 의 스크롤 리빌 관찰자는 뷰포트 하단
   10% 를 잘라 보므로 마지막 블록이 영영 안 켜진다 — 여기서는 직접 순서대로 켠다. */
requestAnimationFrame(() => requestAnimationFrame(() => {
  $('#lgH1').classList.add('is-in');
  plate.classList.add('is-in');
  for (const n of document.querySelectorAll('[data-reveal]')) {
    const d = REDUCE ? 0 : Number(n.dataset.revealDelay || 0);
    setTimeout(() => n.classList.add('is-in'), d);
  }
}));

/* ── 시계 — KST hh:mm. 캡션의 숫자는 전부 해설이다(§5-9). ─────────────── */
const clockEl = $('#lgClock');
const tickClock = () => {
  const kst = new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  clockEl.textContent = String(kst.getHours()).padStart(2, '0') + ':' + String(kst.getMinutes()).padStart(2, '0');
};
tickClock();
setInterval(tickClock, 20000);

/* ── 판 — 디오라마 필름 ───────────────────────────────────────────────── */
let picked = null;

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok && Number(r.headers.get('content-length') || 1) > 0;
  } catch { return false; }
}

function fail(text) {
  const f = $('#lgFallback');
  f.textContent = text; f.hidden = false;
  root.dataset.plate = 'poster';
  window.__login.ready = true;
}

async function boot() {
  for (const s of SOURCES) {
    if (!(await exists(s.src))) continue;
    picked = s;
    break;
  }

  /* 포스터·캡션은 고른 소스에 맞춘다 — 캡션이 사진과 다른 말을 하면 안 된다. */
  const shown = picked || SOURCES[0];
  video.poster = shown.poster;
  $('#lgCapMeta').textContent = shown.cap;
  $('#lgReadPlate').textContent = shown.plate;

  if (!picked) { fail(MSG.film); return; }          /* 필름이 아직 없다 — 포스터 정지 화면 */

  /* 축소 모션이면 아예 걸지 않는다 — 포스터가 그대로 남는다(§5 감소 모션). */
  if (REDUCE) { root.dataset.plate = 'poster'; window.__login.ready = true; return; }

  video.src = picked.src;
  video.addEventListener('loadeddata', () => {
    video.playbackRate = picked.rate;
    root.dataset.plate = 'film';
    window.__login.ready = true;
  }, { once: true });
  video.addEventListener('error', () => fail(MSG.film), { once: true });

  try { await video.play(); } catch { /* 자동재생 거부 — 포스터로 남는다 */ }
  /* 로드가 오래 걸려도 화면은 이미 완성되어 있다(포스터). 훅은 붙잡아 두지 않는다. */
  setTimeout(() => { window.__login.ready = true; }, 2500);
}

/* ── 폼 — 헤어라인 필드. 포커스는 색이 아니라 선이 그어지는 사건이다. ──── */
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
let busy = false;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (busy) return;

  const email = form.email.value.trim();
  const pw = form.pw.value;
  let bad = null;

  if (!EMAIL_RE.test(email)) { setErr('email', MSG.email); bad = bad || 'email'; } else clearErr('email');
  if (!pw) { setErr('pw', MSG.pw); bad = bad || 'pw'; } else clearErr('pw');
  if (bad) { fields[bad].input.focus(); return; }

  busy = true;
  btn.disabled = true;
  verbEl.textContent = VERB.busy;
  verbEl.dataset.verb = 'busy';

  /* 목 인증 — 형식이 맞으면 통과(기존 프로토와 동일). */
  setTimeout(() => {
    localStorage.setItem('lx_logged_in', '1');
    if (form.remember.checked) localStorage.setItem('lx_saved_email', email);
    else localStorage.removeItem('lx_saved_email');

    verbEl.textContent = VERB.done;
    verbEl.dataset.verb = 'done';
    handoff();
  }, REDUCE ? 0 : 420);
});

/* ── 핸드오프 — 화면 전환이 아니라 카메라 이동(§5-4). ────────────────────── */
/* 종이가 물러나고, 판이 액자를 벗어 뷰포트 전체가 되면서 남원으로 밀고 들어간다.
   판이 곧 남원이므로 지도를 갈아 끼울 필요가 없다 — 같은 프레임이 계속된다. */
function handoff() {
  const go = () => location.assign(nextTarget());
  if (REDUCE) { window.__login.landed = true; go(); return; }

  root.classList.add('is-leaving');
  $('#lgReadStat').textContent = '이동 중 · 남원 금지면 · 2025-08 정사영상 4시점';

  plate.classList.add('is-full');

  setTimeout(() => {
    $('#lgReadStat').textContent = '착지 · 남원 금지면 · 비닐하우스 9,664동 · 다음 화면으로';
    window.__login.landed = true;
    setTimeout(go, 600);                            /* 카피 덱 §8: "시작됨" 0.6초 노출 */
  }, 1250);                                         /* 지속 사다리 d4 */
}

/* ── 테스트 훅 ────────────────────────────────────────────────────────── */
window.__login = {
  ready: false,
  landed: false,
  MSG, VERB, NAMWON,
  safeNext,
  next: nextTarget,
  source: () => (picked ? picked.src : null),
  /* 판이 보고 있는 곳 — 디오라마가 재현한 실좌표. 성공 후에도 여기 그대로다. */
  center: () => NAMWON.slice(),
  /* 앰비언트 — 5초 아무것도 안 해도 필름이 돌고 있는가(§5-2). */
  drifting: () => !!(video && !video.paused && !video.ended && video.readyState > 2),
};

boot();
