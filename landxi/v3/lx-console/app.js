/* app.js — LX 직원 대시보드(홈) · 확인 대장 10차 홈-1 · 14차 대시보드-1 ⓐ 1안 · 메뉴-1 ⓐ 1안 · 원칙 81 · 90 · 99.
   네 질문에 칸 하나씩(지도 없음): ① 내 프로젝트는 어디까지(6칸 진행 막대 · 지금 단계 · 다음 할 일) ② 기관이 나를 기다리는 것(요청함 숫자 셋)
   ③ 우리 서비스는 어디서 돌고 무엇이 문제(실제 결과 장면 넷 · 살펴볼 것) ④ 지금 무엇을 할까(바로 분석하기 · 최근 활동).
   숫자는 모두 서버에서 — 같은 이름의 숫자는 프로젝트 · 요청함 · 서비스 관리 화면과 같은 한 곳(지어낸 값 0 · 내부 지표 0).
   왼쪽 메뉴 = LX 직원 메뉴(kit/lx-menu.js) · '새 프로젝트'는 메뉴 '프로젝트 → 새 프로젝트'와 같은 창(lx-project/new.js · 원칙 99). */
import * as K from '../kit/index.js';
import { h, esc, api, API } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { stageHref, loadProject, STAGES, HOME as PROJECTS } from '../lx-project/context.js';
import { openNewProject } from '../lx-project/new.js';
import { summary } from './summary.js';
import { say } from './words.js';
import { dueSets } from '../lx-deploy/retrain.js';

const who = await K.gate('lx-console');
const S = K.shell({ who, home: 'lx-console', rail: staffMenu('home') });
K.devDrawer({ who });
const at = (p) => new URL(p, import.meta.url).pathname;
const V = { deploy: at('../lx-deploy/'), detail: at('../service-detail/'), xi: at('../xi-clean/'), train: at('../lx-train/') };

/* ── 판 — 왼쪽(내 프로젝트 · 우리 서비스) · 오른쪽(요청함 · 바로 분석하기 · 최근 활동) ── */
const head = (title, more, sub) => h('div.ld-h', {}, h('h2', {}, title, sub || null), more || null);
const moreLink = (text, href) => h('a.ld-more', { href, text });
const mineMore = moreLink('전체 보기', PROJECTS);
const mine = h('section.t-card.ld-card.lc-mine', { 'aria-label': '내 프로젝트' }, head('내 프로젝트', mineMore), h('div.ld-prs'),
  h('div.ld-foot', {}, h('button.ld-new', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() })));
const svcSub = h('small.ld-sub');
const svc = h('section.t-card.ld-card.ld-svc', { 'aria-label': '우리 서비스' }, head('우리 서비스', moreLink('서비스 카드', STAFF_HREF.cards), svcSub), h('div.ld-strip'), h('div.ld-issues'));
const inbox = h('section.t-card.ld-card.ld-inbox', { 'aria-label': '요청함' }, head('요청함', moreLink('전체', STAFF_HREF.inbox)), h('div.ld-cells'));
const pickEl = h('div.ld-pick');
const goBtn = h('button.t-btn.ld-go', { type: 'button', text: '분석하기' });
const quick = h('section.t-card.ld-card.ld-quick', { 'aria-label': '바로 분석하기' }, head('바로 분석하기', moreLink('카드 고르기', STAFF_HREF.analyze)),
  h('div.ld-go-row', {}, pickEl, goBtn));
const act = h('section.t-card.ld-card.ld-act', { 'aria-label': '최근 활동' }, head('최근 활동'), h('ul.ld-acts'));
const page = h('div.ld', {}, h('div.ld-grid', {}, h('div.ld-col.ld-col--l', {}, mine, svc), h('div.ld-col.ld-col--r', {}, inbox, quick, act)));
S.main.append(page);
const wait = (el) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (el, retry) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };
for (const el of [mine.querySelector('.ld-prs'), svc.querySelector('.ld-strip'), inbox.querySelector('.ld-cells'), act.querySelector('.ld-acts')]) wait(el);

/* 공용 자료(한 번) — 카드 · 배포 · 지역 이름 */
const once = (f) => { let p = null; return () => (p ||= f()); };
const cardsP = once(() => api('/registry/cards').catch(() => null));
const deploysP = once(() => api('/deploys').catch(() => null));
const regionsP = once(() => K.loadRegions().catch(() => []));
const isTest = (d) => /-test(-\d+)?$/.test(String(d?.id || '')) || !!d?.test;
const LIVE = new Set(['ga', 'canary', 'shadow']);
/* 서비스 이름 — 서비스 관리 · LX 관리자 화면과 같은 규칙(lx-console/data.js cardName 과 같은 말) */
const nameOf = (c) => say(c?.name || '').replace(/\s*\((해외|global)\)/i, '').replace(/\s*(행정서비스|서비스)$/, '') || '서비스';
const shortRegion = (s) => String(s || '').trim().split(/\s+/).pop() || '';

/* 시각 — 오늘 HH:MM · 어제 HH:MM · 그 밖 MM.DD */
const two = (n) => String(n).padStart(2, '0');
function when(s) {
  const d = new Date(s || ''); if (Number.isNaN(+d)) return '';
  const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return hm;
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${two(d.getMonth() + 1)}.${two(d.getDate())}`;
}

drawMine();
drawInbox();
drawQuick();
drawServices();
drawActs();
window.__lxConsole = { ready: true };                 // e2e 관측(읽기 전용)
document.documentElement.dataset.consoleReady = '1';

/* ── ① 내 프로젝트 — 줄마다 이름 · 지역 · 6칸 진행 막대(끝난 칸 잉크 · 지금 칸 파랑) · 지금 단계 · 다음 할 일 ── */
async function drawMine() {
  const box = mine.querySelector('.ld-prs');
  const MAX = 3;
  let j;
  try { j = await api('/projects?scope=mine'); } catch { fail(box, () => { wait(box); drawMine(); }); return; }
  S.fresh(j.as_of);
  const items = j.items || [];
  mineMore.textContent = items.length > MAX ? `전체 보기 ${items.length}` : '전체 보기';
  mine.querySelector('.ld-foot').hidden = !items.length;           // 비었을 때는 빈 화면의 '새 프로젝트' 하나만
  if (!items.length) {
    const x = h('div'); box.replaceChildren(x);
    K.empty(x, { kind: 'first', title: '진행 중인 프로젝트가 없습니다', compact: true, action: { label: '새 프로젝트', onClick: () => openNewProject() } });
    return;
  }
  const rows = items.slice(0, MAX).map((p) => {
    const where = p.regions?.length ? p.regions[0].name + (p.regions.length > 1 ? ` 외 ${p.regions.length - 1}곳` : '') : '';
    const seg = h('span.ld-seg', { 'aria-hidden': 'true' }, ...STAGES.map(() => h('i')));
    const n = (p.stage?.index ?? 0) + 1;
    const a = h('a.lc-pr', { href: stageHref(p, p.next?.stage, p.next?.target), dataset: { stage: p.stage?.key || '' },
      'aria-label': `${p.name} · ${where} · 지금 단계 ${n} ${p.stage?.label || ''} · 다음 할 일 ${p.next?.text || ''}` },
      h('span.ld-pr-nm', {}, h('b.lc-pr-n', { text: p.name }), where ? h('small', { text: where }) : null),
      seg,
      h('span.lc-pr-s.ld-pr-st', {}, h('i.num', { text: String(n) }), h('span', { text: p.stage?.label || '' })),
      p.next?.text ? h('span.lc-pr-x.ld-pr-nx', { html: esc(p.next.text).replace(/(\d[\d,]*\s?(?:필지|건|곳|개)?)/g, '<b>$1</b>') }) : null);
    /* 막대 — 프로젝트 한 장(서버 판정: 단계마다 완료 · 지금 · 대기)을 받아 칠한다 */
    loadProject(p.id).then((pr) => {
      const st = pr?.stages || [];
      [...seg.children].forEach((i, k) => { i.dataset.st = k === pr?.stage?.index ? 'now' : st[k]?.done ? 'done' : 'wait'; });
    }).catch(() => {});
    return a;
  });
  box.replaceChildren(...rows);
}

/* ── ② 요청함 — 검토 요청 · 분석 의뢰 · 내 결재(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) ── */
async function drawInbox() {
  const box = inbox.querySelector('.ld-cells');
  const c = await requestCounts().catch(() => null);
  if (!c || c.total === null) { fail(box, () => { wait(box); requestCounts({ force: true }); drawInbox(); }); return; }
  const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
    h('b.num', { text: v === null ? '—' : String(v) }), h('span', { text: label }));
  box.replaceChildren(cell(c.review, '검토 요청', ''), cell(c.request, '분석 의뢰', '#requests'), cell(c.approval, '내 결재', '#approvals'));
}

/* ── ④ 바로 분석하기 — 어디 한 칸 + '분석하기'(이 화면의 1차 버튼 하나) → 분석하기(그 지역에 쓸 수 있는 카드) ── */
async function drawQuick() {
  let region = null;
  goBtn.addEventListener('click', () => { location.href = STAFF_HREF.analyze + (region ? '?region=' + encodeURIComponent(region.sgg_cd) : ''); });
  await K.regionPicker(pickEl, { onPick: (r) => { region = r; } }).catch(() => null);
  pickEl.querySelector('input')?.setAttribute('aria-label', '어디 — 시군구 이름을 검색');
}

/* ── ③ 우리 서비스 — 운영 · 시범 · 지역 수 · 실제 결과 장면 넷 · 살펴볼 것(재학습 필요 · 영상 없는 지역) ── */
async function drawServices() {
  const strip = svc.querySelector('.ld-strip'), issues = svc.querySelector('.ld-issues');
  const [cj, dj, sum, fb, rules, vis, deck] = await Promise.all([cardsP(), deploysP(), summary().catch(() => null),
    api('/feedback?since=30d').catch(() => null), api('/survey/rules').catch(() => null),
    fetch(new URL('../service-detail/data/visuals.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    /* 서비스 카드 한 벌(14차 카드-1 ⓐ · kit/service-card.js 덱) — 있으면 장면 · 상태 · 어디를 거기서(서비스 카드 화면과 같은 값) · 없으면 지금 자료로 */
    import('../kit/service-card.js').then((m) => (typeof m.loadDeck === 'function' ? m.loadDeck() : null)).catch(() => null)]);
  if (!cj || !dj) { fail(strip, () => { wait(strip); drawServices(); }); return; }
  const cards = cj.items || [];
  const deploys = (dj.items || []).filter((d) => !isTest(d));
  const live = deploys.filter((d) => LIVE.has(d.stage));
  const D = new Map((deck?.items || []).map((c) => [c.id, c]));      // 카드 한 벌의 덱(서버) — 있으면 상태 · 장면 · 어디는 이것이 정본
  const stOf = (c) => (D.get(c.id)?.state ? { ga: '운영', pilot: '시범', none: '첫 결과 전' }[D.get(c.id).state] : c.status_label);
  const n = (lab) => cards.filter((c) => stOf(c) === lab).length;
  const places = new Set(live.map((d) => d.sgg_cd || d.region_profile || d.tenant_id)).size;
  svcSub.textContent = `운영 ${n('운영')} · 시범 ${n('시범')} · ${places}곳`;

  /* 장면 — 실제 결과 장면만(서비스 소개 화면의 결과 히어로 → 서버 결과 크롭). 없으면 회백 판(그림을 지어내지 않는다) */
  const own = new URL('../service-detail/data/img/', import.meta.url).pathname;
  const sceneOf = (c) => {
    const ds = D.get(c.id)?.scene?.src;
    if (D.size) return ds ? (String(ds).startsWith('/api/') ? API.base + ds : ds) : null;     // 덱이 있으면 덱의 장면만(없으면 회백 판)
    const hero = vis?.hero?.[c.id]?.img;
    if (hero) return /^\/|^https?:/.test(hero) ? hero : own + hero;
    if (c.crop_url) { try { const u = new URL(c.crop_url, location.href); return u.pathname.startsWith('/files/') ? u.pathname : u.href; } catch { return null; } }
    return null;
  };
  const due = dueSets(fb?.items || [], { rules: rules?.items || [] });
  const dueCards = new Set(due.map((x) => x.card).filter(Boolean));
  const rep = new Map();                         // 카드 → 기관 신고(서버 요약 · 서비스 관리 표와 같은 값)
  for (const it of sum?.items || []) { const v = it.metrics?.reports?.value; if (Number.isFinite(+v) && +v) rep.set(it.card, (rep.get(it.card) || 0) + +v); }
  const RANK = { 운영: 0, 시범: 1 };
  const lastAt = (c) => deploys.filter((d) => d.card_id === c.id).map((d) => d.updated_at || '').sort().pop() || '';
  const pick = cards.filter((c) => stOf(c) === '운영' || stOf(c) === '시범')
    .sort((a, b) => (RANK[stOf(a)] - RANK[stOf(b)]) || (!!sceneOf(b) - !!sceneOf(a)) || lastAt(b).localeCompare(lastAt(a)))
    .slice(0, 4);
  if (!pick.length) { const x = h('div'); strip.replaceChildren(x); K.empty(x, { kind: 'first', title: '공개한 서비스가 없습니다', compact: true }); }
  else {
    const regs = await regionsP();
    const nm = (code) => regs.find?.((r) => r.sgg_cd === code)?.name || null;
    strip.replaceChildren(...pick.map((c) => {
      const mineD = live.filter((d) => d.card_id === c.id).sort((a, b) => (a.stage === 'ga' ? 0 : 1) - (b.stage === 'ga' ? 0 : 1));
      const names = [...new Set(mineD.map((d) => nm(d.sgg_cd) || shortRegion(d.region_name?.ko || d.region_name)).filter(Boolean))];
      const where = D.get(c.id)?.where || (names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}곳` : '') : '');
      const src = sceneOf(c);
      const sig = [rep.get(c.id) ? `기관 신고 ${rep.get(c.id).toLocaleString('ko-KR')}` : null, dueCards.has(c.id) ? '재학습 필요' : null].filter(Boolean).join(' · ');
      /* 카드 한 벌과 같은 순서 — ① 결과 장면 ② 상태 ③ 어디 ④ 이름 · 그 아래 살펴볼 신호(기관 신고 · 재학습) */
      return h('a.ld-th', { href: V.detail + '?card=' + encodeURIComponent(c.id), dataset: { card: c.id, state: stOf(c) === '운영' ? 'ga' : 'pilot' } },
        h('span.ld-th-img', { class: src ? '' : 'is-blank' }, src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { text: '결과 장면 없음' }),
          h('span.ld-th-chip', { text: stOf(c) })),
        h('span.ld-th-wh', { text: where || ' ' }),
        h('b.ld-th-nm', { text: D.get(c.id)?.name || nameOf(c) }),
        sig ? h('span.ld-th-sig', { text: sig }) : null);
    }));
  }
  /* 살펴볼 것 — 재학습 필요(서비스 관리 큰 숫자와 같은 계산) · 영상 없는 지역(서버 요약의 영상 유무) */
  const noImg = new Set((sum?.items || []).filter((i) => i.imagery && i.imagery.has === false).map((i) => i.sgg_cd || i.region_name)).size;
  const chips = [];
  if (fb) chips.push(h('a.ld-chip', { href: V.deploy + '?tab=ops#ops', class: due.length ? 'is-warn' : '', text: `재학습 필요 ${due.length}` }));
  if (sum) chips.push(h('a.ld-chip', { href: V.deploy, text: `영상 없는 지역 ${noImg}곳` }));
  issues.replaceChildren(...(chips.length ? [h('span.ld-issues-k', { text: '살펴볼 것' }), ...chips] : []));
}

/* ── ④ 최근 활동 — 끝난 분석 · 결과 갱신 · 학습(작업 기록 · 끝난 시각) · 지역마다 가장 최근 한 줄 ── */
async function drawActs() {
  const box = act.querySelector('.ld-acts');
  let j;
  try { j = await api('/jobs?limit=60'); } catch { fail(box, () => { wait(box); drawActs(); }); return; }
  const [cj, regs] = await Promise.all([cardsP(), regionsP()]);
  const cards = cj?.items || [];
  const rname = (code) => (code ? regs.find?.((r) => r.sgg_cd === code)?.name || null : null);
  const jobs = (j.items || []).filter((x) => x.state === 'done' && x.finished_at);
  const byId = new Map(jobs.map((x) => [x.id, x]));
  const seen = new Set();
  const lines = [];
  for (const x of jobs.sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)))) {
    const o = x.options || {};
    const code = o.sgg_cd || o.region || null;
    let card = cards.find((c) => c.id === x.card_id);
    if (!card && o.ai_job_id) card = cards.find((c) => c.id === byId.get(o.ai_job_id)?.card_id);
    const place = rname(code);
    let what = null, href = null;
    if (x.kind === 'train') { what = '모델 학습 끝남'; href = V.train; }
    else if (x.kind === 'survey' && place) { what = '결과 갱신'; href = V.xi + '?region=' + encodeURIComponent(code); }
    else if (x.kind === 'infer' && place) { what = 'AI 분석 끝남'; href = V.xi + '?region=' + encodeURIComponent(code); }
    if (!what) continue;
    const key = x.kind === 'train' ? 'train' : 'r:' + code;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(h('li', {}, h('a', { href }, h('span.ld-when.num', { text: when(x.finished_at) }),
      h('span', {}, card ? h('b', { text: nameOf(card) + ' ' }) : null, [place, what].filter(Boolean).join(' ')))));
    if (lines.length >= 3) break;
  }
  if (!lines.length) { const x = h('div'); box.replaceChildren(x); K.empty(x, { kind: 'first', title: '최근 활동이 없습니다', compact: true }); return; }
  box.replaceChildren(...lines);
}
