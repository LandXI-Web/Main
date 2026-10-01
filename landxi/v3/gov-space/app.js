/* gov-space — [기관 분기] 우리 공간(구현 3차 · 확인 대장 13차 분기-2 확인 · 분기-3 ⓒ 1단 · 8차 API-형식 ⓐ · 원칙 38 · 39 · 59 · 100).
   LX가 보내 준 1차 서비스(받은 서비스)마다 '결과 설명서' 한 장 — 여섯 칸(무엇이 · 어디 · 언제 · 어떤 형식 · 믿을 만한 정도 · 버전).
   설명서는 사람이 쓰지 않는다: 1차 서비스를 공개할 때(새 회차 · 새 서비스 버전) 서버가 저절로 새 판을 만들고, 공간 안 알림 한 줄(바뀐 점)을 남긴다.
   내려받기 세 가지(지도 파일 · 필지 엑셀 · 요약) — 우리 기관 관할 안 결과만(서버가 자른다) · 처음 한 번 이용 약속 동의(원칙 59) · 누가 언제 받았는지 기록.
   기관 관리자 = 받은 서비스 전부 + 부서 사용자가 볼 서비스 정하기 + 내려받은 기록 · 부서 사용자 = 정해 준 서비스만(원칙 38).
   2단(상자 · 2차 서비스 올리기 · 자원)은 화면에 자리를 만들지 않는다. 숫자는 서버 값 그대로 · 지역 고정값 없음(로그인 기관에서). */
import * as K from '../kit/index.js';
import { api, h } from '../kit/util.js';
import { modal } from '../kit/modal.js';
import { loadBrand, applyBrand } from '../gov-select/brand.js';
import { govRail } from '../gov-select/menu.js';

const who = await K.gate('gov-space');
if (who.me?.realm !== 'tenant') { location.replace(who.landing || K.FRONT); await new Promise(() => {}); }
const tid = who.me.tenant_id;
const isMgr = who.me.role === 'manager';
const qs = new URLSearchParams(location.search);

let brand = null;
try { brand = await loadBrand(tid); } catch { /* 기관색 없이 법전 값 */ }
if (brand) {
  applyBrand(document.documentElement, brand);
  const a = brand.color?.accent;
  if (a) { const rgb = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(','); document.body.style.setProperty('--accent', a); document.body.style.setProperty('--tint', `rgba(${rgb},.14)`); }
}
const rail = who.key === 'tenant/local' ? govRail({ who, current: 'space' }) : null;
const S = K.shell({ who, home: 'gov-space', title: brand?.platform || who.org, rail });
K.devDrawer({ who });

const scroll = h('div.sp-scroll'), page = h('div.sp-page');
scroll.append(page); S.main.append(scroll);
document.title = `우리 공간 · ${brand?.platform || who.org || ''}`.replace(/ · $/, '');

/* ── 작은 도구 ───────────────────────── */
const nf = (v) => Number(v).toLocaleString('ko-KR');
const val = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };
const md = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${Number(m[1])}.${Number(m[2])}` : ''; };
const num = (e) => { const v = val(e); return v === null || v === undefined ? '' : `${nf(v)}${e?.unit && !['count', 'ratio', 'm2'].includes(e.unit) ? e.unit : ''}`; };
/** ' · ' 앞에서 줄이 바뀌어 줄 머리에 가운뎃점이 오지 않게(법전 §2-1) */
const keep = (s) => String(s || '').replace(/ · /g, ' · ').replace(/ → /g, ' → ');
/** 바뀐 점처럼 ' · ' 로 이은 글 — 한 마디씩 묶어 마디 가운데서 줄이 바뀌지 않게(마디가 줄보다 길 때만 그 안에서) */
const segs = (s) => { const parts = String(s || '').split(' · ').filter(Boolean); const out = h('span.sp-segs'); parts.forEach((x, i) => { out.append(h('span.sp-seg', { text: x.replace(/ → /g, ' → ') })); if (i < parts.length - 1) out.append(' · '); }); return out; };
const dl = (rows) => h('dl.sp-dl', {}, ...rows.filter((r) => r && r[1]).map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v instanceof Node ? v : keep(v)))));

/* ── 머리 ───────────────────────── */
const head = h('header.sp-head', {}, h('div.sp-head-t', {}, h('h1', { text: '우리 공간' }),
  h('p.sp-sub', { text: 'LX가 보내 준 AI 분석 결과를 확인하고 내려받습니다' })));
const bar = h('div.sp-new'); bar.hidden = true;
const tabs = h('nav.sp-svc', { role: 'tablist', 'aria-label': '받은 서비스' });
const body = h('div.sp-grid');
page.append(head, bar, tabs, body);
/** 기다림 · 문제 표시는 판 안의 따로 둔 칸에(판 자체에 빈 상태 꾸밈이 남지 않게) */
function hold(el, o) { const x = h('div.sp-hold'); el.replaceChildren(x); K.empty(x, o); return x; }
hold(body, { kind: 'loading' });

let ME = null, CUR = null, GUIDE = null;
try { ME = await api('/spaces/me'); } catch (e) { hold(body, { kind: 'error' }); throw e; }

const svcs = ME.services || [];
if (!svcs.length) {
  body.replaceChildren();
  tabs.hidden = true;
  const box = h('div.sp-empty');
  K.empty(box, isMgr ? { kind: 'first', title: '아직 받은 서비스가 없습니다', text: 'LX가 서비스를 열면 여기에 결과 설명서가 생깁니다' }
    : { kind: 'first', title: '아직 맡은 서비스가 없습니다', text: '기관 관리자가 볼 서비스를 정해 줍니다' });
  body.append(box);
} else {
  const want = qs.get('card');
  const first = svcs.find((s) => s.card === want) || svcs.find((s) => ['운영', '시범'].includes(s.status)) || svcs[0];
  drawTabs(first.card);
  drawNew();
  await openSvc(first.card);
}
/* 알림을 봤다 — 다음에 열 때 '새' 표시가 꺼진다(이번 화면은 그대로 보인다) */
if (val(ME.unread)) api('/spaces/me/read', { method: 'POST' }).catch(() => {});

/* ── 받은 서비스 고르기 ───────────────────────── */
function drawTabs(card) {
  tabs.replaceChildren(...svcs.map((s) => {
    const b = h('button.sp-tab', { type: 'button', role: 'tab', 'aria-selected': String(s.card === card), dataset: { card: s.card } },
      h('span', { text: s.name }), s.new ? h('i.sp-dot', { 'aria-label': '새 판' }) : null);
    b.addEventListener('click', () => openSvc(s.card));
    return b;
  }));
}

/* ── 새 판 알림(읽지 않은 것이 있을 때만 한 줄) ───────────────────────── */
function drawNew() {
  const n = (ME.notices || []).find((x) => x.unread);
  if (!n) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.replaceChildren(h('b', { text: '새 결과 설명서' }),
    h('span', {}, h('em', { text: n.name }), ` ${val(n.edition) ? val(n.edition) + '판' : ''}${n.change ? ' — ' : ''}`, segs(n.change || '')),
    h('button.t-btn.t-btn--2.sp-new-go', { type: 'button', text: '보기', onclick: () => openSvc(n.card) }));
}

async function openSvc(card) {
  CUR = card;
  for (const b of tabs.querySelectorAll('.sp-tab')) b.setAttribute('aria-selected', String(b.dataset.card === card));
  history.replaceState(null, '', '?' + new URLSearchParams({ card }));
  hold(body, { kind: 'loading' });
  try { GUIDE = await api('/spaces/me/guides/' + encodeURIComponent(card)); } catch (e) {
    hold(body, { kind: 'error', onRetry: () => openSvc(card) }); return;
  }
  if (CUR !== card) return;
  render(GUIDE);
}

/* ── 결과 설명서 ───────────────────────── */
function render(g) {
  const b = g.body || {};
  const main = h('section.sp-main', { 'aria-label': '결과 설명서' });
  const side = h('aside.sp-side');
  const rounds = b.when?.rounds || [];
  const pub = g.published_at ? `${ymd(g.published_at)} 공개` : '';
  const gh = h('div.sp-gh', {},
    h('div.sp-gh-t', {}, h('h2', {}, `결과 설명서 `, h('span.num', { text: `${val(g.edition)}판` })),
      h('p.sp-gh-s', { text: [g.name, pub].filter(Boolean).join(' · ') })),
    isMgr ? h('button.t-btn.t-btn--2', { type: 'button', text: '부서 배정', onclick: () => assign(g) }) : null);
  const change = g.change ? h('p.sp-change', {}, h('b', { text: '바뀐 점' }), segs(g.change)) : null;
  const line = b.service?.line ? h('p.sp-line', { text: keep(b.service.line) }) : null;

  const cells = h('div.sp-cells');
  cells.append(
    cell('무엇이', what(b)), cell('어디', where(b)), cell('언제', when(rounds)),
    cell('어떤 형식', format(b)), cell('믿을 만한 정도', trust(b)), cell('버전', version(g, b)));
  main.append(gh, change, line, cells);
  side.append(downloads(g, b), notices());
  body.replaceChildren(main, side);
}

function cell(title, content) {
  return h('section.sp-cell', { 'aria-label': title }, h('h3', { text: title }), content);
}

function what(b) {
  const cls = b.what?.classes || [];
  const tot = b.what?.total;
  const wrap = h('div');
  if (val(tot) !== null && val(tot) !== undefined) wrap.append(h('p.sp-big', {}, h('span.num', { text: nf(val(tot)) }), h('small', { text: (tot.unit && tot.unit !== 'count' ? tot.unit : '건') })),
    h('p.sp-note', { text: '우리 기관 관할 안 결과' }));
  else wrap.append(h('p.sp-none', { text: '결과가 나오면 종류와 개수가 붙습니다' }));
  if (cls.length) {
    wrap.append(h('ul.sp-chips', {}, ...cls.map((c) => h('li', {}, h('span', { text: c.name }), val(c.n) !== null && val(c.n) !== undefined ? h('b.num', { text: num(c.n) }) : null))));
  }
  return wrap;
}

function where(b) {
  const w = b.where || {};
  const out = val(w.outside_emd);
  return dl([
    ['시군구', (w.places || []).join(' · ') || (w.shape ? '' : '결과가 나오면 붙습니다')],
    ['모양', w.shape],
    ['읍면동', (w.emd || out) ? segs([w.emd, out ? `바다 등 읍면동 밖 ${nf(out)}건` : ''].filter(Boolean).join(' · ')) : ''],
    ['필지', w.parcel || (w.shape ? '필지와 잇지 않습니다' : '')],
    ['좌표', w.crs],
  ]);
}

function when(rounds) {
  if (!rounds.length) return h('p.sp-none', { text: '첫 결과 전 — 결과가 나오면 회차가 붙습니다' });
  return h('div.sp-rounds', {}, ...rounds.map((r) => dl([
    rounds.length > 1 ? ['지역', r.place] : null,
    ['촬영', r.shot], ['분석', ymd(r.analyzed)], ['공개', r.published ? ymd(r.published) : '기록 없음'],
  ])));
}

function format(b) {
  const f = b.format || {};
  const t = h('table.sp-fields', {}, h('thead', {}, h('tr', {}, h('th', { text: '칸' }), h('th', { text: '단위' }), h('th', { text: '예' }))),
    h('tbody', {}, ...(f.fields || []).map((x) => h('tr', {}, h('td', { text: x.name }), h('td', { text: x.unit || '—' }), h('td', { text: keep(x.ex || '—') })))));
  const kinds = (f.files || []).map((x) => x.label).join(' · ');
  return h('div', {}, h('p.sp-note', { text: `받는 파일: ${kinds}` }), t);
}

function trust(b) {
  const t = b.trust || {};
  if (!t.level) return h('p.sp-none', { text: t.line || '결과가 나오면 붙습니다' });
  const checks = Object.entries(t.checks || {}).filter(([, e]) => val(e)).map(([k, e]) => `${k} ${nf(val(e))}건`);
  const [l1, l2] = String(t.line || '').split(' — ');   // 뜻 한 줄 · 덧붙임 한 줄(의미 단위로 끊는다)
  return h('div', {}, h('p.sp-level', { dataset: { lv: t.level } }, h('b', { text: t.level }), h('span', { text: l1 }), l2 ? h('span.sp-level-2', { text: l2 }) : null),
    checks.length ? dl([['결과 확인', checks.join(' · ')]]) : null,
    h('p.sp-note', { text: keep(t.note || '') }));
}

function version(g, b) {
  const hist = g.history || [];
  const list = h('ol.sp-hist', {}, ...hist.slice(0, 4).map((x) => h('li', { class: x.current ? 'is-cur' : '' },
    h('span.sp-hist-n.num', { text: `${val(x.edition)}판` }),
    h('span.sp-hist-t', {}, segs(x.change || ''),
      h('small', { text: [x.published_at ? `${ymd(x.published_at)} 공개` : '', x.current ? '지금 판' : ''].filter(Boolean).join(' · ') })))));
  return h('div', {}, dl([['서비스 버전', (b.version?.service || []).join(' · ')], ['결과 설명서', `${val(g.edition)}판`]]), hist.length > 1 ? list : null);
}

/* ── 내려받기 ───────────────────────── */
function downloads(g, b) {
  const files = b.format?.files || [];
  const sec = h('section.sp-box.sp-down', { 'aria-label': '내려받기' }, h('h3', { text: '내려받기' }),
    h('p.sp-note', { text: '우리 기관 관할 안 결과만 들어 있습니다' }));
  for (const f of files) {
    const btn = h('button.t-btn' + (f.fmt === 'geojson' ? '' : '.t-btn--2'), { type: 'button', text: '내려받기', dataset: { fmt: f.fmt }, disabled: !f.ok });
    btn.addEventListener('click', () => download(g, f, btn));
    sec.append(h('div.sp-file', { class: f.ok ? '' : 'is-off' },
      h('div.sp-file-t', {}, h('b', { text: f.label }), h('span.t-chip', { text: f.kind }),
        h('small', { text: f.ok ? f.use : (f.why || '받을 수 없습니다') })), btn));
  }
  sec.append(h('p.sp-note.sp-consent', { text: ME.consent?.done ? '이용 약속에 동의했습니다 · 내려받은 기록이 남습니다' : '처음 내려받을 때 이용 약속에 한 번 동의합니다' }));
  if (isMgr) sec.append(h('button.t-btn.t-btn--text.sp-log-b', { type: 'button', text: '내려받은 기록', onclick: downloadLog }));
  return sec;
}

function consent() {
  return new Promise((resolve) => {
    let ok = false;
    /* 서버 글의 줄바꿈 기호 = 의미 단위로 끊는 자리(법전 §2-1) */
    const lines = h('ul.sp-cons', {}, ...(ME.consent?.lines || []).map((s) => h('li', {}, ...String(s).split('\n').flatMap((x, i) => (i ? [h('br'), x] : [x])))));
    const go = h('button.t-btn', { type: 'button', text: '동의하고 내려받기' });
    const no = h('button.t-btn.t-btn--2', { type: 'button', text: '닫기' });
    const m = modal({ title: '내려받기 전에 확인해 주세요', body: h('div.sp-md', {}, lines, h('div.sp-md-a', {}, no, go)), onClose: () => resolve(ok) });
    no.addEventListener('click', () => m.close());
    go.addEventListener('click', async () => {
      go.disabled = true;
      try { await api('/spaces/me/consent', { method: 'POST', body: { agree: true } }); ME.consent.done = true; ok = true; m.close(); }
      catch (e) { go.disabled = false; K.toast(e.message || '지금은 저장할 수 없습니다'); }
    });
  });
}

async function download(g, f, btn) {
  if (!f.ok) return;
  if (!ME.consent?.done && !(await consent())) return;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = '받는 중';
  try {
    const r = await api(`/spaces/me/guides/${encodeURIComponent(g.card)}/download?fmt=${f.fmt}`, { raw: true });
    if (r.status === 409) { ME.consent.done = false; if (await consent()) return download(g, f, btn); return; }
    if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error?.message || '내려받지 못했습니다'); }
    const blob = await r.blob();
    const ext = { geojson: 'geojson', parcels: 'xlsx', summary: 'json' }[f.fmt];
    const org = (ME.org?.short || '').replace(/\s+/g, '');
    const name = `${org}_${g.name.replace(/\s+/g, '')}_결과설명서${val(g.edition)}판.${ext}`;
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    K.toast(`${f.label}을 내려받았습니다`);
    const c = document.querySelector('.sp-consent'); if (c) c.textContent = '이용 약속에 동의했습니다 · 내려받은 기록이 남습니다';
  } catch (e) { K.toast(e.message || '내려받지 못했습니다'); }
  finally { btn.disabled = false; btn.textContent = label; }
}

async function downloadLog() {
  const m = modal({ title: '내려받은 기록', body: h('div.sp-md') });
  K.empty(m.body.firstChild, { kind: 'loading', compact: true });
  try {
    const j = await api('/spaces/me/downloads');
    const items = j.items || [];
    m.set(items.length ? h('ol.sp-logs', {}, ...items.map((x) => h('li', {}, h('span', { text: keep(x.line) }), h('small.num', { text: `${ymd(x.at)} ${String(x.at || '').slice(11, 16)}` }))))
      : h('p.sp-none', { text: '아직 내려받은 기록이 없습니다' }));
  } catch { m.set(h('p.sp-none', { text: '지금은 기록을 열 수 없습니다' })); }
}

/* ── 공간 안 알림(새 판) ───────────────────────── */
function notices() {
  const list = (ME.notices || []).slice(0, 6);
  const sec = h('section.sp-box.sp-notes', { 'aria-label': '공간 안 알림' }, h('h3', { text: '알림' }));
  if (!list.length) { sec.append(h('p.sp-none', { text: '아직 알림이 없습니다' })); return sec; }
  sec.append(h('ul.sp-note-l', {}, ...list.map((n) => h('li', { class: n.unread ? 'is-new' : '' },
    h('button', { type: 'button', onclick: () => openSvc(n.card) },
      h('span.sp-note-h', {}, h('b', { text: n.name }), h('span.num', { text: val(n.edition) ? ` ${val(n.edition)}판` : '' })),
      h('span.sp-note-c', {}, segs(n.change || '')),
      h('small', { text: md(n.at) }))))));
  return sec;
}

/* ── 부서 배정(기관 관리자 — 부서 사용자는 정해 준 서비스만 본다) ───────────────────────── */
async function assign(g) {
  const m = modal({ title: `${g.name} — 볼 부서 사용자`, body: h('div.sp-md') });
  K.empty(m.body.firstChild, { kind: 'loading', compact: true });
  let j;
  try { j = await api('/spaces/me/assign'); } catch { m.set(h('p.sp-none', { text: '지금은 열 수 없습니다' })); return; }
  const users = j.users || [];
  if (!users.length) {
    m.set(h('div.sp-md', {}, h('p.sp-none', { text: '부서 사용자 계정이 아직 없습니다' }),
      h('p.sp-note', { text: '계정 화면에서 가입 신청을 승인하면 여기서 볼 서비스를 정할 수 있습니다' }),
      h('div.sp-md-a', {}, h('a.t-btn.t-btn--2', { href: '../gov-accounts/', text: '계정 화면' }))));
    return;
  }
  const rows = users.map((u) => {
    const cb = h('input', { type: 'checkbox', checked: u.cards.includes(g.card) });
    return { u, cb, el: h('label.sp-user', {}, cb, h('span', {}, h('b', { text: u.name || '이름 없음' }), h('small', { text: u.dept || '부서 미기재' }))) };
  });
  const save = h('button.t-btn', { type: 'button', text: '저장' });
  m.set(h('div.sp-md', {}, h('p.sp-note', { text: '고른 사람만 이 서비스의 결과 설명서를 봅니다' }), h('div.sp-users', {}, ...rows.map((r) => r.el)),
    h('div.sp-md-a', {}, save)));
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      for (const r of rows) {
        const want = new Set(r.u.cards);
        if (r.cb.checked) want.add(g.card); else want.delete(g.card);
        if (want.size !== r.u.cards.length || ![...want].every((x) => r.u.cards.includes(x))) await api(`/spaces/me/assign/${encodeURIComponent(r.u.id)}`, { method: 'PUT', body: { cards: [...want] } });
      }
      m.close(); K.toast('저장했습니다');
    } catch (e) { save.disabled = false; K.toast(e.message || '저장하지 못했습니다'); }
  });
}
