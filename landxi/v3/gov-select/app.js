/* 서비스 선택 · 서비스 대시보드 · 기관 정보(구현 2차 T3 · 체계-2 ⓑ · GF-1 · GF-5 ⓐ · 사용자 구현 확인 I-4 "지자체 서비스도 UI/UX 통일성").
   기관 흐름: 기관 메인(로그인) → 서비스 선택 → 서비스 대시보드 → 서비스별 기능(지금 있는 기관 화면 gov-fusion · gov-report 에 ?service= 로 잇는다).
   모든 기관이 같은 틀 — 광역 기관만 '광역 전체 / 시·군·구' 고르기 한 칸이 더 있다(관할 시군구 = GET /regions, 화면이 대신 고르지 않는다).
     ./            서비스 선택(켜진 서비스가 하나뿐이면 그 서비스 대시보드로 바로)
     ./?list=1     서비스 선택(바로 넘기지 않음 — 레일 '내 서비스')
     ./?service=…  서비스 대시보드(큰 숫자 하나 · 할 일 · 최근 결과) [&region=시군구]
     ./?view=org   기관 정보(마크 · 이름 · 색 · 소개 글) — 기관 관리자만
   숫자는 대표 수치 요약 GET /summary 한 출처(기관 세션 = 자기 기관만 · 값이 없으면 지어내지 않는다). 머리에 기관 마크 · 이름 · 색(GET /brand/{기관}). */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h, ymd } from '../kit/util.js';
import { orgHome } from '../kit/auth-gate.js';
import { loadBrand, applyBrand, markEl, faceEl, chip, favicon, shortAddr, joinLine } from './brand.js';
import { brandForm } from './brand-form.js';
import { govRail, setRequestService } from './menu.js';

const who = await K.gate('gov-select');
const tid = who.me.tenant_id;
const isMgr = who.me.role === 'manager';
const qs = new URLSearchParams(location.search);
const SVC = qs.get('service'), REG = qs.get('region');
const view = qs.get('view') === 'org' && isMgr ? 'org' : SVC ? 'svc' : 'list';
document.body.dataset.view = view;

let brand = null;
try { brand = await loadBrand(tid); } catch { /* 아래에서 문제 표시 */ }

/* 켜진 서비스가 하나뿐이면 서비스 선택을 건너 그 서비스 대시보드로(체계-2 ⓑ · 모든 기관 같은 흐름) */
if (view === 'list' && !qs.has('list') && brand) {
  const open = (brand.services || []).filter((s) => s.open);
  if (open.length === 1) { location.replace('?service=' + encodeURIComponent(open[0].card)); await new Promise(() => {}); }
}

const B = brand || { tenant: tid, platform: who.org || '', short: who.org || '', mark: { text: [] }, color: {}, services: [], intro: {}, contact: '', name: { ko: who.org } };
applyBrand(document.documentElement, B); favicon(B);
if (B.color?.accent) {   // 현재 위치 표시 · 진행 막대 · 포커스 = 기관색(법전 액센트 4곳 · brand.md 2절)
  const a = B.color.accent, rgb = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(',');
  document.body.style.setProperty('--accent', a); document.body.style.setProperty('--tint', `rgba(${rgb},.14)`);
}

/* 메뉴(기관 메뉴 한 곳 — menu.js) — 내 서비스 · 분석 의뢰 · 내가 보낸 요청(검토 요청 목록 · 알림 칸 부품 kit/notify.js 가 ?review=all 을 열어 준다) ·
   기관 관리자는 기관 정보 · 계정 */
const RAIL = govRail({ who, current: view === 'org' ? 'org' : qs.get('review') ? 'sent' : 'list' });
const S = K.shell({ who, home: 'gov-select', title: B.platform, rail: RAIL });
/* 머리 = 기관 마크 · 플랫폼 이름(Land-XI 글자 대신 — 원칙 48 · 64) */
function paintMast() {
  const w = S.app.querySelector('.k-mast .k-word');
  if (!w) return;
  w.replaceChildren(markEl(B), h('span.word.gs-plat', { text: B.platform }));
  w.setAttribute('aria-label', B.platform);
}
paintMast();

const scroll = h('div.gs-scroll'), page = h('div.gs-page');
scroll.append(page); S.main.append(scroll);
const nameKo = B.name?.ko || B.name?.en || B.platform;
const foot = () => h('footer.gs-foot', {}, h('b', { text: nameKo }), B.contact ? h('span', { text: `대표전화 ${B.contact}` }) : null, h('span.sp'),
  h('span', { text: 'AI 분석 · 모델 개발과 갱신 — LX 한국국토정보공사' }));

/* ── 숫자 한 출처 ─────────────────────────────────────── */
const sumP = api('/summary').catch(() => null);
const regP = api('/regions').catch(() => null);
const sum = await sumP;
const itemsOf = (card) => ((sum && sum.items) || []).filter((i) => i.card === card);
/** 같은 이름의 값을 더한다(광역 전체) — 값 있는 것만 · 하나면 그대로 */
function total(items, key) {
  const es = items.map((i) => i.metrics?.[key]).filter((e) => e && e.value !== null && e.value !== undefined);
  if (!es.length) return null;
  if (es.length === 1) return es[0];
  return { ...es[0], value: es.reduce((a, e) => a + e.value, 0), as_of: es.map((e) => e.as_of).sort().pop() };
}
/** 큰 숫자 하나 = 업무 결과 — 현장 확인 필요(필지 대조가 있는 서비스) → 없으면 AI 탐지 → 없으면 없음(첫 결과 전) */
function primary(items) {
  for (const k of ['field_check', 'detected']) { const e = total(items, k); if (e) return { key: k, env: e, label: e.label }; }
  return null;
}
const lastWord = (s) => String(s || '').trim().split(/\s+/).pop();

function head({ title, sub, right, crumb, line = true }) {
  return h('header.gs-head', { class: line ? '' : 'gs-head--flat' },
    h('div.gs-head-t', {}, crumb || null, h('h1', { text: title }), sub ? h('p.gs-sub', { text: sub }) : null),
    right ? h('div.gs-head-r', {}, ...[].concat(right).filter(Boolean)) : null);
}
const asOf = () => (sum?.as_of ? h('span.gs-date', { text: `기준일 ${ymd(sum.as_of)}` }) : null);

function brandDown() {
  const box = h('div'); page.append(box);
  K.empty(box, { kind: 'error', title: '기관 정보를 불러오지 못했습니다', onRetry: () => location.reload() });
}

/* ═════════════ 서비스 선택 ═════════════ */
function renderList() {
  document.title = `내 서비스 · ${B.platform}`;
  page.append(head({ title: '내 서비스', sub: `${B.short}에 열린 AI 분석 서비스`, right: asOf() }));
  if (!brand) return brandDown();
  const svcs = brand.services || [];
  if (!svcs.length) { const box = h('div'); page.append(box); K.empty(box, { kind: 'first', title: '열린 서비스가 없습니다', text: '서비스가 열리면 여기에 보입니다' }); return; }
  page.append(h('div.gs-grid', { dataset: { n: String(svcs.length) } }, ...svcs.map(svcCard)));
}
function svcCard(s) {
  const p = s.open ? primary(itemsOf(s.card)) : null;
  const body = [
    faceEl(s.card, 'gs-card-face'),
    h('div.gs-card-b', {},
      h('div.gs-meta', {}, h('span', { text: s.year ? `${s.year}년부터` : '' }), chip(s.status)),
      h('h2.gs-card-t', { text: s.name }),
      s.line ? h('p.gs-card-d', { text: joinLine(s.line) }) : null,
      p ? h('div.gs-card-n', {}, h('span.t-label', { text: p.label }), h('span', { html: K.numHtml(p.env) })) : null,
      s.open ? h('span.gs-card-go', { text: '열기' }) : null),
  ];
  const attrs = { dataset: { card: s.card, status: s.status } };
  return s.open ? h('a.gs-card', { href: `?service=${encodeURIComponent(s.card)}`, ...attrs }, ...body) : h('article.gs-card.is-off', attrs, ...body);
}

/* ═════════════ 서비스 대시보드 ═════════════ */
async function renderSvc() {
  if (!brand) { page.append(head({ title: '서비스', right: asOf() })); return brandDown(); }
  const s = (brand.services || []).find((x) => x.card === SVC);
  const crumb = h('a.gs-crumb', { href: './?list=1', text: '내 서비스' });
  if (!s) {
    page.append(head({ title: '서비스', crumb }));
    const box = h('div'); page.append(box);
    K.empty(box, { kind: 'first', title: '이 기관에 열린 서비스가 아닙니다', text: '내 서비스에서 다시 고르세요', action: { label: '내 서비스', href: './?list=1' } });
    return;
  }
  document.title = `${s.name} · ${B.platform}`;
  const regs = ((await regP)?.items || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
  const wide = regs.length > 1;                                   // 광역 기관 — 관할 시군구가 여럿(gov-fusion 과 같은 판정)
  const reg = wide && REG && regs.some((r) => r.sgg_cd === REG) ? regs.find((r) => r.sgg_cd === REG) : null;
  const all = itemsOf(s.card);
  const cur = reg ? all.filter((i) => i.sgg_cd === reg.sgg_cd) : all;
  const survey = cur.some((i) => i.survey_state || (i.metrics?.field_check && i.metrics.field_check.value !== null));
  const p = s.open ? primary(cur) : null;
  const q = (extra = {}) => '?' + new URLSearchParams({ service: s.card, ...(reg ? { region: reg.sgg_cd } : {}), ...extra });
  const mapHref = '../gov-fusion/' + q(), rep = (tab) => '../gov-report/' + q({ tab });
  /* 이 서비스의 배포본(분석 의뢰 · 결과 시점은 배포본 단위) — 광역은 고른 시·군·구의 것, 없으면 이 서비스의 첫 배포본 */
  const deps = ((await api('/requests/services').catch(() => null))?.items || []).filter((d) => d.card === s.card);
  const dep = (reg && deps.find((d) => d.sgg_cd === reg.sgg_cd)) || (deps.length === 1 || !wide ? deps[0] : null) || deps[0] || null;
  const reqHref = '../gov-request/' + (dep ? '?' + new URLSearchParams({ service: dep.id }) : '');
  if (dep) setRequestService(RAIL, S.rail, dep.id);

  /* 광역 — '광역 전체 / 시·군·구' 한 칸(사용자가 고른다) */
  let pick = null;
  if (wide) {
    pick = h('label.gs-reg', {}, h('span.t-label', { text: '시·군·구' }),
      h('select.t-input', { 'aria-label': '시·군·구' }, h('option', { value: '', text: '광역 전체' }),
        ...regs.map((r) => h('option', { value: r.sgg_cd, text: r.name, selected: reg && r.sgg_cd === reg.sgg_cd ? true : null }))));
    pick.querySelector('select').addEventListener('change', (e) => { const v = e.target.value; location.assign('?' + new URLSearchParams({ service: s.card, ...(v ? { region: v } : {}) })); });
  }
  page.append(head({ title: s.name, sub: joinLine([reg?.full || (wide ? '광역 전체' : ''), s.line].filter(Boolean).join(' · ')), right: [pick, asOf()], crumb, line: false }));
  page.append(h('nav.gs-tabs', { 'aria-label': '서비스 기능' },
    h('a.gs-tab', { href: q(), 'aria-current': 'page', text: '현황' }),
    h('a.gs-tab', { href: mapHref, text: '결과 보기' }),
    survey ? h('a.gs-tab', { href: rep('sus'), text: '필지 대조 결과' }) : null,
    survey ? h('a.gs-tab', { href: rep('report'), text: '보고서' }) : null,
    s.open ? h('a.gs-tab', { href: reqHref, text: '분석 의뢰' }) : null));

  const mainCol = h('div.gs-main'), side = h('div.gs-side');
  page.append(h('div.gs-dash', {}, mainCol, side));

  /* 큰 숫자 하나 */
  const bigCard = h('section.t-card.gs-bigc', { 'aria-label': '현황' });
  mainCol.append(bigCard);
  if (p) {
    const bEl = h('div'); bigCard.append(bEl);
    K.bignum(bEl, p.env, { label: p.label });
    const kv = [['detected', 'AI 탐지']].filter(([k]) => k !== p.key)   // 결과 확인 대기는 오른쪽 '할 일'에(같은 숫자 두 번 0)
      .map(([k]) => [k, total(cur, k)]).filter(([, e]) => e);
    if (kv.length) bigCard.append(h('dl.gs-kv', {}, ...kv.map(([, e]) => h('div', {}, h('dt', { text: e.label }), h('dd', { html: K.numHtml(e) })))));
    bigCard.append(h('div.gs-acts', {}, h('a.t-btn', { href: mapHref, text: '결과 보기' }), survey ? h('a.t-btn.t-btn--2', { href: rep('sus'), text: '필지 대조 결과' }) : null));
  } else {
    const img = cur.find((i) => i.imagery?.has)?.imagery?.label || (reg ? null : all.find((i) => i.imagery?.has)?.imagery?.label);
    const box = h('div'); bigCard.append(box);
    K.empty(box, { kind: 'first', title: s.open ? '첫 결과 전' : `${s.year}년 시작`,
      text: s.open ? (reg && all.length ? '이 시·군·구에는 아직 결과가 없습니다' : '첫 AI 분석 결과가 나오면 여기에 보입니다') : '사업이 시작되면 여기에 결과가 보입니다' });
    if (img) bigCard.append(h('p.gs-note', { text: `등록된 영상 · ${img}` }));
    if (s.open) bigCard.append(h('div.gs-acts', {}, h('a.t-btn.t-btn--2', { href: mapHref, text: '지도 열기' })));
  }

  /* 광역 전체 — 시·군·구별(결과가 있는 곳만 · 누르면 그 시·군·구) */
  if (wide && !reg) {
    const rows = all.filter((i) => i.sgg_cd).map((i) => ({ i, p: primary([i]) })).filter((x) => x.p);
    if (rows.length === 1) {   // 결과가 한 시·군·구에만 — 같은 숫자를 표로 한 번 더 쓰지 않고 한 줄로
      const i = rows[0].i;
      bigCard.append(h('p.gs-note', {}, '결과가 있는 시·군·구 · ', h('a.gs-link', { href: '?' + new URLSearchParams({ service: s.card, region: i.sgg_cd }), text: lastWord(i.region_name) })));
    } else if (rows.length > 1) {
      mainCol.append(h('section.t-card.gs-box', { 'aria-label': '시·군·구별' }, h('h2', { text: '시·군·구별' }),
        h('ul.gs-rows', {}, ...rows.map(({ i, p: pp }) => h('li', {}, h('a.gs-row', { href: '?' + new URLSearchParams({ service: s.card, region: i.sgg_cd }) },
          h('span', { text: lastWord(i.region_name) }), h('span.s', { text: pp.label }), h('span.r', { html: K.numHtml(pp.env) })))))));
    }
  }

  /* 할 일 — 필지 대조가 있는 서비스: 결과 확인 대기 + 점수 높은 필지 셋 */
  const todo = h('section.t-card.gs-box', { 'aria-label': '할 일' });
  side.append(todo);
  const rp = total(cur, 'review_pending');
  todo.append(h('div.gs-box-h', {}, h('h2', { text: '할 일' }), rp ? h('span.gs-cnt', {}, rp.label, h('span', { html: K.numHtml(rp) })) : null));
  if (survey && s.open) {
    const list = h('ul.gs-rows'); todo.append(list);
    try {
      const j = await api(`/survey/findings?state=open&rule=R1,R2,R3,R4,R5,R6&sort=score&limit=3${reg ? `&sgg=${encodeURIComponent(reg.sgg_cd)}` : ''}`);
      const its = (j && j.items) || [];
      if (its.length) {
        const rn = cur[0]?.region_name || reg?.full || '';
        list.append(...its.map((f) => h('li', {}, h('a.gs-row.gs-row--2', { href: rep('sus') },
          h('span.gs-row-t', {}, h('b', { text: shortAddr(f.addr, rn) }), h('span.s', { text: f.rule_nm || '' })),
          h('span.t-chip', { text: '확인 전', dataset: { lv: 'wait' } })))));
        todo.append(h('a.t-btn.t-btn--text.gs-more', { href: rep('sus'), text: '모두 보기' }));
      } else list.replaceWith(h('p.gs-none', { text: '지금 확인할 결과가 없습니다' }));
    } catch { list.replaceWith(h('p.gs-none', { text: '지금은 불러올 수 없습니다' })); }
  } else todo.append(h('p.gs-none', { text: s.open ? '지금 확인할 결과가 없습니다' : '사업이 시작되면 할 일이 생깁니다' }));

  /* 최근 결과 — AI 분석 결과 기준일 · 등록된 영상 */
  const det = total(cur, 'detected');
  const img = cur.find((i) => i.imagery?.has)?.imagery?.label;
  const recent = h('section.t-card.gs-box', { 'aria-label': '최근 결과' }, h('div.gs-box-h', {}, h('h2', { text: '최근 결과' })));
  const rows = [];
  if (det) rows.push(h('li', {}, h('a.gs-row', { href: mapHref }, h('span', { text: 'AI 분석 결과' }), h('span.s', { text: ymd(det.as_of) }), h('span.t-chip', { text: '보기' }))));
  if (img) rows.push(h('li', {}, h('div.gs-row', {}, h('span', { text: '등록된 영상' }), h('span.s', { text: img }))));
  recent.append(rows.length ? h('ul.gs-rows', {}, ...rows) : h('p.gs-none', { text: '아직 결과가 없습니다' }));
  side.append(recent);

  /* 결과 시점 — 서비스 결과 + 분석 의뢰로 더해진 시점(GET /requests/timepoints · 의뢰 화면과 같은 목록) */
  if (s.open && deps.length) {
    const tp = h('section.t-card.gs-box', { 'aria-label': '결과 시점' }, h('div.gs-box-h', {}, h('h2', { text: '결과 시점' })));
    const ul = h('ul.gs-rows');
    tp.append(ul);
    side.append(tp);
    const pick = dep ? [dep] : deps.slice(0, 3);
    const lists = await Promise.all(pick.map((d) => api('/requests/timepoints?' + new URLSearchParams({ service: d.id })).then((j) => ({ d, j })).catch(() => null)));
    const seen = new Set();
    for (const x of lists.filter(Boolean)) {
      for (const t of x.j.items || []) {
        const k = t.kind + ':' + (t.request_id || t.result_set || t.label);
        if (seen.has(k)) continue; seen.add(k);
        const href = t.kind === 'request' ? '../gov-request/?' + new URLSearchParams({ service: x.d.id, tab: 'mine' }) : mapHref;
        ul.append(h('li', {}, h('a.gs-row', { href, dataset: { kind: t.kind } }, h('span', { text: t.label }),
          t.kind === 'request' ? h('span.t-chip', { text: '의뢰' }) : h('span.t-chip', { text: '보기' }))));
      }
    }
    if (!ul.childElementCount) ul.replaceWith(h('p.gs-none', { text: '아직 결과가 없습니다' }));
  }
}

/* ═════════════ 기관 정보(기관 관리자) ═════════════ */
function renderOrg() {
  document.title = `기관 정보 · ${B.platform}`;
  const main = orgHome(tid);
  page.append(head({ title: '기관 정보', sub: '마크 · 이름 · 색 · 소개 글을 고치면 기관 메인에 바로 반영됩니다.', right: h('a.t-btn.t-btn--text', { href: main, text: '메인 열기' }) }));
  if (!brand) return brandDown();
  page.append(brandForm({
    brand, mainHref: main,
    onSaved(b) { Object.assign(B, b); brand = b; applyBrand(document.documentElement, b); favicon(b); paintMast(); },
  }));
}

if (view === 'org') renderOrg(); else if (view === 'svc') await renderSvc(); else renderList();
page.append(foot());
document.body.dataset.ready = '1';
window.__govSelect = { ready: true, view, tenant: tid, services: (brand?.services || []).map((s) => s.card) };
