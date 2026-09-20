/* 인증 가족 — 계정 신청(signup) · 아이디 찾기(find-id) · 비밀번호 찾기(find-password) + 결과 2.
   마스터 design-canvas/v2/B6-Auth-*.dc.html · 원본 landxi7/{signup,find-id,find-id-result,find-password,find-password-result}.html 1:1.
   로그인 전 화면 — 관문 · 레일 없음. 필름 · 밑줄 필드 동작은 login.js 와 같다(login.* 는 건드리지 않는다).
   URL 이 상태다: signup ?step=1|2|3(원본 딥링크 · 뒤로 가기) · 결과 ?result=fail(원본은 실패 블록이 주석 — 여기서는 쿼리로 고른다) · ?name=(원본 전달값). */
import { TERMS } from './auth-terms.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const page = document.body.dataset.page;

/* 원본 문구 — 더하지도 빼지도 않는다. */
const MSG = {
  name: '이름을 입력해 주세요.',
  phone: '전화번호를 입력해 주세요.',
  findEmail: '아이디(이메일)를 입력해 주세요.',
  emailEmpty: '이메일을 입력해 주세요.',
  emailFormat: '올바른 이메일 형식을 입력해 주세요.',
  pwWeak: '영문·숫자·특수문자를 조합해 8자 이상',
  pw2Empty: '비밀번호를 한 번 더 입력하세요.',
  pw2Mismatch: '비밀번호가 일치하지 않습니다.',
  contact: '연락처를 입력해 주세요.',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PW = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ── 필름 — 로그인과 같은 Leg 루프. 축소 모션이면 소스를 떼고 포스터만. ── */
const video = $('#lgVideo');
if (video) {
  if (REDUCE) { for (const s of $$('source', video)) s.remove(); video.removeAttribute('autoplay'); video.load(); }
  else video.play().catch(() => { /* 자동재생 거부 — 포스터 */ });
}
/* 정책 링크 — 로그인과 같이 모달 3종은 이식 전. 페이지 점프만 막는다. */
for (const a of $$('[data-policy]')) a.addEventListener('click', (e) => e.preventDefault());

/* ── 밑줄 필드 — 포커스는 선이 그어지는 사건. 오류 = 잉크 2px + 빨간 문구(힌트가 있으면 힌트 자리가 바뀐다 — 원본). ── */
const fields = {};
for (const wrap of $$('.lx-field')) {
  const input = $('.lx-field__input', wrap), msg = $('.lx-field__msg, .au-hint', wrap);
  fields[wrap.dataset.field] = { wrap, input, msg };
  input.addEventListener('focus', () => wrap.classList.add('is-focus'));
  input.addEventListener('blur', () => wrap.classList.remove('is-focus'));
  input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => clearErr(wrap.dataset.field));
}
function setErr(key, text) {
  const f = fields[key];
  f.wrap.classList.add('is-error'); f.input.setAttribute('aria-invalid', 'true');
  if (!f.msg) return;
  if (f.msg.classList.contains('au-hint')) { f.msg.classList.add('is-err'); if (text) f.msg.textContent = text; }
  else { f.msg.textContent = text || ''; f.msg.hidden = !text; }
}
function clearErr(key) {
  const f = fields[key];
  if (!f.wrap.classList.contains('is-error')) return;
  f.wrap.classList.remove('is-error'); f.input.removeAttribute('aria-invalid');
  if (f.msg?.classList.contains('au-hint')) { f.msg.classList.remove('is-err'); f.msg.textContent = f.msg.dataset.hint || ''; }
  else if (f.msg) { f.msg.hidden = true; f.msg.textContent = ''; }
  syncFormState();
}
const syncFormState = () => $('.au-form')?.classList.toggle('has-error', !!$('.au-form .lx-field.is-error'));
const check = (key, ok, text) => { if (ok) clearErr(key); else setErr(key, text); return ok; };

/* ══ 아이디 찾기 · 비밀번호 찾기 ════════════════════════════════════════ */
if (page === 'find-id' || page === 'find-password') {
  const form = $('#findForm'), second = page === 'find-id' ? 'phone' : 'email';
  if (page === 'find-id') fields.phone.input.addEventListener('input', () => {         // 전화번호: 숫자만(원본)
    const el = fields.phone.input, digits = el.value.replace(/[^0-9]/g, ''); if (el.value !== digits) el.value = digits;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = fields.name.input.value.trim(), v2 = fields[second].input.value.trim();
    const a = check('name', !!name, MSG.name), b = check(second, !!v2, page === 'find-id' ? MSG.phone : MSG.findEmail);
    syncFormState();
    if (!a || !b) { fields[a ? second : 'name'].input.focus(); return; }
    location.assign(page === 'find-id' ? `find-id-result.html?name=${encodeURIComponent(name)}` : 'find-password-result.html');   // 데모: 입력값을 결과 화면으로(원본)
  });
}

/* ══ 결과 — ?result=fail 이면 실패 블록 ═════════════════════════════════ */
if (page === 'find-id-result' || page === 'find-password-result') {
  const fail = new URLSearchParams(location.search).get('result') === 'fail';
  for (const el of $$('[data-when]')) el.hidden = (el.dataset.when === 'fail') !== fail;
  document.body.dataset.result = fail ? 'fail' : 'ok';
  $(fail ? '#ctaRetry' : '#ctaLogin')?.focus({ preventScroll: true });
}

/* ══ 계정 신청 3단계 ════════════════════════════════════════════════════ */
if (page === 'signup') {
  const stepOf = () => { const s = new URLSearchParams(location.search).get('step'); return s === '2' || s === '3' ? Number(s) : 1; };
  function goStep(step, { push = false, focus = true } = {}) {
    for (const v of $$('.au-step')) v.hidden = v.id !== `step-view-${step}`;
    for (const li of $$('#auSteps li')) {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-done', n < step);
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    }
    document.body.dataset.step = step;
    if (push) { const u = new URL(location.href); if (step === 1) u.searchParams.delete('step'); else u.searchParams.set('step', step); history.pushState({ step }, '', u); }
    if (focus) ({ 1: $('#agree-all'), 2: $('#f-email'), 3: $('#doneH') })[step]?.focus({ preventScroll: true });
    scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  }
  addEventListener('popstate', () => goStep(stepOf()));

  /* Step 1 — 전체 동의 ↔ 개별 5 · 필수 2 체크 전에는 `다음` 비활성 */
  const all = $('#agree-all'), checks = ['terms', 'privacy', 'marketing', 'sms', 'email'].map((k) => $(`#agree-${k}`)), next1 = $('#btn-next-1');
  const sync = () => { all.checked = checks.every((c) => c.checked); next1.disabled = !(checks[0].checked && checks[1].checked); };
  all.addEventListener('change', () => { checks.forEach((c) => { c.checked = all.checked; }); sync(); });
  checks.forEach((c) => c.addEventListener('change', sync));
  next1.addEventListener('click', () => { if (!next1.disabled) goStep(2, { push: true }); });

  /* 약관 전문 뷰어 — 고른 약관 = 틴트 + 파랑 3px. 행의 `›` 또는 그 행의 체크에 닿으면 바뀐다. */
  function showDoc(key) {
    const d = TERMS[key]; if (!d) return;
    $('#auDocH').innerHTML = `${d.title}<span>${d.range}</span>`;
    $('#auDocB').innerHTML = d.html;                                                   // auth-terms.js = 원본에서 옮긴 고정 문자열(사용자 입력 아님)
    $('#auDoc').scrollTop = 0;
    for (const r of $$('.au-row[data-doc]')) { r.toggleAttribute('data-sel', r.dataset.doc === key); $('.au-view', r).setAttribute('aria-pressed', String(r.dataset.doc === key)); }
  }
  for (const r of $$('.au-row[data-doc]')) {
    $('.au-view', r).addEventListener('click', () => showDoc(r.dataset.doc));
    $('input', r).addEventListener('focus', () => showDoc(r.dataset.doc));
    $('input', r).addEventListener('change', () => showDoc(r.dataset.doc));
  }
  showDoc('terms');

  /* Step 2 — 검증(원본 문구 · 부서/직위는 표시만) */
  const dept = $('#f-dept');
  dept.addEventListener('change', () => dept.classList.toggle('is-empty', !dept.value));
  function validate() {
    const v = (k) => fields[k].input.value, email = v('email').trim(), pw = v('password'), pw2 = v('password2');
    const r = [
      check('email', EMAIL.test(email), email ? MSG.emailFormat : MSG.emailEmpty),
      check('password', STRONG_PW.test(pw), MSG.pwWeak),
      check('password2', !!pw && pw === pw2, pw2 ? MSG.pw2Mismatch : MSG.pw2Empty),
      check('name', !!v('name').trim(), MSG.name),
      check('phone', !!v('phone').trim(), MSG.contact),
      check('dept', !!v('dept'), ''),
      check('rank', !!v('rank').trim(), ''),
    ];
    const bad = ['email', 'password', 'password2', 'name', 'phone', 'dept', 'rank'][r.indexOf(false)];
    if (bad) fields[bad].input.focus();
    return !bad;
  }
  $('#btn-prev-2').addEventListener('click', () => goStep(1, { push: true }));
  $('#signupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (document.body.dataset.step !== '2') { if (!next1.disabled) goStep(2, { push: true }); return; }
    if (!validate()) return;
    $('#done-name').textContent = fields.name.input.value.trim();
    $('#done-email').textContent = fields.email.input.value.trim();
    $('#done-dept').textContent = `${dept.value} · ${fields.rank.input.value.trim()}`;
    goStep(3, { push: true });
  });

  goStep(stepOf(), { focus: false });
}

/* 셸 없이 서는 화면이지만 준비 신호는 같은 이름으로 낸다(e2e 공용 대기 조건). */
requestAnimationFrame(() => { document.documentElement.dataset.shell = 'ready'; });
window.__auth = { ready: true, page, MSG };
