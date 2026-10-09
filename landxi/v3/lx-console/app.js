/* app.js — LX 직원 대시보드(홈) · 확인 대장 10차 홈-1 · 14차 대시보드-1 ⓐ 1안 · 메뉴-1 ⓐ 1안 · 원칙 81 · 90 · 99.
   네 질문에 칸 하나씩(지도 없음): ① 내 프로젝트는 어디까지(6칸 진행 막대 · 지금 단계 · 다음 할 일) ② 기관이 나를 기다리는 것(요청함 숫자 셋)
   ③ 우리 서비스는 어디서 돌고 무엇이 문제(실제 결과 장면 넷 · 살펴볼 것) ④ 지금 무엇을 할까(바로 분석하기 · 최근 활동).
   숫자는 모두 서버에서 — 같은 이름의 숫자는 프로젝트 · 요청함 · 서비스 관리 화면과 같은 한 곳(지어낸 값 0 · 내부 지표 0).
   직원-4 ⓐ(10-09 · 시안 design-r13/lx-staff-v3plus): 칸 셋을 더함 — ⑤ 저장 용량(GET /me/storage — 내 정보 창과 같은 한 출처 · 프로젝트별 막대)
   ⑥ 내가 돌린 작업(GET /me/jobs — 끝남 · 실패 · 취소 · 지금 도는 것 · 종류별 · 최근 몇 건) ⑦ 공지(GET /announcements — LX 관리자가 쓴 실제 글만 · 비면 '새 공지가 없습니다').
   왼쪽 메뉴 = LX 직원 메뉴(kit/lx-menu.js) · '새 프로젝트'는 메뉴 '프로젝트 → 새 프로젝트'와 같은 창(lx-project/new.js · 원칙 99). */
import * as K from '../kit/index.js';
import { h, esc, api, API } from '../kit/util.js';
import { staffMenu, requestCounts, STAFF_HREF } from '../kit/lx-menu.js';
import { stageHref, stepSeg, stuckHtml, nb, ensureCss, projectNotices, HOME as PROJECTS } from '../lx-project/context.js';
import { openNewProject } from '../lx-project/new.js';
import { summary } from './summary.js';
import { say } from './words.js';
import { dueSets } from '../lx-deploy/retrain.js';
import { openMe, storageDonut, quotaGauge, quotaTag, gb } from '../kit/me.js';
import { modal } from '../kit/modal.js';

ensureCss();                                         // 6칸 막대 · 막힌 곳 부품(프로젝트 목록과 같은 것)의 스타일
const who = await K.gate('lx-console');
const S = K.shell({ who, home: 'lx-console', rail: staffMenu('home') });
K.devDrawer({ who });
const at = (p) => new URL(p, import.meta.url).pathname;
const V = { deploy: at('../lx-deploy/'), detail: at('../service-detail/'), xi: at('../xi-clean/'), train: at('../lx-train/') };

/* ── 판 — 왼쪽(내 프로젝트 · 우리 서비스) · 오른쪽(요청함 · 바로 분석하기 · 최근 활동) ── */
const head = (title, more, sub) => h('div.ld-h', {}, h('h2', {}, title, sub || null), more || null);
const moreLink = (text, href) => h('a.ld-more', { href, text });
const mineMore = moreLink('전체 보기', PROJECTS);
const mine = h('section.t-card.ld-card.lc-mine', { 'aria-label': '내 프로젝트' }, head('내 프로젝트', mineMore), h('div.lxp-ntcs'), h('div.ld-prs'),
  h('div.ld-foot', {}, h('button.ld-new', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() })));
const svcSub = h('small.ld-sub');
const svc = h('section.t-card.ld-card.ld-svc', { 'aria-label': '우리 서비스' }, head('우리 서비스', moreLink('서비스 카드', STAFF_HREF.cards), svcSub), h('div.ld-strip'), h('div.ld-issues'));
const inbox = h('section.t-card.ld-card.ld-inbox', { 'aria-label': '요청함' }, head('요청함', moreLink('전체', STAFF_HREF.inbox)), h('div.ld-cells'));
const pickEl = h('div.ld-pick');
const goBtn = h('button.t-btn.ld-go', { type: 'button', text: '분석하기' });
const quick = h('section.t-card.ld-card.ld-quick', { 'aria-label': '바로 분석하기' }, head('바로 분석하기', moreLink('카드 고르기', STAFF_HREF.analyze)),
  h('div.ld-go-row', {}, pickEl, goBtn));
const act = h('section.t-card.ld-card.ld-act', { 'aria-label': '최근 활동' }, head('최근 활동'), h('ul.ld-acts'));
const storeSub = h('small.ld-sub');
const store = h('section.t-card.ld-card.ld-store', { 'aria-label': '저장 용량' },
  head('저장 용량', h('button.ld-more', { type: 'button', text: '내 정보', onclick: () => openMe({ onSaved: () => drawStore(), onStorage: () => drawStore() }) }), storeSub), h('div.ld-store-b'));
const jobsSub = h('small.ld-sub');
const jobs = h('section.t-card.ld-card.ld-jobs', { 'aria-label': '내가 돌린 작업' }, head('내가 돌린 작업', null, jobsSub), h('div.ld-jobs-b'));
const noticeSub = h('small.ld-sub');
const notice = h('section.t-card.ld-card.ld-notice', { 'aria-label': '공지' }, head('공지', null, noticeSub), h('ul.ld-ntc'));
const page = h('div.ld', {}, h('div.ld-grid', {}, h('div.ld-col.ld-col--l', {}, mine, jobs), h('div.ld-col.ld-col--r', {}, inbox, quick, store, act, notice)));
S.main.append(page);
const wait = (el) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'loading', compact: true }).set({ progress: null }); };
const fail = (el, retry) => { const w = h('div'); el.replaceChildren(w); K.empty(w, { kind: 'error', compact: true, onRetry: retry }); };
for (const el of [mine.querySelector('.ld-prs'), svc.querySelector('.ld-strip'), inbox.querySelector('.ld-cells'), act.querySelector('.ld-acts'),
  store.querySelector('.ld-store-b'), jobs.querySelector('.ld-jobs-b'), notice.querySelector('.ld-ntc')]) wait(el);

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
projectNotices(mine.querySelector('.lxp-ntcs'));     // 프로젝트장을 넘겨받았다는 알림 한 줄(확인 17차 P-5 ⓐ — 프로젝트 목록 맨 위와 같은 부품)
drawInbox();
drawQuick();
drawServices();
drawActs();
drawStore();
drawJobs();
drawNotice();
window.__lxConsole = { ready: true };                 // e2e 관측(읽기 전용)
document.documentElement.dataset.consoleReady = '1';

/* ── ① 내 프로젝트 — 줄마다 이름 · 지역 · 6칸 진행 막대(프로젝트 목록과 같은 부품 · 서버 판정 steps) · 지금 단계 · 다음 할 일 · 막힌 곳(같은 규칙) ── */
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
    const n = (p.stage?.index ?? 0) + 1;
    const stuck = p.blocked?.[0]?.text;
    const a = h('a.lc-pr', { href: stageHref(p, p.next?.stage, p.next?.target), dataset: { stage: p.stage?.key || '' },
      'aria-label': `${p.name} · ${where} · 지금 단계 ${n} ${p.stage?.label || ''} · 다음 할 일 ${p.next?.text || ''}${stuck ? ` · 막힌 곳 ${stuck}` : ''}` },
      h('span.ld-pr-nm', {}, h('b.lc-pr-n', { text: p.name }), where ? h('small', { text: where }) : null),
      stepSeg(p.steps),
      h('span.lc-pr-s.ld-pr-st', {}, h('i.num', { text: String(n) }), h('span', { text: p.stage?.label || '' })),
      h('span.ld-pr-ln', {},
        p.next?.text ? h('span.lc-pr-x.ld-pr-nx', { html: esc(nb(p.next.text)).replace(/(\d[\d,]*\s?(?:필지|건|곳|개)?)/g, '<b>$1</b>') }) : null,
        p.blocked?.length ? h('span.ld-pr-sk', { html: stuckHtml(p) }) : null));
    return a;
  });
  box.replaceChildren(...rows);
}

/* ── ② 요청함 — 검토 요청 · 분석 요청 · 보낸 요청(왼쪽 메뉴 '요청함' 숫자와 같은 한 곳) ── */
async function drawInbox() {
  const box = inbox.querySelector('.ld-cells');
  const c = await requestCounts().catch(() => null);
  if (!c || c.total === null) { fail(box, () => { wait(box); requestCounts({ force: true }); drawInbox(); }); return; }
  const cell = (v, label, hash) => h('a.ld-cell', { href: STAFF_HREF.inbox + hash, class: v ? '' : 'is-zero', 'aria-label': `${label} ${v ?? '—'}건` },
    h('b.num', { text: v === null ? '—' : String(v) }), h('span', { text: label }));
  box.replaceChildren(cell(c.review, '검토 요청', ''), cell(c.request, '분석 요청', '#requests'), cell(c.approval, '보낸 요청', '#approvals'));
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
  /* 적용 지역 = 운영 · 시범 서비스의 배포본(운영 · 시범)이 있는 시군구(해외는 지역) 수 — 같은 지역 여러 서비스는 한 곳 */
  const onCards = new Set(cards.filter((c) => ['운영', '시범'].includes(stOf(c))).map((c) => c.id));
  const placeKey = (d) => d.sgg_cd || d.region_profile || d.tenant_id;
  const places = new Set(live.filter((d) => onCards.has(d.card_id)).map(placeKey)).size;
  svcSub.textContent = `운영 ${n('운영')} · 시범 ${n('시범')} · 적용 지역 ${places}곳`;

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
  /* 카드 → 기관 신고. 서비스 관리 표는 배포본(지역)마다 한 줄 — 여기는 그 서비스가 돌고 있는 지역들의 합이라 '(n곳 합)'으로 이름을 밝힌다(숫자 한 출처: 서버 요약) */
  const rep = new Map();
  const liveAt = new Map();                      // 카드 → 돌고 있는 지역(시군구) 모음
  for (const d of live) { if (!liveAt.has(d.card_id)) liveAt.set(d.card_id, new Set()); liveAt.get(d.card_id).add(d.sgg_cd || d.region_profile || d.tenant_id); }
  for (const it of sum?.items || []) {
    const v = it.metrics?.reports?.value;
    if (!Number.isFinite(+v) || !+v || (it.sgg_cd && !liveAt.get(it.card)?.has(it.sgg_cd))) continue;
    rep.set(it.card, (rep.get(it.card) || 0) + +v);
  }
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
      const where = names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}곳` : '') : (D.get(c.id)?.where || '');   // 돌고 있는 곳 전부(대표 지역 외 n곳)
      const src = sceneOf(c);
      const rn = rep.get(c.id);
      const sig = [rn ? `기관 신고 ${rn.toLocaleString('ko-KR')}${names.length > 1 ? `(${names.length}곳 합)` : ''}` : null, dueCards.has(c.id) ? '재학습 필요' : null].filter(Boolean);
      /* 카드 한 벌과 같은 순서 — ① 결과 장면 ② 상태 ③ 어디 ④ 이름 · 그 아래 살펴볼 신호(기관 신고 · 재학습) */
      return h('a.ld-th', { href: V.detail + '?card=' + encodeURIComponent(c.id), dataset: { card: c.id, state: stOf(c) === '운영' ? 'ga' : 'pilot' } },
        h('span.ld-th-img', { class: src ? '' : 'is-blank' }, src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { text: '결과 장면 없음' }),
          h('span.ld-th-chip', { text: stOf(c) })),
        h('span.ld-th-wh', { text: where || ' ' }),
        h('b.ld-th-nm', { text: D.get(c.id)?.name || nameOf(c) }),
        ...sig.map((x) => h('span.ld-th-sig', { text: x })));
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

/* ── ⑤ 저장 용량 — 도넛(가운데 사용량 · 프로젝트별 비중) · 할당 대비 막대 · 증량 신청(직원-7 · 내 정보 창과 같은 부품 · GET /me/storage 한 출처) ── */
const ev = (e) => (e && typeof e === 'object' && 'value' in e ? e.value : e);
async function drawStore() {
  const box = store.querySelector('.ld-store-b');
  let j;
  try { j = await api('/me/storage'); } catch { fail(box, () => { wait(box); drawStore(); }); return; }
  const st = j.storage || {};
  const used = Number(ev(st.used)) || 0, q = ev(st.quota_gb);
  const has = q !== null && q !== undefined;
  storeSub.textContent = has ? `할당 ${gb(q)}` : '할당 없음';
  const ps = j.projects || [];
  const pend = (j.requests || []).find((r) => r.state === 'pending');
  const kids = [storageDonut({ projects: ps, used, quota: q, dia: 132 })];
  const g = quotaGauge(used, q, st.warn);
  if (g) kids.push(g);
  kids.push(h('p.ld-store-s', {}, h('span', { text: ps.length ? `프로젝트 ${ps.length}개의 학습데이터 · 올린 파일.` : '내가 프로젝트장인 프로젝트가 없습니다.' }), ' ',
    h('span', { text: has ? `${quotaTag(st)} — LX 관리자가 정함` : '할당은 LX 관리자가 정합니다' })));
  if (st.warn) kids.push(h('p.ld-warn', { text: `할당의 ${ev(st.pct)}%를 썼습니다` }));
  const foot = h('div.ld-store-a');
  if (pend) foot.append(h('p.ld-store-p', {}, h('span', { text: `증량 신청 중 ${gb(ev(pend.want_gb))} ·` }), ' ', h('span', { text: 'LX 관리자 확인 전' })));
  else if (has) foot.append(h('button.k-me-ask', { type: 'button', text: '용량 증량 신청', onclick: () => openMe({ ask: true, onStorage: () => drawStore(), onSaved: () => drawStore() }) }));
  if (foot.childNodes.length) kids.push(foot);
  box.replaceChildren(...kids);
}

/* ── ⑥ 내가 돌린 작업 — 끝남 · 실패 · 취소 · 지금 도는 것(큰 숫자) · 종류별 막대 · 최근 몇 건(시각 | 무엇 | 상태) ── */
const STATE = { done: '완료', failed: '실패', cancelled: '취소', queued: '대기', running: '진행 중' };
const md = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}.${d.getDate()}`; };
async function drawJobs() {
  const box = jobs.querySelector('.ld-jobs-b');
  let j;
  try { j = await api('/me/jobs?recent=4'); } catch { fail(box, () => { wait(box); drawJobs(); }); return; }
  const c = j.counts || {}, n = (k) => Number(ev(c[k])) || 0;
  const total = n('done') + n('failed') + n('cancelled') + n('running');
  jobsSub.textContent = total && j.first ? `${md(j.first)} – ${md(j.last)}` : '';
  if (!total) { const x = h('div'); box.replaceChildren(x); K.empty(x, { kind: 'first', title: '돌린 작업이 없습니다', compact: true }); return; }
  const cell = (v, label, cls) => h('div.ld-cell.ld-cell--ro', { class: cls }, h('b.num', { text: v.toLocaleString('ko-KR') }), h('span', { text: label }));
  const cells = h('div.ld-cells.ld-cells--2', {},
    cell(n('done'), '완료', n('done') ? '' : 'is-zero'), cell(n('failed'), '실패', n('failed') ? 'is-warn' : 'is-zero'),
    cell(n('cancelled'), '취소', n('cancelled') ? '' : 'is-zero'), cell(n('running'), '진행 중', n('running') ? '' : 'is-zero'));
  const [cj, regs] = await Promise.all([cardsP(), regionsP()]);
  const cards = cj?.items || [];
  const rname = (code) => (code ? regs.find?.((r) => r.sgg_cd === code)?.name || null : null);
  /* 최근 — 시각 | 무엇(서비스 · 지역 · 종류) | 상태. 실패는 경고색 */
  const rows = (j.recent || []).map((x) => {
    const card = cards.find((cc) => cc.id === x.card_id);
    const what = [card ? nameOf(card) : null, rname(x.sgg_cd), x.kind_ko].filter(Boolean).join(' ');
    return h('li', {}, h('span.ld-when.num', { text: when(x.at) }), h('span', { text: what }),
      h('span.ld-st', { class: x.state === 'failed' ? 'is-no' : '', text: STATE[x.state] || '진행' }));
  });
  const recent = h('div.ld-recent', {}, h('p.ld-k', { text: '최근' }), h('ul.ld-rows', {}, ...rows));
  /* 종류별 — 한 줄(AI 분석 275 · 결과 갱신 108 …) */
  const kinds = (j.kinds || []).slice(0, 5).map((k) => h('span', {}, k.label + ' ', h('b.num', { text: k.n.toLocaleString('ko-KR') })));
  box.replaceChildren(h('div.ld-two', {}, cells, recent), ...(kinds.length ? [h('p.ld-kinds', {}, h('span.ld-k', { text: '종류별' }), ...kinds)] : []));
}

/* ── ⑦ 공지 — LX 관리자가 쓴 실제 글(GET /announcements) · 누르면 본문 창. 비면 '새 공지가 없습니다'(지어내지 않는다) ── */
async function drawNotice() {
  const box = notice.querySelector('.ld-ntc');
  let j;
  try { j = await api('/announcements?limit=4'); } catch { fail(box, () => { wait(box); drawNotice(); }); return; }
  const items = j.items || [];
  noticeSub.textContent = j.total > items.length ? `${j.total}건 중 최근 ${items.length}` : '';
  if (!items.length) { box.replaceChildren(h('li.ld-ntc-none', { text: '새 공지가 없습니다' })); return; }
  const day = (s) => { const d = new Date(s || ''); return Number.isNaN(+d) ? '' : `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
  box.replaceChildren(...items.map((a) => h('li', {}, h('button', { type: 'button', onclick: () => {
    const b = h('div.ld-ntc-md', {}, h('p.ld-ntc-by', { text: `${a.by_name} · ${day(a.at)}` }), a.body ? h('p.ld-ntc-tx', { text: a.body }) : null);
    modal({ title: a.title, body: b });
  } }, h('span.ld-when.num', { text: when(a.at) }), h('b', { text: a.title })))));
}
