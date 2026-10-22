/* 행정서비스 묶음 홈(10-22 원칙 310 · FARM-ADMIN-DESIGN §2-1 · IMPL 1-1) — "영농관리 행정서비스 큰 틀 아래에 서비스 들이 여러개 있고.
   이게 통합 대시보드와 통계 등 농업정책에 필요한 기능이 고려되어야 한다." · "보고서/통계는 왼쪽 탭에 있었으면 한다".
   기관 메인(로그인) → 내 서비스(묶음 카드) → 묶음 홈(이 화면 · 왼쪽 탭 일곱) → 분석서비스 대시보드(gov-select/?service=) · 결과 지도(XI맵).
     ?group=   묶음(서버 GET /spaces/me/groups — 묶음 · 카드는 서버 데이터 · 지역 · 업무 고정값 0)
     &tab=     home(통합 대시보드) · services(분석서비스) · parcels(필지 찾기) · stats(보고서·통계) · downloads(다운로드 이력)
               행정정보(대장) · 분석 요청 · 촬영 요청 = 그 화면(gov-fusion · gov-request)으로 가는 탭.
   통합 대시보드의 정책 칸(직불 이행 점검 · 휴경 관리 · 영농시설 · 해마다 변화)은 확인 뒤(now 22 Q7) — 지금은 묶음 안 분석서비스의 결과 숫자만(숫자 한 출처 = /summary).
   휴대폰(≤ 640)은 왼쪽 탭이 가로 칩 한 줄. */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h, ymd } from '../kit/util.js';
import { loadBrand, applyBrand, markEl, favicon, joinLine } from '../gov-select/brand.js';
import { govRail } from '../gov-select/menu.js';
import { loadDeck, svcCard } from '../kit/service-card.js';
import { primary } from '../gov-select/dash.js';
import { renderStats } from '../gov-select/tabs.js';
import { parcelExtras } from '../gov-report/svc-parcels.js';
import { mountDownloads } from './downloads.js';
import { noticeLine } from '../gov-select/notice.js';

const who = await K.gate('gov-group');
const tid = who.me.tenant_id;
const qs = new URLSearchParams(location.search);

/* 기관 색 · 묶음을 함께 묻는다(10-22 P8b 첫인상 — 차례로 묻던 왕복 한 번을 줄임) */
const [brand, gj] = await Promise.all([Promise.resolve().then(() => loadBrand(tid)).catch(() => null), api('/spaces/me/groups').catch(() => null)]);
const groups = gj?.items || [];
const G = groups.find((g) => g.id === qs.get('group')) || groups[0] || null;
if (!G) { location.replace('../gov-select/?list=1'); await new Promise(() => {}); }

const B = brand || { tenant: tid, platform: who.org || '', short: who.org || '', mark: { text: [] }, color: {}, services: [], intro: {}, contact: '', name: { ko: who.org } };
applyBrand(document.documentElement, B); favicon(B);
if (B.color?.accent) {
  const a = B.color.accent, rgb = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(',');
  document.body.style.setProperty('--accent', a); document.body.style.setProperty('--tint', `rgba(${rgb},.14)`);
}
const RAIL = govRail({ who, current: 'group', group: G });
const S = K.shell({ who, home: 'gov-select', title: B.platform, rail: RAIL });
{
  const w = S.app.querySelector('.k-mast .k-word');
  if (w) { w.replaceChildren(markEl(B), h('span.word.gs-plat', { text: B.platform })); w.setAttribute('aria-label', B.platform); }
}

/* 탭 — 이 화면 안 다섯 + 다른 화면으로 가는 둘(행정정보 · 요청) */
const first = G.cards[0];
const TABS = [
  ['home', '통합 대시보드'], ['services', '분석서비스'], ['parcels', '필지 찾기'], ['stats', '보고서·통계'],
  ['ledger', '행정정보(대장)', '../gov-fusion/?' + new URLSearchParams({ service: first, group: G.id })],
  ['downloads', '다운로드 이력'],
  ['request', '분석 요청 · 촬영 요청', '../gov-request/?' + new URLSearchParams({ group: G.id })],
];
const TAB = TABS.some(([k, , href]) => k === qs.get('tab') && !href) ? qs.get('tab') : 'home';
const self = (tab, extra = {}) => '?' + new URLSearchParams({ group: G.id, ...(tab !== 'home' ? { tab } : {}), ...extra });
document.title = `${G.title} · ${B.platform}`;
document.body.dataset.tab = TAB;

const scroll = h('div.gs-scroll'), page = h('div.gs-page.gg-page');
scroll.append(page); S.main.append(scroll);
const asOf = h('span.gs-date');
page.append(h('header.gs-head', {},
  h('div.gs-head-t', {}, h('a.gs-crumb', { href: '../gov-select/?list=1', text: '내 서비스' }), h('h1', { text: G.title }), G.descr ? h('p.gs-sub', { text: G.descr }) : null),
  h('div.gs-head-r', {}, asOf)));
const nav = h('nav.gg-tabs', { 'aria-label': `${G.name} 메뉴` }, ...TABS.map(([k, t, href]) =>
  h('a.gg-tab', { href: href || self(k), ...(k === TAB ? { 'aria-current': 'page' } : {}), dataset: { k } }, t)));
const body = h('section.gg-body', { 'aria-label': TABS.find(([k]) => k === TAB)[1] });
page.append(h('div.gg', {}, nav, body));

/* 숫자 한 출처 — 대표 수치 요약(/summary · 분석서비스 카드 · 대시보드 큰 숫자와 같은 값) */
const [sum, regs, deck] = await Promise.all([api('/summary').catch(() => null), api('/regions').catch(() => null), loadDeck().catch(() => null)]);
if (sum?.as_of) asOf.textContent = `기준일 ${ymd(sum.as_of)}`;
const itemsOf = (card) => ((sum && sum.items) || []).filter((i) => i.card === card);
const svcOf = (card) => (B.services || []).find((s) => s.card === card) || G.services.find((s) => s.card === card) || { card, name: card };
const deckOf = (card) => (deck?.items || []).find((c) => c.id === card) || null;
const rlist = regs?.items || [];
const sggOne = rlist.length === 1 ? rlist[0].sgg_cd : null;
const mapHref = (card) => '/landxi/v3/xi-clean/?' + new URLSearchParams({ ...(sggOne ? { region: sggOne } : {}), service: card });
const dashHref = (card, extra = {}) => '../gov-select/?' + new URLSearchParams({ service: card, ...extra });
const nf = (v) => Number(v || 0).toLocaleString('ko-KR');

/* ═════════ 통합 대시보드 ═════════ */
function renderHome() {
  { const nh = h('div.gn-h'); body.append(nh); noticeLine(nh).catch(() => {}); }   // 기관 공지 한 줄(10-22 제안-기관공지쓰기)
  firstVisit();                                                                   // 처음 쓰는 담당자 세 걸음(10-22 제안-영농첫방문안내)
  const grid = h('div.gg-svcs');
  for (const card of G.cards) {
    const s = svcOf(card), d = deckOf(card), p = primary(itemsOf(card));
    grid.append(h('article.t-card.gg-svc', { dataset: { card } },
      h('div.gg-svc-h', {}, h('h2', { text: s.name }), s.status ? h('span.t-chip', { text: s.status }) : null),
      p ? h('p.gg-svc-n', { dataset: { metric: p.label, v: String(p.env.value) } }, h('b.num', { text: nf(p.env.value) }), h('i', { text: K.unitKo ? K.unitKo(p.unit || p.env.unit || '') : (p.unit || '') }), h('span', { text: [p.label, B.short].filter(Boolean).join(' · ') }))
        : h('p.gg-svc-none', { text: '첫 결과 뒤 숫자가 보입니다' }),
      h('p.gg-svc-d', { text: d?.latest ? `최근 결과 ${ymd(d.latest)}` : '아직 결과 없음' }),
      h('div.gg-svc-a', {}, h('a.t-btn.t-btn--2', { href: dashHref(card, { group: G.id }), text: '대시보드' }), s.open !== false ? h('a.t-btn.t-btn--text', { href: mapHref(card), text: '결과 지도' }) : null)));
  }
  body.append(h('div.gg-sec-h', {}, h('h2', { text: '분석서비스 결과' }), h('span', { text: `${G.cards.length}개 · AI 분석 결과` })), grid);
}

/* ═════════ 처음 쓰는 담당자 세 걸음(10-22 now21 제안-영농첫방문안내 — "결과 보기 → 필지 확인 → 보고서 받기") ═════════
   묶음 홈 맨 위 본문 흐름 안 카드(떠 있지 않음 · 겹침 0). 걸음을 누르면 그 걸음은 '봤음' — 셋 다 보거나 '닫기'면 다시 띄우지 않는다.
   기억은 이 브라우저 · 이 사람 · 이 묶음 열쇠(저장이 막힌 창이면 매번 보이되 화면은 그대로 동작). 지역 · 서비스 고정값 0(묶음의 첫 분석서비스). */
const TOUR_KEY = `lx_gg_tour:${tid}|${who.me.user?.id || ''}|${G.id}`;
const tourGet = () => { try { return JSON.parse(localStorage.getItem(TOUR_KEY) || 'null') || { seen: [] }; } catch { return { seen: [] }; } };
const tourSet = (v) => { try { localStorage.setItem(TOUR_KEY, JSON.stringify(v)); } catch { /* 저장 불가 */ } };
const tourSeen = (k) => { const v = tourGet(); if (!v.seen.includes(k)) { v.seen.push(k); tourSet(v); } };
if (TAB === 'parcels') tourSeen('parcel');
function firstVisit() {
  const v = tourGet();
  if (v.closed || v.seen.length >= 3) return;
  const open = G.cards.find((c) => svcOf(c).open !== false) || first;
  const steps = [
    ['map', '결과 보기', '분석서비스 결과를 지도에서 봅니다', mapHref(open)],
    ['parcel', '필지 확인', '지번으로 필지를 찾고 메모를 남깁니다', self('parcels')],
    ['report', '보고서 받기', '고른 결과를 한글 문서 · PDF로 받습니다', '../gov-report/?' + new URLSearchParams({ service: open, tab: 'report' })],
  ];
  const close = h('button.t-btn.t-btn--text.gg-tour-x', { type: 'button', text: '닫기' });
  const card = h('section.gg-tour', { 'aria-label': '처음 쓰는 분께' },
    h('div.gg-tour-h', {}, h('h2', { text: '처음이면 세 걸음만' }), close),
    h('ol.gg-tour-l', {}, ...steps.map(([k, t, d, href], i) => h('li', { dataset: { done: String(v.seen.includes(k)) } },
      h('a.gg-tour-a', { href, onclick: () => tourSeen(k) }, h('span.gg-tour-n.num', { text: String(i + 1) }),
        h('span.gg-tour-t', {}, h('b', { text: t }), h('small', { text: d })), h('span.gg-tour-ok', { text: v.seen.includes(k) ? '봤음' : '' }))))));
  close.addEventListener('click', () => { tourSet({ ...tourGet(), closed: true }); card.remove(); });
  body.append(card);
}

/* ═════════ 분석서비스(서비스 카드 한 벌 · K7) ═════════ */
function renderServices() {
  const grid = h('div.gs-grid', { dataset: { n: String(G.cards.length) } });
  for (const card of G.cards) {
    const s = svcOf(card), c = deckOf(card) || { id: card, name: s.name, line: s.line, year: s.year, open: s.open, state: 'none' };
    const el = svcCard({ ...c, name: s.name || c.name, line: joinLine(s.line || c.line || ''), status_label: s.status, open: s.open, year: s.year },
      { kind: 'gov', href: () => dashHref(card, { group: G.id }), more: () => '../gov-report/?' + new URLSearchParams({ service: card, tab: 'report' }) });
    el.classList.add('gs-card');
    if (s.open === false) el.classList.add('is-off');
    grid.append(el);
  }
  body.append(h('div.gg-sec-h', {}, h('h2', { text: '분석서비스' }), h('span', { text: `${G.cards.length}개` })), grid);
}

/* ═════════ 필지 찾기 — 지번 → 필지 카드(묶음 안 모든 분석서비스 결과 · 메모 · 이력 · 영상 비교) ═════════ */
function renderParcels() {
  const inp = h('input.t-input.gg-q', { type: 'search', placeholder: '지번 · 주소 — 예: ○○리 123-4', 'aria-label': '지번 찾기', autocomplete: 'off', value: qs.get('q') || '' });
  const go = h('button.t-btn', { type: 'button', text: '찾기' });
  const note = h('p.gg-note', { role: 'status' });
  const tw = h('div.gg-tw');
  body.append(h('div.gg-sec-h', {}, h('h2', { text: '필지 찾기' }), h('span', { text: '분석서비스를 고르지 않고 지번으로' })),
    h('form.gg-find', { onsubmit: (e) => { e.preventDefault(); find(); } }, inp, go), note, tw);
  async function find() {
    const q = inp.value.trim();
    if (!q) { note.textContent = '지번이나 주소를 적어 주세요'; return; }
    history.replaceState(null, '', self('parcels', { q }));
    go.disabled = true; note.textContent = ''; tw.replaceChildren();
    const done = K.hold();
    const res = await Promise.all(G.cards.map((card) => api(`/spaces/me/guides/${encodeURIComponent(card)}/parcels?` + new URLSearchParams({ q, limit: '30' }))
      .then((j) => ({ card, j })).catch(() => ({ card, j: null })))).finally(() => { done(); go.disabled = false; });
    const by = new Map();
    for (const { card, j } of res) for (const it of j?.items || []) {
      const r = by.get(it.pnu) || { pnu: it.pnu, addr: it.addr, emd: it.emd, jimok: it.jimok, svcs: [] };
      r.svcs.push({ card, name: svcOf(card).name, classes: (it.classes || []).join(' · '), m2: it.hit_m2?.value ?? null, note: it.note?.note || it.note || '' });
      by.set(it.pnu, r);
    }
    const rows = [...by.values()];
    if (!rows.length) { note.textContent = '찾은 필지가 없습니다 — 지번을 다시 확인해 주세요'; return; }
    note.textContent = `${nf(rows.length)}필지`;
    K.table(tw, {
      cols: [{ key: 'addr', label: '지번', fmt: (v) => `<b>${K.esc(v || '—')}</b>` }, { key: 'emd', label: '읍면동' }, { key: 'jimok', label: '지목' },
        { key: 'svc_t', label: 'AI 분석 결과' }],
      rows: rows.map((r) => ({ ...r, svc_t: r.svcs.map((x) => `${x.name.replace(/\s*분석\s*서비스$/, '')} ${x.classes || '—'}`).join(' / ') })),
      limit: 30, onRow: (r) => openParcel(r),
    });
  }
  if (inp.value) find();
}
function openParcel(r) {
  const host = h('div.gg-pc');
  const lines = h('dl.gg-pc-l', {}, ...r.svcs.flatMap((x) => [h('dt', { text: x.name }), h('dd', {}, h('b', { text: x.classes || '—' }), x.m2 != null ? ` ${nf(Math.round(x.m2))}㎡` : '')]));
  const ex = h('div.gg-pc-x');
  host.append(h('p.gg-pc-a', { text: [r.emd, r.jimok].filter(Boolean).join(' · ') }), lines, ex);
  K.drawer({ title: r.addr || '필지', body: host, label: '필지 카드', width: 440 });
  parcelExtras(ex, { card: r.svcs[0].card, pnu: r.pnu }).catch(() => {});
}

/* ═════════ 보고서·통계 — 분석서비스 고르기 한 칸 + 통계 대시보드 · 내려받기(tabs.js 그대로) ═════════ */
async function renderStatsTab() {
  const open = G.cards.filter((c) => svcOf(c).open !== false);
  const cur = open.includes(qs.get('service')) ? qs.get('service') : open[0];
  if (!cur) { const x = h('div'); body.append(x); K.empty(x, { kind: 'first', title: '열린 분석서비스가 없습니다' }); return; }
  const s = svcOf(cur);
  if (open.length > 1) {
    body.append(h('div.gs-period.gg-pick', { role: 'group', 'aria-label': '분석서비스' }, ...open.map((c) =>
      h('a.gy-chip', { href: self('stats', { service: c }), 'aria-pressed': String(c === cur), text: svcOf(c).name.replace(/\s*분석\s*서비스$/, '') }))));
  }
  const main = h('div.gd-main'), side = h('div.gd-side'), pre = h('div.gd-pre');
  body.append(pre, h('div.gd-grid', {}, main, side));
  const items = itemsOf(cur);
  const survey = items.some((i) => i.survey_state || (i.metrics?.field_check && i.metrics.field_check.value !== null));
  const rep = (tab) => '../gov-report/?' + new URLSearchParams({ service: cur, tab });
  await renderStats(main, side, { s, B, rep, pre, survey });
}

/* ═════════ 다운로드 이력(1-4 · downloads.js) ═════════ */
async function renderDownloads() {
  body.append(h('div.gg-sec-h', {}, h('h2', { text: '다운로드 이력' }), h('span', { text: '누가 · 언제 · 무엇을 받았는지' })));
  const box = h('div.gg-dl'); body.append(box);
  await mountDownloads(box, { mgr: who.me.role === 'manager', org: B.short || '' });
}

try {
  if (TAB === 'services') renderServices();
  else if (TAB === 'parcels') renderParcels();
  else if (TAB === 'stats') await renderStatsTab();
  else if (TAB === 'downloads') await renderDownloads();
  else renderHome();
} catch (e) { K.devlog?.('gov-group', String(e?.message || e)); const x = h('div'); body.append(x); K.empty(x, { kind: 'error', title: '불러오지 못했습니다', onRetry: () => location.reload() }); }
page.append(h('footer.gs-foot', {}, h('b', { text: B.name?.ko || B.platform }), B.contact ? h('span', { text: `대표전화 ${B.contact}` }) : null, h('span.sp'),
  h('span', { text: 'AI 분석 · 모델 개발과 갱신 — LX 한국국토정보공사' })));
document.body.dataset.ready = '1';
window.__govGroup = { ready: true, group: G.id, tab: TAB, cards: G.cards };
