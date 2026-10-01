/* 계정 찾기 · 신청 — 가운데 창(키트 K17 kit/modal.js) 하나 · 탭 셋: 가입 신청 · 아이디 찾기 · 비밀번호 찾기 (구현 2차 T5).
   사용자 10-01: "로그인 창에서 계정 찾기·신청 하면 오른쪽이 뜨는데 그냥 창이 하나 중간에 뜨는 걸로... 가입 신청과 아이디 비밀번호 찾기 등 기능을 만들자"
   원칙 77(아이디 = 메일 주소) · 원칙 49(입력 최소) · 확인 대장 D4-ⓑ(가입 신청 + 승인).

   부르는 법 — Land-XI 로그인(LX 전용)과 기관 로그인이 같은 부품을 쓴다:
     import { openAccountHelp, openPasswordChange } from '/landxi/v3/login/account.js';
     openAccountHelp({ realm: 'lx', site: 'app' })              LX 직원 — 가입 신청 = LX 직원 신청 → LX 관리자 승인
     openAccountHelp({ realm: 'lx', site: 'admin' })            관리자 입구 — 가입 신청 대신 안내 한 줄(아이디·비밀번호 찾기는 그대로)
     openAccountHelp({ realm: 'tenant', site: 'gov', tenant: { id: 'namwon', name: '남원시' } })     그 기관 로그인(기관 하나 — 고르기 칸 없음)
     openAccountHelp({ realm: 'tenant', site: 'gov', tenants: [{ id, name }], tenant })              기관 고르기 칸(tenant = 미리 고른 기관)
       선택: tab 'signup' | 'find' | 'reset'(처음 열 탭) · onClose()
     로그인 답이 { must_change: true, change_token } 이면(관리자가 준 임시 비밀번호로 들어온 사람):
     openPasswordChange({ changeToken, name, onDone(session) }) 새 비밀번호를 정하면 로그인과 같은 답(토큰 · realm · role …)을 onDone 으로
   서버가 정본(server/landxi_api/accounts.py): 입력 검증 · 접속 주소마다 시도 제한 · 관할. 바깥 주소는 공개 관문이 알린 입구가 이긴다.
   스타일은 같은 폴더 account.css — 처음 열 때 스스로 붙인다. */
import { modal } from '../kit/modal.js';
import { h, api, API } from '../kit/util.js';

const CSS = new URL('./account.css', import.meta.url).href;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = '063-713-1218';
let seq = 0;

function sheet() {
  if (!document.querySelector('link[data-lx-account]')) document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-lx-account': '' }));
}

/* 서버 호출 — 앞선 느린 확인이 남긴 'off' 판정을 풀고 부른다. 연결 실패는 status 없음 */
async function call(path, body) {
  if (API.mode === 'off') API.mode = 'auto';
  return api(path, { method: 'POST', body });
}

/* 입력 칸 — 라벨 위 · 흰 입력 44 · 도움말 한 줄(선택) */
function field(key, label, { type = 'text', auto, hint, options, value } = {}) {
  const id = `ac-${key}-${++seq}`;
  let input;
  if (options) {
    input = h('select.t-input.ac-sel__i', { id, name: key }, h('option', { value: '', text: '기관 선택' }), ...options.map((o) => h('option', { value: o.id, text: o.name })));
    if (value) input.value = value;
  } else {
    input = h('input.t-input', { id, name: key, type, autocomplete: auto || 'off', spellcheck: 'false', autocapitalize: 'off', ...(value ? { value } : {}) });
  }
  const box = options ? h('div.ac-sel', {}, input, h('span.ac-sel__c', { 'aria-hidden': 'true', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="6 9 12 15 18 9"/></svg>' })) : input;
  const wrap = h('div.ac-f', { dataset: { f: key } }, h('label.ac-l', { for: id, text: label }), box, hint ? h('p.ac-hint', { text: hint }) : null);
  return { wrap, input };
}

/* 한 탭의 폼 — 칸들 + 오류 한 줄 + 1차 버튼. 오류는 서버가 짚은 칸(detail.field)에 빨간 테두리 */
function formOf(fields, button, onSubmit) {
  const msg = h('p.ac-msg', { role: 'alert', hidden: true });
  const go = h('button.t-btn.ac-go', { type: 'submit', text: button });
  const form = h('form.ac-form', { novalidate: true }, ...fields.map((f) => f.wrap), msg, go);
  const clear = () => { msg.hidden = true; msg.textContent = ''; form.querySelectorAll('.ac-f.bad').forEach((x) => x.classList.remove('bad')); };
  const say = (text, key) => {
    clear(); msg.textContent = text; msg.hidden = false;
    const f = key && form.querySelector(`.ac-f[data-f="${key}"]`);
    if (f) { f.classList.add('bad'); f.querySelector('input,select')?.focus(); }
  };
  form.addEventListener('input', clear);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (go.getAttribute('aria-busy')) return;
    go.setAttribute('aria-busy', 'true'); go.disabled = true;
    try { await onSubmit(say); }
    catch (err) {
      if (!err.status) say('서버에 연결할 수 없습니다. 잠시 뒤 다시 해 주세요.');
      else say(err.message || '잠시 뒤 다시 해 주세요.', err.detail?.field);
    } finally { go.removeAttribute('aria-busy'); go.disabled = false; }
  });
  return { form, say };
}

const val = (f) => f.input.value.trim();
const lead = (html) => h('p.ac-lead', { html });
function done(title, html, onClose) {
  const b = h('button.t-btn.ac-go', { type: 'button', text: '닫기', onclick: onClose });
  const el = h('div.ac-done', { role: 'status' }, h('p.ac-done__t', { text: title }), h('p.ac-done__s', { html }), b);
  setTimeout(() => b.focus(), 0);
  return el;
}
/* 개인정보 수집·이용 동의 — 한 칸 + 내용 보기(항목 · 목적 · 보관 · 거부 권리) */
function consent() {
  const id = `ac-consent-${++seq}`;
  const box = h('input.ac-ck', { id, type: 'checkbox', name: 'consent' });
  const wrap = h('div.ac-f.ac-agree', { dataset: { f: 'consent' } },
    h('label.ac-agree__l', { for: id }, box, h('span', { text: '개인정보 수집·이용에 동의합니다' })),
    h('details.ac-pv', {}, h('summary', { text: '내용 보기' }),
      h('dl', {},
        h('dt', { text: '수집 항목' }), h('dd', { text: '이름 · 메일 주소 · 소속' }),
        h('dt', { text: '목적' }), h('dd', { text: '계정 확인과 관리' }),
        h('dt', { text: '보관 기간' }), h('dd', { text: '계정을 지울 때까지 · 반려된 신청은 30일 뒤 지웁니다' }),
        h('dt', { text: '거부' }), h('dd', { text: '동의하지 않을 수 있으나, 그러면 가입 신청을 할 수 없습니다' }))));
  return { wrap, input: box };
}

/**
 * 계정 찾기 · 신청 창을 연다.
 * @param {{realm?: 'lx'|'tenant', site?: 'app'|'admin'|'gov', tenant?: {id: string, name: string}|null, tenants?: {id: string, name: string}[]|null, tab?: 'signup'|'find'|'reset', onClose?: Function}} o
 */
export function openAccountHelp({ realm = 'lx', site = realm === 'tenant' ? 'gov' : 'app', tenant = null, tenants = null, tab, onClose } = {}) {
  tab = tab || (site === 'admin' ? 'find' : 'signup');   // 관리자 입구는 가입 신청을 받지 않으니 아이디 찾기부터
  sheet();
  const GOV = realm === 'tenant';
  const pick = GOV && !(tenant && !tenants?.length) ? (tenants || []) : null;   // 기관 고르기 칸(목록을 받았을 때) · 기관 하나면 칸 없음
  const orgName = () => (GOV ? (pick ? pick.find((t) => t.id === pickVal())?.name : tenant?.name) || '기관' : 'LX');
  let pickers = [];
  const pickVal = () => (pick ? pickers.find((p) => p.input.value)?.input.value || '' : tenant?.id || '');
  const orgField = () => { const f = field('tenant_id', '기관', { options: pick, value: tenant?.id }); pickers.push(f); f.input.addEventListener('change', () => pickers.forEach((p) => { p.input.value = f.input.value; })); return f; };
  const tenantOf = (say) => { const id = pickVal(); if (GOV && !id) { say('기관을 고르세요', 'tenant_id'); return null; } return id; };

  let m = null;
  const closeAll = () => m?.close();

  /* ── 가입 신청 ── */
  const pSignup = h('div.ac-pane');
  if (site === 'admin') {
    pSignup.append(h('div.ac-note', {}, h('p', { html: 'LX 관리자 계정은<br>LX 관리자가 만듭니다.' })));
  } else {
    const fo = pick ? orgField() : null;
    const fn = field('name', '이름', { auto: 'name' });
    const fm = field('login', '메일 주소', { type: 'email', auto: 'username', hint: '로그인 아이디로 씁니다' });
    const fp = field('password', '비밀번호', { type: 'password', auto: 'new-password', hint: '10자 이상 · 영문과 숫자를 함께' });
    const fp2 = field('password2', '비밀번호 확인', { type: 'password', auto: 'new-password' });
    const fd = field('dept', GOV ? '부서' : '소속 부서', { auto: 'organization-title' });
    const fc = consent();
    const pw = h('div.ac-two', {}, fp.wrap, fp2.wrap);
    const nd = h('div.ac-two', {}, fn.wrap, fd.wrap);
    const who = GOV ? (pick ? '기관 관리자가' : `${tenant?.name || '기관'} 관리자가`) : 'LX 관리자가';
    const { form } = formOf([...(fo ? [fo] : []), { wrap: nd }, fm, { wrap: pw }, fc], '신청하기', async (say) => {
      const tid = tenantOf(say); if (GOV && !tid) return;
      if (!val(fn)) return say('이름을 적어 주세요', 'name');
      if (!MAIL.test(val(fm))) return say(val(fm) ? '메일 주소 형식을 확인하세요' : '메일 주소를 적어 주세요', 'login');
      if (fp.input.value.length < 10) return say('비밀번호는 10자 이상입니다', 'password');
      if (fp.input.value !== fp2.input.value) return say('두 비밀번호가 서로 다릅니다', 'password2');
      if (!val(fd)) return say('부서를 적어 주세요', 'dept');
      if (!fc.input.checked) return say('개인정보 수집·이용에 동의해야 신청할 수 있습니다', 'consent');
      const body = { site, name: val(fn), login: val(fm), password: fp.input.value, password2: fp2.input.value, dept: val(fd), consent: true, ...(GOV ? { tenant_id: tid } : {}) };
      await call('/accounts/signup', body);
      pSignup.replaceChildren(done('신청했습니다', '승인되면 로그인할 수 있습니다.', closeAll));
    });
    pSignup.append(lead(`${who} 확인하면<br>계정이 열립니다.`), form);
  }

  /* ── 아이디 찾기 ── */
  const pFind = h('div.ac-pane');
  {
    const fo = pick ? orgField() : null;
    const fn = field('name', '이름', { auto: 'name' });
    const out = h('div.ac-found', { role: 'status', hidden: true });
    const { form } = formOf([...(fo ? [fo] : []), fn], '아이디 찾기', async (say) => {
      const tid = tenantOf(say); if (GOV && !tid) return;
      if (!val(fn)) return say('이름을 적어 주세요', 'name');
      const j = await call('/accounts/find-id', { site, name: val(fn), ...(GOV ? { tenant_id: tid } : {}) });
      out.replaceChildren();
      if (!j.items?.length) out.append(h('p.ac-found__none', { text: '맞는 계정이 없습니다' }));
      else {
        out.append(h('p.ac-found__l', { text: j.items.length > 1 ? '맞는 계정' : '맞는 계정' }), h('ul', {}, ...j.items.map((x) => h('li', { text: x }))),
          h('button.t-btn.t-btn--text.ac-found__go', { type: 'button', text: '비밀번호 찾기', onclick: () => show('reset') }));
      }
      out.hidden = false;
    });
    pFind.append(lead(GOV && pick ? '기관과 이름으로<br>가입한 메일 주소를 찾습니다.' : '가입할 때 적은 이름으로<br>메일 주소를 찾습니다.'), form, out);
  }

  /* ── 비밀번호 찾기 ── */
  const pReset = h('div.ac-pane');
  {
    const fo = pick ? orgField() : null;
    const fm = field('login', '메일 주소', { type: 'email', auto: 'username' });
    const { form } = formOf([...(fo ? [fo] : []), fm], '재설정 요청', async (say) => {
      const tid = tenantOf(say); if (GOV && !tid) return;
      if (!val(fm)) return say('메일 주소를 적어 주세요', 'login');
      await call('/accounts/reset-request', { site, login: val(fm), ...(GOV ? { tenant_id: tid } : {}) });
      pReset.replaceChildren(done('요청했습니다', '관리자 확인 뒤 임시 비밀번호를 받습니다.<br>임시 비밀번호로 들어오면 새 비밀번호를 정합니다.', closeAll));
    });
    pReset.append(lead('관리자 확인 뒤<br>임시 비밀번호를 받습니다.'), form);
  }

  /* ── 탭 ── */
  const TABS = [['signup', '가입 신청', pSignup], ['find', '아이디 찾기', pFind], ['reset', '비밀번호 찾기', pReset]];
  const bar = h('div.ac-tabs', { role: 'tablist', 'aria-label': '계정 찾기 · 신청' });
  const btns = TABS.map(([k, label, pane], i) => {
    const tid = `ac-tab-${k}-${++seq}`, pid = `ac-pane-${k}-${seq}`;
    pane.id = pid; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', tid); pane.dataset.tab = k;
    const b = h('button.ac-tab', { id: tid, type: 'button', role: 'tab', 'aria-controls': pid, 'aria-selected': 'false', tabindex: '-1', dataset: { tab: k }, text: label });
    b.addEventListener('click', () => show(k, true));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); const j = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length; show(TABS[j][0], true); btns[j].focus();
    });
    bar.append(b);
    return b;
  });
  function show(k, user = false) {
    TABS.forEach(([key, , pane], i) => {
      const on = key === k;
      btns[i].setAttribute('aria-selected', String(on)); btns[i].tabIndex = on ? 0 : -1;
      pane.hidden = !on;
    });
    if (user) { const pane = TABS.find(([key]) => key === k)[2]; setTimeout(() => pane.querySelector('input:not([type=checkbox]),select,button')?.focus({ preventScroll: true }), 0); }
  }
  show(TABS.some(([k]) => k === tab) ? tab : 'signup');
  const foot = h('p.ac-foot', {}, h('span', { text: '문의' }), h('a', { href: 'tel:' + PHONE, text: PHONE }));
  const body = h('div.ac', { dataset: { realm, site } }, bar, pSignup, pFind, pReset, foot);
  m = modal({ title: '계정 찾기 · 신청', body, onClose });
  m.el.classList.add('ac-md');
  m.show = show;
  m.orgName = orgName;
  return m;
}

/**
 * 새 비밀번호 정하기 — 임시 비밀번호로 들어온 사람(로그인 답 must_change).
 * @param {{changeToken: string, name?: string, onDone: (session: object) => any, onClose?: Function}} o
 */
export function openPasswordChange({ changeToken, name, onDone, onClose } = {}) {
  sheet();
  const fp = field('password', '새 비밀번호', { type: 'password', auto: 'new-password', hint: '10자 이상 · 영문과 숫자를 함께' });
  const fp2 = field('password2', '새 비밀번호 확인', { type: 'password', auto: 'new-password' });
  let m = null;
  const { form } = formOf([fp, fp2], '바꾸고 들어가기', async (say) => {
    if (fp.input.value.length < 10) return say('비밀번호는 10자 이상입니다', 'password');
    if (fp.input.value !== fp2.input.value) return say('두 비밀번호가 서로 다릅니다', 'password2');
    const s = await call('/auth/password/change', { change_token: changeToken, password: fp.input.value, password2: fp2.input.value });
    m.close(true);
    await onDone?.(s);
  });
  const hi = name ? `${name}님, 임시 비밀번호로 들어왔습니다.` : '임시 비밀번호로 들어왔습니다.';
  const body = h('div.ac.ac--change', {}, lead(`${hi}<br>새 비밀번호를 정하면 바로 들어갑니다.`), form);
  m = modal({ title: '새 비밀번호 정하기', body, onClose });
  m.el.classList.add('ac-md');
  return m;
}
