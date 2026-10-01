/* 서비스 선택(내 서비스) · 서비스 대시보드 · 기관 정보(구현 2차 T3 · 체계-2 ⓑ · GF-1 · GF-5 ⓐ · 사용자 구현 확인 I-4 "지자체 서비스도 UI/UX 통일성" ·
   구현 5차 기관 화면 완성 디자인 — 확인 대장 '기관 화면 확인' 기관-1 ⓐ 공통 틀 · 기관-3 ⓐ 내 서비스 · 기관-4 ⓐ 서비스 대시보드).
   기관 흐름: 기관 메인(로그인) → 내 서비스 → 서비스 대시보드 → 서비스별 기능(결과 지도 = XI맵 · 필지 목록 · 보고서 = gov-report · 행정정보와 비교 = gov-fusion).
   모든 기관이 같은 틀 — 광역 기관만 '광역 전체 / 시·군·구' 고르기 한 칸이 더 있다(관할 시군구 = GET /regions, 화면이 대신 고르지 않는다).
     ./            내 서비스(볼 수 있는 서비스가 하나뿐이면 그 서비스 대시보드로 바로)
     ./?list=1     내 서비스(바로 넘기지 않음 — 레일 '내 서비스') — 오늘 띠 셋(새 알림 · 보낸 요청 · 요청하기) + 서비스 카드 한 벌
     ./?service=…  서비스 대시보드(dash.js — 장면 먼저) [&region=시군구]
     ./?view=org   기관 정보(마크 · 이름 · 색 · 소개 글) — 기관 관리자만
   부서 사용자는 기관 관리자가 정해 준 서비스만 본다(서버 덱이 거른다 · 원칙 38).
   숫자는 대표 수치 요약 GET /summary 한 출처(기관 세션 = 자기 기관만 · 값이 없으면 지어내지 않는다). 머리에 기관 마크 · 이름 · 색(GET /brand/{기관}). */
import * as K from '../kit/index.js';
import { api } from '../../shared/api-v1.js';
import { h, ymd } from '../kit/util.js';
import { orgHome } from '../kit/auth-gate.js';
import { loadBrand, applyBrand, markEl, favicon, joinLine } from './brand.js';
import { brandForm } from './brand-form.js';
import { govRail } from './menu.js';
import { loadDeck, svcCard } from '../kit/service-card.js';   // 서비스 카드 한 벌 ③ 기관 서비스 선택(확인 대장 14차 카드-1 ⓐ)
import { renderDash, primary } from './dash.js';

const who = await K.gate('gov-select');
const tid = who.me.tenant_id;
const isMgr = who.me.role === 'manager';
const qs = new URLSearchParams(location.search);
const SVC = qs.get('service'), REG = qs.get('region');
const view = qs.get('view') === 'org' && isMgr ? 'org' : SVC ? 'svc' : 'list';
document.body.dataset.view = view;

let brand = null;
try { brand = await loadBrand(tid); } catch { /* 아래에서 문제 표시 */ }
const deckP = view === 'org' ? Promise.resolve(null) : loadDeck();

/* 볼 수 있는 서비스 — 브랜드 목록(LX 관리자가 정한 순서 · 상태 말) ∩ 서버 덱(부서 사용자 = 정해 준 서비스만). 덱이 없으면(서버 경로 전) 브랜드 목록 그대로 */
async function visible() {
  const svcs = brand?.services || [];
  const deck = await deckP;
  if (!deck) return { svcs, deck: null };
  const ids = new Set((deck.items || []).filter((c) => c.listed !== false).map((c) => c.id));
  return { svcs: svcs.filter((s) => ids.has(s.card)), deck };
}

/* 볼 수 있는 서비스가 하나뿐이면 서비스 선택을 건너 그 서비스 대시보드로(체계-2 ⓑ · 모든 기관 같은 흐름) */
if (view === 'list' && !qs.has('list') && brand) {
  const { svcs } = await visible();
  const open = svcs.filter((s) => s.open);
  if (open.length === 1 && svcs.length === 1) { location.replace('?service=' + encodeURIComponent(open[0].card)); await new Promise(() => {}); }
}

const B = brand || { tenant: tid, platform: who.org || '', short: who.org || '', mark: { text: [] }, color: {}, services: [], intro: {}, contact: '', name: { ko: who.org } };
applyBrand(document.documentElement, B); favicon(B);
if (B.color?.accent) {   // 현재 위치 표시 · 진행 막대 · 포커스 = 기관색(법전 액센트 4곳 · brand.md 2절)
  const a = B.color.accent, rgb = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(',');
  document.body.style.setProperty('--accent', a); document.body.style.setProperty('--tint', `rgba(${rgb},.14)`);
}

/* 메뉴(기관 메뉴 한 곳 — menu.js) — 내 서비스 · 요청하기(분석 요청 · 촬영 요청 · 보낸 요청 탭) · 기관 관리자는 기관 정보 · 계정.
   ?review=<id> 는 그 검토 요청 대화를 연다(알림 칸 부품 kit/notify.js) */
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

/* ═════════════ 내 서비스 — 오늘 띠 셋 + 서비스 카드 한 벌 ═════════════ */
async function renderList() {
  document.title = `내 서비스 · ${B.platform}`;
  page.append(head({ title: '내 서비스', sub: `${B.short}에 열린 AI 분석 서비스${isMgr ? '' : ' · 내가 맡은 서비스만 보입니다'}`, right: asOf() }));
  if (!brand) return brandDown();
  const band = h('div.gs-band', { 'aria-label': '오늘' });
  page.append(band);
  const { svcs, deck } = await visible();
  const bandP = drawBand(band).catch((e) => { K.devlog('band', e.message); });
  if (!svcs.length) {
    const box = h('div'); page.append(box);
    K.empty(box, isMgr || !deck ? { kind: 'first', title: '열린 서비스가 없습니다', text: '서비스가 열리면 여기에 보입니다' }
      : { kind: 'first', title: '아직 맡은 서비스가 없습니다', text: '기관 관리자가 볼 서비스를 정해 줍니다' });
    return;
  }
  const by = new Map((deck?.items || []).map((c) => [c.id, c]));
  const cnt = {};
  for (const s of svcs) cnt[s.status] = (cnt[s.status] || 0) + 1;
  page.append(h('div.gs-sec-h', {}, h('h2', { text: '서비스' }),
    h('span', { text: [`${svcs.length}개`, ...Object.entries(cnt).map(([k, n]) => `${k} ${n}`)].join(' · ') })));
  page.append(h('div.gs-grid', { dataset: { n: String(svcs.length) } }, ...svcs.map((s) => svcEl(s, by.get(s.card)))));
  await bandP;
}
function svcEl(s, c) {
  const p = s.open ? primary(itemsOf(s.card), c) : null;
  /* 덱이 없을 때(서버 경로 전) — 브랜드 목록 값으로 같은 카드(장면 없이 · 숫자는 요약에서) */
  const card = c || { id: s.card, name: s.name, line: s.line, year: s.year, status_label: s.status, open: s.open, state: { '운영': 'ga', '시범': 'pilot' }[s.status] || 'none',
    /* 덱 없이는 결과 수가 다듬은 결과인지 알 수 없다 — 업무 결과(현장 확인 필요)만 싣는다(분석 칸 도형 수 0 · 사용자 규칙 2) */
    example: p && p.key === 'field_check' ? { value: p.env.value, unit: p.env.unit, basis: p.env.basis, as_of: p.env.as_of, source: p.env.source, label: p.label, word: '현장 확인 필요 필지', place: B.short } : null };
  const svc = `?service=${encodeURIComponent(s.card)}`;
  const el = svcCard({ ...card, name: s.name || card.name, line: joinLine(s.line || card.line || ''), status_label: s.status, open: s.open, year: s.year },
    { kind: 'gov', href: () => svc, more: () => '../gov-report/' + svc + '&tab=report' });
  el.classList.add('gs-card');
  if (!s.open) el.classList.add('is-off');
  el.dataset.status = s.status;
  return el;
}

/* 오늘 띠 셋 — 새 알림(알림 칸과 같은 수) · 보낸 요청(진행 중 수 · 가장 최근 한 줄) · 요청하기(바로 가기). 숫자는 서버 값 그대로 */
const STATE_LV = { pending: 'wait', approved: 'wait', analyzing: 'wait', done: 'ci', rejected: 'warn', failed: 'warn' };
const when = (iso) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[1]}.${m[2]}` : ''; };
const svcShort = (s) => String(s || '').replace(/\s*(행정서비스|서비스)$/, '');
async function drawBand(band) {
  const tile = (o) => h(o.href ? 'a.gs-tile' : 'div.gs-tile', { ...(o.href ? { href: o.href } : {}), dataset: { k: o.k } },
    h('span.gs-tile-ic', { html: K.icon(o.icon) }),
    h('span.gs-tile-t', {}, h('b', {}, o.title, o.n !== undefined && o.n !== null ? h('span.num', { text: ` ${o.n}` }) : null), h('small', { text: o.line })),
    o.chip ? h('span.t-chip', { text: o.chip[0], dataset: o.chip[1] ? { lv: o.chip[1] } : {} }) : null,
    o.go ? h('span.gs-tile-go', { text: o.go }) : null);
  const reqTile = tile({ k: 'request', icon: 'deploy', title: '요청하기', line: '분석 요청 · 촬영 요청', href: '../gov-request/', go: '요청하기' });
  band.replaceChildren(tile({ k: 'notice', icon: 'inbox', title: '새 알림', line: '불러오는 중' }), tile({ k: 'sent', icon: 'list', title: '보낸 요청', line: '불러오는 중' }), reqTile);
  const [nt, rv, rq, sh] = await Promise.all([api('/reviews/notify').catch(() => null), api('/reviews?box=all&limit=50').catch(() => null), api('/requests').catch(() => null),
    api('/shoots').catch(() => null)]);
  /* 새 알림 — 알림 칸(머리의 종)과 같은 수 · 같은 목록 */
  const unread = (nt?.items || []).find((x) => x.unread);
  const ex = (nt?.extra || [])[0];
  const notice = unread ? { line: `${unread.where} — 검토 요청에 LX가 답했습니다`, href: './?list=1&review=' + encodeURIComponent(unread.id), chip: ['답 도착', 'ci'] }
    : ex ? { line: ex.kind === 'result' ? `새 결과 — ${ex.items?.[0]?.title || ''}` : ex.kind === 'shoot_ans' ? `촬영 요청에 LX 답이 왔습니다` : ex.kind === 'signup' ? `가입 신청 ${ex.n}건을 확인해 주세요` : ex.kind === 'reset' ? `비밀번호 재설정 요청 ${ex.n}건` : `확인할 일 ${ex.n}건`,
      href: ex.href || null, chip: ex.kind === 'result' ? ['새 결과', 'ci'] : null }
      : { line: '새 알림이 없습니다' };
  /* 보낸 요청 — 검토 요청 + 분석 요청 + 촬영 요청(내가 보낸 것) · 진행 중인 것의 수 · 가장 최근 한 줄 */
  const rows = [];
  for (const it of rv?.items || []) rows.push({ at: it.updated_at || it.at, live: it.status !== 'answered', t: `${it.where} 검토 요청`, href: './?list=1&review=' + encodeURIComponent(it.id),
    chip: it.status === 'answered' ? ['답 도착', 'ci'] : [it.status === 'seen' ? 'LX 확인 중' : '보냄', ''] });
  for (const x of rq?.items || []) if (x.mine) rows.push({ at: x.decided_at || x.created_at, live: ['pending', 'approved', 'analyzing'].includes(x.state),
    t: `${x.label || '영상'} → ${svcShort(x.service?.name)} 분석 요청`, href: '../gov-request/?' + new URLSearchParams({ service: x.service?.id || '', tab: 'sent' }), chip: [x.state_word, STATE_LV[x.state] || ''] });
  for (const x of sh?.items || []) if (x.mine) rows.push({ at: x.updated_at || x.created_at, live: ['sent', 'answered'].includes(x.state),
    t: `${x.place || '그린 범위'} 촬영 요청`, href: '../gov-request/?tab=sent', chip: [x.state_word, x.state === 'answered' ? 'ci' : x.state === 'rejected' ? 'warn' : ''] });
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const last = rows[0];
  band.replaceChildren(
    tile({ k: 'notice', icon: 'inbox', title: '새 알림', n: nt ? nt.n : null, ...notice }),
    tile({ k: 'sent', icon: 'list', title: '보낸 요청', n: rv || rq || sh ? rows.filter((r) => r.live).length : null,
      line: last ? `${last.t} · ${when(last.at)}` : '아직 보낸 요청이 없습니다', href: '../gov-request/?tab=sent', chip: last?.chip }),
    reqTile);
}

/* ═════════════ 서비스 대시보드 ═════════════ */
async function renderSvc() {
  if (!brand) { page.append(head({ title: '서비스', right: asOf() })); return brandDown(); }
  const { svcs, deck } = await visible();
  const s = svcs.find((x) => x.card === SVC);
  if (!s) {
    page.append(head({ title: '서비스', crumb: h('a.gs-crumb', { href: './?list=1', text: '내 서비스' }) }));
    const box = h('div'); page.append(box);
    K.empty(box, { kind: 'first', title: isMgr ? '이 기관에 열린 서비스가 아닙니다' : '내가 맡은 서비스가 아닙니다', text: '내 서비스에서 다시 고르세요', action: { label: '내 서비스', href: './?list=1' } });
    return;
  }
  const card = (deck?.items || []).find((c) => c.id === s.card) || null;
  await renderDash({ page, B, s, card, sum, regP, RAIL, S, head, asOfEl: asOf, REG });
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

if (view === 'org') renderOrg(); else if (view === 'svc') await renderSvc(); else await renderList();
page.append(foot());
document.body.dataset.ready = '1';
window.__govSelect = { ready: true, view, tenant: tid, services: (brand?.services || []).map((s) => s.card) };
