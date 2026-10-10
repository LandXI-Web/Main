/* 기관 메인(구현 2차 T3 · GF-1 · GF-3 · 체계-2 ⓑ · 사용자 구현 확인 I-1 · I-4) — 로그인 전 첫 화면.
   · gov.land-xi.dev/{기관}/ : 그 기관 메인 — 마크 · 플랫폼 이름 · 기관색 · 소개 글 · 켜진 서비스(서버 GET /brand/{기관}) + 그 기관 모습의 로그인.
     기관은 주소로 정해지므로 기관 고르기가 없다. 서버 로그인 경로는 그대로(gov 입구 + tenant_id).
   · gov.land-xi.dev/ : 기관 고르기 목록(각 기관 메인으로 가는 카드) — 기관 이름 목록은 서버가 정본(GET /auth/tenants).
   · 이 PC · 사본: /landxi/v3/gov-home/?org={기관}
   틀(배치 · 메뉴 · 부품)은 모든 기관이 같다(원칙 48 · I-4). 기관색은 마크 · 머리의 약칭 · 1차 버튼 · 상태 칩에만.
   구현 5차(기관-2 ⓐ · 시안 design-r8/gov-design/mock/main.html): 그림판(일러스트) 대신 실제 결과 장면을 작게 — 로그인 전이므로 서버 설정 한 곳의
   저해상 크롭만(GET /brand/{기관}/main · config/gov-main.yaml · 원본 · 지도 타일 · 제한 영상 0). 머리 아래 업무 결과 셋(업무 결과 하나 · 서비스 수 · 최근 분석한 날 —
   서버 값 그대로). 배경 사진을 LX 관리자가 고르는 화면은 다음 설계(원칙 116).
   로그인 뒤 = 서비스 선택(kit/auth-gate.js LANDING) — ?next 가 그 사람이 들어갈 수 있는 같은 출처 화면이면 거기로. */
import { API, api, session } from '../../shared/api-v1.js';
import { h, enter } from '../kit/util.js';
import { empty } from '../kit/empty.js';
import { keyOf, landingFor, ALLOW, SITES, orgHome, orgUrl, orgOfHost } from '../kit/auth-gate.js';
import { loadBrand, applyBrand, markEl, statusLv, headlineHtml, favicon, joinLine } from '../gov-select/brand.js';
import { numHtml } from '../kit/bignum.js';

const main = document.getElementById('main');
const qs = new URLSearchParams(location.search);
const ORG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const LS = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch { return null; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 주소에서 기관 — 기관 주소({기관}.land-xi.dev · 자체 도메인) → ?org= → 이 PC 관문의 기관 경로(sites.js gov.org = '/{org}/') */
function orgHere() {
  const byHost = orgOfHost();
  if (byHost) return byHost;
  const q = qs.get('org');
  if (ORG_RE.test(q || '')) return q;
  const [pre, post] = SITES.gov.org.split('{org}');
  const p = location.pathname;
  if (!p.startsWith(pre)) return null;
  let id = p.slice(pre.length);
  if (post && id.endsWith(post)) id = id.slice(0, -post.length);
  return ORG_RE.test(id) && id !== 'landxi' ? id : null;
}
const ORG = orgHere();

/* ── 말(기관의 언어 — 해외 기관은 영어) ─────────────────────── */
const KO = {
  menu: '메뉴', svcNav: '서비스', how: '이용 방법', contact: '문의', login: '로그인', mine: '내 서비스',
  who: (s) => `${s} 직원 계정`, id: '아이디', idPh: '메일 주소', pw: '비밀번호',
  need: '아이디와 비밀번호를 입력하세요', fail: '아이디 또는 비밀번호가 맞지 않습니다', down: '서버에 연결할 수 없습니다 — 잠시 뒤 다시 시도하세요',
  ask: (c) => `계정 문의 ${c}`, help: '가입 신청 · 아이디 · 비밀번호 찾기', inT: '로그인되어 있습니다', go: '내 서비스로', out: '나가기',
  svc: (s) => `${s} AI 분석 서비스`, since: (y) => `${y}년부터`,
  status: (s) => s, steps: [
    ['로그인', '기관 관리자가 승인한 계정(메일 주소)으로 들어옵니다. 내가 맡은 서비스만 보입니다.'],
    ['결과 확인', '서비스를 열어 AI 분석 결과를 지도와 표로 봅니다. 필지마다 결과를 보여 줍니다.'],
    ['보고서 · 분석 요청', '결과로 보고서를 만들고, 우리 영상을 넣어 새 분석을 요청합니다. LX가 확인한 뒤 분석합니다.'],
  ],
  svcSub: '결과가 있는 서비스는 실제 결과 장면을, 아직 없는 서비스는 시작 시기를 보여 줍니다.', howSub: '세 단계면 됩니다. 어려운 설정은 없습니다.',
  first: '첫 결과 전', firstT: '영상이 들어오면 분석합니다', starts: (y) => `${y}년 시작`, startsT: (st) => (st === '내년' ? '내년 사업으로 준비합니다' : '사업이 시작되면 결과가 보입니다'),
  biz: (y) => `${y}년 사업`, latest: (d) => `최근 결과 ${d}`, nSvc: '서비스', since2: (y) => `${y}년부터 사업 순서대로`, lastAi: '최근 AI 분석 결과',
  phone: (c) => `대표전화 ${c}`, lx: 'AI 분석 · 모델 개발과 갱신 — LX 한국국토정보공사',
  none: '없는 기관 주소입니다', noneT: '기관 목록에서 우리 기관을 고르세요', pick: '기관 목록',
  pickH: '기관 선택', pickL: '우리 기관을 고르면 그 기관의 서비스 소개와 로그인으로 이어집니다.', pickEmpty: '열린 기관이 없습니다',
};
const EN = {
  ...KO, menu: 'Menu', svcNav: 'Services', how: 'How to use', contact: 'Contact', login: 'Sign in', mine: 'My services',
  who: (s) => `${s} staff account`, id: 'User ID', idPh: 'Email address', pw: 'Password',
  need: 'Enter your ID and password', fail: 'The ID or password is incorrect', down: 'Cannot reach the server — please try again shortly',
  ask: (c) => `Account help ${c}`, help: 'Sign up · find ID · reset password', inT: 'Signed in', go: 'Go to my services', out: 'Sign out',
  svc: (s) => `${s} AI analysis services`, since: (y) => `Since ${y}`,
  status: (s) => ({ 운영: 'In service', 시범: 'Pilot', '첫 결과 전': 'Before first result', 내년: 'Next year' }[s] || s),
  steps: [['Sign in', 'Sign in with the account your agency administrator approved. Only your services are shown.'],
    ['Check results', 'Open a service to see AI results on the map and in tables.'],
    ['Reports · analysis requests', 'Make reports from the results, or upload your imagery to request a new analysis. LX reviews it first.']],
  svcSub: 'Services with results show a real result scene; the others show when they start.', howSub: 'Three steps. No complex settings.',
  first: 'Before first result', firstT: 'Analysis starts when imagery arrives', starts: (y) => `Starts ${y}`, startsT: () => 'Prepared as an upcoming project',
  biz: (y) => `Since ${y}`, latest: (d) => `Latest ${d}`, nSvc: 'services', since2: (y) => `Since ${y}, in project order`, lastAi: 'Latest AI analysis',
  phone: (c) => `Tel. ${c}`, lx: 'AI analysis · model development and updates — LX Korea Land and Geospatial InformatiX Corporation',
  none: 'Unknown agency address', noneT: 'Choose your agency from the list', pick: 'Agency list',
};
let L = KO;

const nameOf = (b) => (b.locale === 'en' ? b.name?.en || b.name?.ko : b.name?.ko || b.name?.en) || b.platform;
const svcChip = (s) => h('span.t-chip', { text: L.status(s), dataset: statusLv(s) ? { lv: statusLv(s) } : {} });

/* ── 로그인 뒤 갈 곳 — ?next(같은 출처 v3 화면 · 그 사람이 들어갈 수 있는 곳만) → 그 기관 첫 화면(서비스 선택) ── */
const NEXT_OK = /^\/landxi\/v3\/([a-z-]+)\/(?:index\.html)?(?:\?[^\s#\\]*)?(?:#[^\s\\]*)?$/;
function nextOk(v, key) {
  const m = NEXT_OK.exec(v || ''); const path = String(v || '').split(/[?#]/)[0];
  if (!m || /\.\.|\/\/|%2e|%2f|%5c/i.test(path)) return null;
  const home = m[1];
  if (!Object.prototype.hasOwnProperty.call(ALLOW, home) || home === 'login' || home === 'gov-home') return null;
  const ok = ALLOW[home];
  return ok === null || (key && ok.includes(key)) ? v : null;
}
function destOf(s, b) {
  const key = keyOf({ realm: s.realm, role: s.role, tenant_id: s.tenant_id }, { scope: b.scope });
  const n = nextOk(qs.get('next'), key);
  const land = n || landingFor({ key }, 'gov');
  const home = /^\/landxi\/v3\/([a-z-]+)\//.exec(land)?.[1] || 'gov-select';
  return new URL(`../${home}/${n ? land.slice(land.indexOf(home + '/') + home.length + 1) : ''}`, import.meta.url).href;   // 상대경로(사본 /Main/ 아래에서도)
}

/* ═════════════ 기관 메인 ═════════════ */
async function renderOrg(id) {
  let b;
  try { b = await loadBrand(id); }
  catch (e) { return e.status === 404 ? renderMissing() : renderDown(() => renderOrg(id)); }
  L = b.locale === 'en' ? EN : KO;
  document.documentElement.lang = b.locale === 'en' ? 'en' : 'ko';
  document.documentElement.dataset.org = b.tenant;
  applyBrand(document.documentElement, b); favicon(b);
  document.title = b.platform;
  const svcs = b.services || [];
  const mainP = api(`/brand/${encodeURIComponent(b.tenant)}/main`).catch(() => null);   // 그림 · 업무 결과 셋(로그인 없이)

  /* 이미 이 기관으로 들어와 있으면 '내 서비스로' */
  const s0 = session.get();
  const mineS = s0 && s0.realm === 'tenant' && s0.tenant_id === b.tenant ? s0 : null;
  const dest = mineS ? destOf(mineS, b) : null;

  const topBtn = mineS ? h('a.t-btn.gh-top-b', { href: dest, text: L.mine }) : h('a.t-btn.gh-top-b', { href: '#login', text: L.login });
  const top = h('header.gh-top', {}, h('div.gh-in', {},
    h('a.gh-brand', { href: '#main', 'aria-label': b.platform }, markEl(b, { size: 'lg' }), h('span.gh-plat', { text: b.platform })),
    h('nav.gh-nav', { 'aria-label': L.menu }, h('a', { href: '#svc', text: L.svcNav }), h('a', { href: '#how', text: L.how }), h('a', { href: '#contact', text: L.contact })),
    h('span.sp'), topBtn));

  /* 로그인 카드 — 아이디(메일 주소) · 비밀번호. 기관은 주소가 정한다 */
  const card = h('div.gh-login', { id: 'login' });
  if (mineS) paintSignedIn(card, b, mineS, dest); else paintLogin(card, b);
  const side = h('div.gh-side', {}, card);

  /* 그림 · 업무 결과 셋 — 서버 설정 한 곳(저해상 크롭만 · 제한 영상 0) · 숫자는 서버 값 그대로(없으면 그 칸을 비운다 · 지어내지 않는다) */
  const M = await mainP;
  const F = M?.facts || null;
  const ymd = (d) => String(d || '').slice(0, 10).replace(/-/g, '.');
  const fact = (big, lab) => h('div.gh-fact', {}, h('b', { html: big }), h('span', { text: lab }));
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const facts = F ? h('div.gh-facts', {},
    F.result?.env ? fact(numHtml(F.result.env), `${F.result.label} · ${F.result.service}`) : null,
    F.services?.value ? fact(`${esc(F.services.value)}<small>${esc(L.nSvc)}</small>`, F.since ? L.since2(F.since) : '') : null,
    F.latest ? fact(`<span class="num">${esc(ymd(F.latest))}</span>`, L.lastAi) : null) : null;

  const hero = h('section.gh-hero', { 'aria-label': b.platform, class: M?.background?.src ? 'has-bg' : '' },
    M?.background?.src ? h('div.gh-bg', { 'aria-hidden': 'true' }, h('img', { src: (M.background.api ? API.prefix : '') + M.background.src, alt: '', decoding: 'async' })) : null,   // api = LX 관리자가 고른 사진(기관-12 ⓐ)
    h('div.gh-in.gh-hero-in', {},
      h('div.gh-copy', {},
        h('p.gh-org', { text: nameOf(b) }),
        h('h1.gh-h1', { html: headlineHtml(b) }),
        (b.intro?.lines || []).length ? h('p.gh-lead', {}, ...b.intro.lines.map((l) => h('span', { text: l }))) : null,
        facts && facts.childElementCount ? facts : null),
      side));

  /* 서비스 카드 — 결과가 있는 서비스는 실제 결과 장면(작게), 없는 서비스는 시작 시기만(그림 없음) */
  const svcCard = (s) => {
    const pic = s.open ? M?.scenes?.[s.card] : null;
    const lv = statusLv(s.status);
    const chip = h('span.t-chip.gh-chip', { text: L.status(s.status), dataset: lv ? { lv } : { lv: 'on' } });
    const crop = pic ? h('div.gh-crop', {}, h('img', { src: pic.src, alt: '', loading: 'lazy', decoding: 'async' }), chip)
      : h('div.gh-crop.is-blank', {}, h('b', { text: s.open ? L.first : L.starts(s.year || '') }), h('span', { text: s.open ? L.firstT : L.startsT(s.status) }), chip);
    const hit = F?.result && F.result.card === s.card ? F.result : null;
    return h('article.gh-svc.t-enter', { dataset: { card: s.card, status: s.status } },
      crop,
      h('div.gh-svc-b', {},
        h('div.gh-meta', {}, h('span', { text: s.year ? L.biz(s.year) : '' }), h('span', { text: hit && F.latest ? L.latest(ymd(F.latest)) : L.status(s.status) })),
        h('h3', { text: s.name }),
        s.line ? h('p.gh-d', { text: joinLine(s.line) }) : null,
        hit ? h('p.gh-res', { html: `${numHtml(hit.env)}<span>${esc(hit.label)} · ${esc(b.short)}</span>` }) : null));
  };
  const svc = h('section.gh-sec.gh-sec--svc', { id: 'svc' }, h('div.gh-in', {},
    h('h2.gh-h2.t-enter', { text: L.svc(b.short) }),
    h('p.gh-sub', { text: L.svcSub }),
    h('div.gh-grid', { dataset: { n: String(svcs.length) } }, ...svcs.map(svcCard))));

  const how = h('section.gh-sec', { id: 'how' }, h('div.gh-in', {},
    h('h2.gh-h2.t-enter', { text: L.how }),
    h('p.gh-sub', { text: L.howSub }),
    h('ol.gh-how', {}, ...L.steps.map(([t, d], i) => h('li.gh-step.t-enter', {}, h('span.n', { text: String(i + 1) }), h('h3', { text: t }), h('p', { text: d }))))));

  const foot = h('footer.gh-foot', { id: 'contact' }, h('div.gh-in', {},
    h('b', { text: nameOf(b) }), b.contact ? h('span', { text: L.phone(b.contact) }) : null, h('span.sp'), h('span', { text: L.lx })));

  document.body.prepend(top);
  main.replaceChildren(hero, svc, how);
  main.after(foot);
  main.removeAttribute('aria-busy');
  document.body.dataset.state = 'ready';
  topBtn.addEventListener('click', (e) => { if (topBtn.getAttribute('href') === '#login') { e.preventDefault(); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.querySelector('input')?.focus({ preventScroll: true }); } });
  enter(document);
  window.__govHome = { ready: true, org: b.tenant, brand: b };
}

function paintSignedIn(card, b, s, dest) {
  const nm = s.user?.name || '';
  const out = h('button.t-btn.t-btn--2', { type: 'button', text: L.out });
  card.replaceChildren(
    h('div.gh-login-h', {}, h('h2', { text: L.inT }), nm ? h('span.t-label', { text: nm }) : null),
    h('div.gh-login-acts', {}, h('a.t-btn', { href: dest, text: L.go }), out));
  out.addEventListener('click', async () => {
    try { await fetch(API.prefix + '/auth/logout', { method: 'POST', headers: { authorization: 'Bearer ' + s.token } }); } catch { /* 만료여도 지운다 */ }
    session.clear(); paintLogin(card, b);
  });
}

function paintLogin(card, b) {
  const idIn = h('input.t-input', { name: 'login', type: 'text', autocomplete: 'username', placeholder: L.idPh, spellcheck: 'false', autocapitalize: 'none', required: true });
  const pwIn = h('input.t-input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('p.gh-msg', { role: 'alert', hidden: true });
  const go = h('button.t-btn.gh-go', { type: 'submit', text: L.login });
  const help = h('button.t-btn.t-btn--text.gh-help', { type: 'button', text: L.help });
  const form = h('form.gh-form', { novalidate: true, 'aria-label': L.login },
    h('div.gh-login-h', {}, h('h2', { text: L.login }), h('span.t-label', { text: L.who(b.short) })),
    h('label.gh-f', {}, h('span.t-label', { text: L.id }), idIn),
    h('label.gh-f', {}, h('span.t-label', { text: L.pw }), pwIn),
    msg, go, help,
    b.contact ? h('p.gh-login-f', { text: L.ask(b.contact) }) : null);
  card.replaceChildren(form);
  /* 가입 신청 · 아이디/비밀번호 찾기 — Land-XI 로그인과 같은 부품(구현 2차 T5 · login/account.js) · 기관은 이 주소의 기관 하나 */
  help.addEventListener('click', async () => {
    try { const m = await import('../login/account.js'); m.openAccountHelp({ realm: 'tenant', site: 'gov', tenant: { id: b.tenant, name: b.short } }); }
    catch { say(L.down); }
  });
  /* 들어가기 — 세션을 두고 그 기관 첫 화면(서비스 선택)으로 */
  const finish = (j) => {
    session.set({ token: j.token, realm: j.realm, role: j.role, tenant_id: j.tenant_id, expires_at: j.expires_at, user: j.user, site: 'gov' });
    LS('lx_login_org', b.tenant);
    window.__govHome.last = { realm: j.realm, role: j.role, tenant_id: j.tenant_id };
    location.assign(destOf(j, b));
  };
  const say = (t, bad = []) => { msg.textContent = t; msg.hidden = false; idIn.classList.toggle('is-bad', bad.includes('id')); pwIn.classList.toggle('is-bad', bad.includes('pw')); };
  const clear = () => { msg.hidden = true; idIn.classList.remove('is-bad'); pwIn.classList.remove('is-bad'); };
  idIn.addEventListener('input', clear); pwIn.addEventListener('input', clear);
  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const login = idIn.value.trim(), password = pwIn.value;
    if (!login || !password) { say(L.need, [!login && 'id', !password && 'pw'].filter(Boolean)); (login ? pwIn : idIn).focus(); return; }
    busy = true; go.setAttribute('aria-busy', 'true'); go.disabled = true; clear();
    try {
      let r = null, j = null;
      for (let i = 0; i < 2 && !r; i++) {   // 응답이 아예 없을 때(서버 다시 시작 중)만 한 번 더
        try { r = await fetch(API.prefix + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ site: 'gov', realm: 'tenant', tenant_id: b.tenant, login, password }) }); }
        catch { if (i === 0) await wait(700); }
      }
      if (!r) { say(L.down); return; }
      j = await r.json().catch(() => null);
      if (r.ok && j?.must_change && j.change_token) {   // 관리자가 준 임시 비밀번호 — 새 비밀번호를 정하면 바로 들어간다(T5 부품)
        const m = await import('../login/account.js');
        m.openPasswordChange({ changeToken: j.change_token, name: j.user?.name, onDone: (s2) => finish(s2), onClose: () => pwIn.focus() });
        return;
      }
      if (!r.ok || !j?.token) { say(j?.error?.message || L.fail, r.status === 401 ? ['pw'] : []); pwIn.value = ''; pwIn.focus(); return; }
      finish(j);
    } finally { busy = false; go.removeAttribute('aria-busy'); go.disabled = false; }
  });
}

/* ═════════════ 기관 고르기(gov 입구 첫 주소) ═════════════ */
async function renderPick() {
  document.title = '기관 선택';
  const top = h('header.gh-top', {}, h('div.gh-in', {},
    h('span.gh-brand.gh-brand--lx', {}, h('span.gh-word', { text: 'LAND-XI' }), h('span.gh-home', { text: '기관' }))));
  document.body.prepend(top);
  const box = h('div'), ld = h('div');
  box.append(ld); main.replaceChildren(h('section.gh-pick', {}, h('div.gh-in', {}, box)));
  empty(ld, { kind: 'loading', compact: true });
  let items = [];
  try { items = (await api('/auth/tenants')).items || []; }
  catch { return renderDown(() => location.reload()); }
  const brands = await Promise.all(items.map((t) => loadBrand(t.id).catch(() => null)));
  const cards = items.map((t, i) => {
    const b = brands[i]; if (!b) return null;
    const a = h('a.gh-orgc.t-enter', { href: orgUrl(t.id), dataset: { org: t.id } },
      h('span.gh-orgc-m', {}, markEl(b, { size: 'xl' })),
      h('span.gh-orgc-b', {}, h('span.gh-orgc-t', { text: b.platform.replace(/-/g, '‑') }), nameOf(b) !== b.platform ? h('span.t-label', { text: nameOf(b) }) : null),
      h('span.gh-orgc-go', { 'aria-hidden': 'true', text: '→' }));
    applyBrand(a, b);
    return a;
  }).filter(Boolean);
  box.replaceChildren(
    h('h1.gh-h1.gh-pick-h', { text: KO.pickH }),
    h('p.gh-lead', { text: KO.pickL }),
    cards.length ? h('div.gh-orgs', {}, ...cards) : h('p.gh-lead', { text: KO.pickEmpty }));
  const foot = h('footer.gh-foot', {}, h('div.gh-in', {}, h('span.sp'), h('span', { text: KO.lx })));
  main.after(foot);
  main.removeAttribute('aria-busy');
  document.body.dataset.state = 'ready';
  enter(document);
  window.__govHome = { ready: true, org: null, orgs: items.map((t) => t.id) };
}

function renderMissing() {
  const box = h('div');
  main.replaceChildren(h('section.gh-pick', {}, h('div.gh-in', {}, box)));
  empty(box, { kind: 'first', title: L.none, text: L.noneT, action: { label: L.pick, href: orgHome(null) } });
  main.removeAttribute('aria-busy'); document.body.dataset.state = 'missing';
  window.__govHome = { ready: true, org: null, missing: true };
}
function renderDown(retry) {
  const box = h('div');
  main.replaceChildren(h('section.gh-pick', {}, h('div.gh-in', {}, box)));
  empty(box, { kind: 'error', title: L.down, onRetry: retry });
  main.removeAttribute('aria-busy'); document.body.dataset.state = 'down';
  window.__govHome = { ready: true, down: true };
}

window.__govHome = { ready: false };
if (ORG) renderOrg(ORG); else renderPick();
