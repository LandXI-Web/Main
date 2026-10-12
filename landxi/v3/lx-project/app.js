/* lx-project — 프로젝트 목록 · 관리 · 한 장(구현 2차 T1 · 확인 대장 R-D3 · 갈림길 ⓐ · 4차 P1 · 5차 역할-3 ⓑ · 6차 흐름-1 · 10차 메뉴-1 ⓐ · J-1).
   왼쪽 메뉴 = LX 직원 메뉴('프로젝트' 불) · 한 장에서는 마스트 아래 한 줄에 그 프로젝트의 단계 6(context.js) — 생산 6단계는 메뉴가 아니라 프로젝트 안.
   ?project= 없음 = 목록·관리: 내가 만든 · 참여한 · 보관(끝난 것) · 전체 · 새 프로젝트(사용자 10-01 "기존 내가 만든 프로젝트는 어디에서 관리하는지?")
                 = 프로젝트 진행 현황 = 분석 서비스 카드와 같은 카드(원칙 219 · 10-12) · 단계 칩(?stage=) · 찾기 · 한 페이지 2 · 4 · 6 · 8장
                 새 프로젝트 = 한 창(원칙 220 · new.js) → 만들면 바로 그 프로젝트 '학습데이터 구축'
   ?project=  있음 = 한 장: 지금 단계 · 다음 할 일 하나(그 단계 화면으로) · 단계 6(완료 조건 자동 판정 — 서버) · 사람(프로젝트장 · 구성원) · 재학습 · 기록 · 보관
              구현 5차(확인 17차 — 배치는 그대로 두고 칸 안만): 사람의 '넘기기'(P-5 ⓐ) · 재학습 근거 띠 + 사유 창(P-3 ⓐ) · 기록 · 메모 · 파일 최근 3줄 + 서랍(P-4 ⓐ) — sheets.js
   맨 위 알림 한 줄(프로젝트장을 넘겨받음 — context.js projectNotices · 대시보드 '내 프로젝트'와 같은 부품)
   숫자·판정은 전부 서버(GET /projects · /projects/{id}). 부품 = 키트(셸 · 관문 · 표 · 스텝퍼 · 빈 화면 · 토스트 · 가운데 창 · 서랍)만 조합. */
import * as K from '../kit/index.js';
import { h, api, API, session } from '../kit/util.js';
import { loadDeck } from '../kit/service-card.js';
import { PID, projectRail, attachProject, refreshRail, stageHref, projectHref, loadProject, projectNotices, units } from './context.js';
import { staffMenu, STAFF_HREF } from '../kit/lx-menu.js';
import { GROUPS, N, groupOf, seg4El, doneN, kick, ago, sortBy } from './board.js';
import { openNewProject } from './new.js';
import { retrainCard, logCard, openHandover } from './sheets.js';

const who = await K.gate('lx-console');                  // 들어오는 사람 = LX 직원 대시보드와 같다(LX 직원 · 관리자)
const Q = new URLSearchParams(location.search);
const rail = projectRail(null) || staffMenu('projects');
const S = K.shell({ who, home: 'lx-project', rail });
K.devDrawer({ who });
const page = h('div.lxp-page');
S.main.append(page);

const stageText = (p) => (p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '—');


/* ── 목록 · 관리 — 프로젝트 진행 현황 = 분석하기의 분석 서비스 카드와 같은 틀(원칙 219 · 10-12) ─────────
   카드 한 장 = 그림(이 프로젝트 서비스의 결과 장면 · 이은 영상 — 없으면 대상 지역 영상 · 그것도 없으면 '그림 없음') → 이름 → 무엇을(설명) →
   여섯 단계 막대 + 지금 단계 → 학습 데이터 n장 · AI 모델 정확도 → 대상지 → 구성원 · 마지막 활동 → 열기(지금 단계 화면) · 프로젝트 →.
   카드를 누르면 그 프로젝트의 지금 단계 화면으로. 숫자는 모두 서버(GET /projects — 대시보드 진행 현황과 같은 값 · 서비스가 있으면 정확도 · 그림은 분석하기 카드 덱과 같은 값).
   부품 = 분석하기 카드 CSS(lx-analyze/analyze.css .la-ac · kit/service-card.css .k-sc) 그대로 + 단계 줄 · 사람 줄만 더함(project.css .lxp-pc).
   거르기 = 묶음 탭(내 프로젝트 · 내가 만든 · 참여한 · 보관 · 전체 ?scope=) · 단계 칩(?stage=) · 찾기 · 한 페이지 2 · 4 · 6 · 8장(분석하기와 같은 고르기 · 이 브라우저에 기억). */
const PER = [2, 4, 6, 8];
function readPer() { try { const n = +localStorage.getItem('lx-project.per'); return PER.includes(n) ? n : 4; } catch { return 4; } }
function savePer(n) { try { localStorage.setItem('lx-project.per', String(n)); } catch { /* 저장 못 해도 화면은 그대로 */ } }
const thumbs = new Map();
function authPic(path) {               // LX 계정만 받는 그림(영상 썸네일) — 세션을 실어 받는다(분석하기 영상 고르기와 같은 길)
  if (!thumbs.has(path)) {
    thumbs.set(path, (async () => {
      const s = session.get();
      const r = await fetch(API.prefix + path, { headers: s ? { authorization: 'Bearer ' + s.token } : {} });
      if (!r.ok || r.status === 204) return null;
      const b = await r.blob();
      return b.size ? URL.createObjectURL(b) : null;
    })().catch(() => null));
  }
  return thumbs.get(path);
}
const nf = (v) => Number(v).toLocaleString('ko-KR');
function peopleWord(ps = []) {
  if (!ps.length) return '—';
  const names = ps.map((x) => x.name || x.role_label);
  return names.length > 2 ? `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}명` : names.join(' · ');
}

function projCard(p, deckBy) {
  const archived = p.state === 'archived';
  const go = archived ? projectHref(p.id) : stageHref(p, p.next?.stage || p.stage?.key, p.next?.target);
  const svc = p.card ? deckBy.get(p.card) : null;            // 이 프로젝트가 만든 서비스(분석하기 카드 덱) — 결과 장면 · 정확도는 그 카드와 같은 값
  const pic = h('div.k-sc-crop.la-ac-pic');
  const blank = () => { const keep = [...pic.querySelectorAll('.la-ac-cat, .k-sc-flag')]; pic.classList.add('is-blank'); pic.replaceChildren(h('span.k-sc-blank', { text: '그림 없음' }), ...keep); };
  const scene = svc?.scene?.src ? (String(svc.scene.src).startsWith('/api/') ? API.base + svc.scene.src : svc.scene.src) : null;
  if (scene) pic.append(h('img', { src: scene, alt: '', loading: 'lazy', decoding: 'async', onerror: blank }));
  else if (p.pic) authPic(p.pic).then((u) => { if (u) pic.prepend(h('img', { src: u, alt: '', decoding: 'async', onerror: blank })); else blank(); });
  else blank();
  const st = p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '';
  pic.append(h('div.la-ac-cat', {}, h('span', { text: archived ? '보관' : st })));
  const k = archived ? null : kick(p);
  if (k?.kind === 'warn') pic.append(h('span.k-sc-flag', { text: k.text }));
  const acc = svc?.model?.acc?.value ?? p.acc?.value ?? null;
  const tn = p.train_n?.value ?? null;
  const regs = p.regions || [];
  const regText = regs.length ? (regs.length > 3 ? `${regs.slice(0, 3).map((g) => g.name).join(' · ')} 외 ${regs.length - 3}곳` : regs.map((g) => g.name).join(' · ')) : '영상이 등록되면 정해집니다';
  const line = p.description || p.task || '';
  const el = h('article.k-sc.la-ac.lxp-pc', { dataset: { kind: 'project', id: p.id, stage: GROUPS[groupOf(p)].key }, tabindex: '0', 'aria-label': `${p.name} · ${archived ? '보관' : st}` },
    pic,
    h('div.k-sc-b.la-ac-b', {},
      h('h3.k-sc-t', { text: p.name }),
      h('p.k-sc-line.la-ac-line', { text: line, title: line }),
      h('div.lxp-pc-st', {}, archived ? null : seg4El(p),
        h('span.lxp-pc-w', {}, archived ? h('b', { text: '보관한 프로젝트' }) : h('b', { text: `지금 ${st}` }),
          archived ? null : h('small.num', { text: ` · ${doneN(p)}/${N}` }), k?.kind === 'wait' ? h('small', { text: ` · ${k.text}` }) : null)),
      h('div.la-ac-hero', {},
        h('div', {}, tn === null ? h('b', { text: '—' }) : h('b.num', {}, nf(tn), h('i', { text: '장' })), h('small', { text: '학습 데이터' })),
        h('div', {}, acc === null ? h('b', { text: '—' }) : h('b.num', {}, String(acc), h('i', { text: '%' })), h('small', { text: 'AI 모델 정확도' }))),
      h('div.la-ac-where', {}, h('span.k', { text: regs.length ? `대상지 ${regs.length}곳` : '대상지' }), h('span.v', { text: regText, title: regs.map((g) => g.full || g.name).join(' · ') })),
      h('div.lxp-pc-meta', {},
        h('span', { title: (p.people || []).map((x) => x.name).join(' · ') }, h('span.k', { text: '구성원' }), h('span.v', { text: peopleWord(p.people) })),
        h('span', {}, h('span.k', { text: '마지막 활동' }), h('span.v.num', { text: ago(p.last_at || p.updated_at) }))),
      h('div.k-sc-acts', {}, h('a.t-btn.k-sc-go', { href: go, text: '열기' }), h('a.k-sc-more', { href: projectHref(p.id), text: '프로젝트 →' }))));
  el.addEventListener('click', (e) => { if (!e.target.closest('a')) location.href = go; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) location.href = go; });
  return el;
}

async function list() {
  const TABS = [['mine', '내 프로젝트'], ['led', '내가 만든'], ['joined', '참여한'], ['archived', '보관'], ['all', '전체']];
  const fromBoard = Q.get('from') === 'board';
  page.classList.add('lxp-page--pg', 'lxp-page--cards');
  const sub = h('p.lxp-pg-s');
  const head = h('header.lxp-head.lxp-head--row.lxp-head--pg', {},
    h('div.lxp-pg-h', {}, fromBoard ? h('a.lxp-back', { href: STAFF_HREF.home, text: '대시보드' }) : null, h('h1.t-h3', { text: '프로젝트 진행 현황' }), sub),
    h('button.t-btn.lxp-newb', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() }));
  const tabs = h('div.lxp-tabs', { role: 'tablist', 'aria-label': '프로젝트 묶음' });
  const notes = h('div.lxp-ntcs');
  const tools = h('div.la-tools.lxp-tools');
  const chipsEl = h('div.la-chips', { role: 'group', 'aria-label': '단계 거르기' });
  const viewEl = h('div.la-view', { role: 'group', 'aria-label': '보기 개수' });
  const search = h('input.t-input.la-search', { type: 'search', placeholder: '프로젝트 이름 · 대상지', 'aria-label': '프로젝트 찾기', autocomplete: 'off' });
  tools.append(chipsEl, h('div.la-tools-r', {}, viewEl, search));
  const body = h('section.lxp-cards', { 'aria-label': '프로젝트' });
  const grid = h('div.la-acg.lxp-grid-c');
  const pager = h('nav.la-pager', { 'aria-label': '페이지' });
  page.append(head, notes, tabs, tools, body);
  projectNotices(notes);
  let scope = TABS.some(([k]) => k === Q.get('scope')) ? Q.get('scope') : null;
  let stage = GROUPS.some((g) => g.key === Q.get('stage')) ? Q.get('stage') : null;
  const F = { q: '', per: readPer(), page: 1 };
  let counts = null, items = [];
  const deckP = loadDeck().catch(() => null);
  let deckBy = new Map();
  const setQ = () => {
    const u = new URL(location.href);
    for (const [k, v] of [['scope', scope], ['stage', stage]]) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
    u.searchParams.delete('sort');
    history.replaceState(null, '', u);
  };
  const drawTabs = () => {
    tabs.innerHTML = '';
    for (const [k, l] of TABS) {
      const n = counts?.[k]?.value;
      const b = h('button.lxp-tab', { type: 'button', role: 'tab', 'aria-selected': String(k === scope), dataset: { k } },
        h('span', { text: l }), n !== undefined ? h('b.num', { text: String(n) }) : null);
      b.addEventListener('click', () => { if (k !== scope) show(k); });
      tabs.append(b);
    }
  };
  const archived = () => scope === 'archived';
  function draw() {
    const gi = archived() ? -1 : GROUPS.findIndex((g) => g.key === stage);
    chipsEl.hidden = archived();
    chipsEl.replaceChildren(
      h('button.la-chip', { type: 'button', 'aria-pressed': String(gi < 0), onclick: () => { stage = null; F.page = 1; setQ(); draw(); } }, '전체', h('small.num', { text: String(items.length) })),
      ...GROUPS.map((g, i) => h('button.la-chip', { type: 'button', 'aria-pressed': String(gi === i), dataset: { key: g.key },
        onclick: () => { stage = gi === i ? null : g.key; F.page = 1; setQ(); draw(); } },
        `${i + 1} ${g.label}`, h('small.num', { text: String(items.filter((p) => groupOf(p) === i).length) }))));
    viewEl.replaceChildren(h('span.la-view-k', { text: '한 페이지' }),
      ...PER.map((k) => h('button.la-view-b.num', { type: 'button', 'aria-pressed': String(F.per === k), 'aria-label': `한 페이지 ${k}장`,
        onclick: () => { F.per = k; F.page = 1; savePer(k); draw(); } }, String(k))),
      h('span.la-view-u', { text: '장' }));
    grid.dataset.n = String(F.per);
    const q = F.q.replace(/\s+/g, '');
    const rows = sortBy(items.filter((p) => (gi < 0 || groupOf(p) === gi)
      && (!q || [p.name, p.task, p.description, ...(p.regions || []).map((g) => g.name)].some((s) => String(s || '').replace(/\s+/g, '').includes(q)))), 'kick');
    if (!rows.length) {
      pager.replaceChildren();
      const x = h('div');
      body.replaceChildren(x);
      K.empty(x, { kind: 'first', compact: true, title: q ? '맞는 프로젝트가 없습니다' : gi >= 0 ? `${GROUPS[gi].label} 단계의 프로젝트가 없습니다` : '프로젝트가 없습니다' });
      return;
    }
    const pages = Math.max(1, Math.ceil(rows.length / F.per));
    F.page = Math.min(Math.max(1, F.page), pages);
    const from = (F.page - 1) * F.per;
    grid.replaceChildren(...rows.slice(from, from + F.per).map((p) => projCard(p, deckBy)));
    const goP = (n) => { F.page = n; draw(); };
    const pb = (label, n, cls = '', aria) => h(`button.la-pg${cls}`, { type: 'button', disabled: n < 1 || n > pages || undefined,
      'aria-current': n === F.page && !cls ? 'page' : undefined, 'aria-label': aria, onclick: () => goP(n) }, label);
    pager.replaceChildren(...(pages > 1 ? [pb('‹', F.page - 1, '.ar', '앞 페이지'),
      ...Array.from({ length: pages }, (_, i) => pb(String(i + 1), i + 1, '', `${i + 1}페이지`)),
      pb('›', F.page + 1, '.ar', '다음 페이지')] : []),
      h('small', { text: pages > 1 ? `${rows.length}개 가운데 ${from + 1}–${Math.min(from + F.per, rows.length)}` : `${rows.length}개 모두 한 페이지에` }));
    body.replaceChildren(grid, pager);
  }
  search.addEventListener('input', () => { F.q = search.value.trim(); F.page = 1; draw(); });
  async function show(k) {
    scope = k;
    setQ();
    drawTabs();
    body.innerHTML = ''; const w = h('div'); body.append(w); K.empty(w, { kind: 'loading' });
    let j;
    try { j = await K.during(api('/projects?scope=' + k)); } catch (e) { body.innerHTML = ''; const x = h('div'); body.append(x); K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', onRetry: () => show(k) }); return; }
    const deck = await deckP;
    deckBy = new Map((deck?.items || []).map((c) => [c.id, c]));
    counts = j.counts || counts; drawTabs();
    S.fresh(j.as_of);
    items = j.items || [];
    const left = items.filter((p) => kick(p)?.kind === 'warn').length;
    const led = items.filter((p) => p.lead_is_me).length;
    sub.replaceChildren(units(archived() ? `보관 ${items.length}` : [`진행 중 ${items.length}`, k === 'mine' || k === 'all' ? `내가 맡은 ${led}` : null, `남은 일 있는 프로젝트 ${left}`].filter(Boolean).join(' · ')));   // 덩어리 사이에서만 꺾임(규칙 9)
    tools.hidden = !items.length;
    if (!items.length) {
      body.innerHTML = '';
      const x = h('div'); body.append(x);
      const words = { mine: '진행 중인 내 프로젝트가 없습니다', led: '내가 만든 프로젝트가 없습니다', joined: '참여한 프로젝트가 없습니다', archived: '보관한 프로젝트가 없습니다', all: '진행 중인 프로젝트가 없습니다' };
      K.empty(x, { kind: 'first', title: words[k], action: k === 'archived' || k === 'joined' ? null : { label: '새 프로젝트', onClick: () => openNewProject() } });
      return;
    }
    draw();
  }
  /* 첫 묶음 — 주소(?scope=)가 없으면 내 프로젝트(내가 만든 · 참여한 진행 중 — 대시보드 진행 현황과 같은 묶음) */
  await show(scope || 'mine');
  document.documentElement.dataset.projects = '1';
  if (Q.get('new') === '1') openNewProject();   // 옛 주소(대시보드 '새 프로젝트' 등 ?new=1) → 새 프로젝트 한 창
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ── 한 장 ──────────────────────────────────────────────── */
async function one() {
  const wait = h('div'); page.append(wait);
  K.empty(wait, { kind: 'loading' });
  const pr = await attachProject(S, rail, null);
  wait.remove();
  if (!pr) {
    const x = h('div'); page.append(x);
    K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', onRetry: () => location.reload() });
    return;
  }
  draw(pr);
}

function draw(pr) {
  S.fresh(pr.as_of);
  page.innerHTML = '';
  const archived = pr.state === 'archived';
  const round = pr.round?.value || 1;
  /* 머리 — 이름 · 무엇을 · 어디 · 회차 */
  const meta = h('div.lxp-meta', {}, h('span.t-chip', { text: pr.task }),
    ...pr.regions.map((g) => h('span.t-chip', { dataset: { lv: 'wait' }, title: g.full || g.name, text: g.name })),
    round > 1 ? h('span.t-chip', { text: `${round}차` }) : null);
  page.append(h('header.lxp-head', {}, h('p.t-label', { text: archived ? '프로젝트 · 보관' : '프로젝트' }), h('h1.t-h3.lxp-title', { text: pr.name }), meta));

  const grid = h('div.lxp-grid'); page.append(grid);
  const left = h('div.lxp-col'), right = h('div.lxp-col');
  grid.append(left, right);

  /* 지금 할 일 — 다음 할 일 하나 + 그 단계 화면 */
  const nx = pr.next || {};
  const now = pr.stages?.find((s) => s.key === nx.stage) || null;
  const nowCard = h('section.t-card.lxp-now', { 'aria-label': '지금 할 일' },
    h('p.t-label', { text: archived ? '보관한 프로젝트' : `지금 단계 · ${stageText(pr)}` }),
    h('p.lxp-next', { text: archived ? '다시 열면 이어서 할 수 있습니다' : nx.text || '—' }));
  if (now?.reason) nowCard.append(h('p.lxp-why', { text: `사유: ${now.reason}` }));
  const goRow = h('div.lxp-acts');
  if (!archived) {
    goRow.append(h('a.t-btn.lxp-go', { href: stageHref(pr, nx.stage, nx.target), text: `${now?.label || '단계'} 열기` }));
    nowCard.append(goRow);
  }
  left.append(nowCard);
  /* 결과 확인(원칙 203 · 10-12) — '확인했음' 기록 없이 지도에서 결과를 보는 길만. 끝난 추론이 있으면 '지금 할 일' 옆에 작은 길 하나 */
  const rvS = pr.stages?.find((s) => s.key === 'review');
  if (!archived && rvS?.target?.job) goRow.append(h('a.t-btn.t-btn--2.lxp-go', { href: stageHref(pr, 'review', rvS.target), text: '지도에서 결과 보기' }));

  /* 단계 6 — 마스트 아래 한 줄(context.js · 단계 화면들과 같은 막대 · 완료 조건은 서버 판정) */

  /* 사람 — 프로젝트장(넘기기 = 프로젝트장 본인 · LX 관리자 — P-5 ⓐ) · 구성원(더하기 · 빼기 = 프로젝트장) */
  const ppl = h('section.t-card.lxp-people', { 'aria-label': '사람' }, h('h2.lxp-h', { text: '사람' }));
  const leadRow = h('div.lxp-row', {}, h('span.t-label', { text: '프로젝트장' }), h('span.lxp-who', { text: whoText(pr.lead) }));
  if (pr.can?.lead && !archived) {
    leadRow.classList.add('lxp-row--act');
    leadRow.append(h('button.lxp-link', { type: 'button', text: '넘기기', onclick: () => openHandover(pr, { onDone: (out) => { draw(out); refreshRail(S, rail, out, null); } }) }));
  }
  ppl.append(leadRow);
  const memRow = h('div.lxp-row.lxp-row--top', {}, h('span.t-label', { text: '구성원' }));
  const memList = h('div.lxp-mems');
  for (const m of pr.members || []) {
    const chip = h('span.t-chip.lxp-mem', {}, h('span', { text: whoText(m) }));
    if (pr.can?.members && !archived) {
      const x = h('button.lxp-x', { type: 'button', 'aria-label': `${m.name} 빼기`, text: '×' });
      x.addEventListener('click', () => act(() => api(`/projects/${pr.id}/members/${encodeURIComponent(m.id)}`, { method: 'DELETE' }), '구성원을 뺐습니다'));
      chip.append(x);
    }
    memList.append(chip);
  }
  if (!(pr.members || []).length) memList.append(h('span.lxp-none', { text: '없음' }));
  memRow.append(memList);
  ppl.append(memRow);
  if (pr.can?.members && !archived) peoplePicker(ppl, pr);
  right.append(ppl);

  /* 재학습 — 공개된 서비스만 · 프로젝트장만(역할-3 ⓑ · 구현 확인 2차 J-2 — 서버도 같은 규칙으로 막는다) · 배포는 LX 관리자 승인.
     근거 = 시간 띠 하나 + 칩 셋(서버 basis) · 사유는 '재학습 시작'을 누를 때 작은 창에서 하나(P-3 ⓐ — sheets.js) */
  if (pr.published && !archived) {
    right.append(retrainCard(pr, {
      onStart: (p2) => { const t = p2.stages?.find((s) => s.key === 'train'); location.href = stageHref(p2, 'train', t?.target); },
    }));
  }

  /* 기록 · 메모 · 파일 — 최근 3줄 + 모두 보기 서랍(P-4 ⓐ) · 구성원 · 프로젝트장 · LX 관리자만(서버 판정) */
  if (pr.can?.log) right.append(logCard(pr));

  /* 보관 · 다시 열기 */
  if (pr.can?.archive) {
    const b = h('button.t-btn.t-btn--text.lxp-arch', { type: 'button', text: archived ? '다시 열기' : '끝난 프로젝트로 보관' });
    b.addEventListener('click', () => act(() => api(`/projects/${pr.id}/archive`, { method: 'POST', body: { archived: !archived } }), archived ? '다시 열었습니다' : '보관했습니다'));
    right.append(h('div.lxp-foot', {}, b));
  }
}

function whoText(u) { if (!u) return '—'; return u.name && u.name !== u.role_label ? `${u.name} · ${u.role_label}` : u.role_label || u.name; }

async function act(fn, done) {
  try { const out = await fn(); K.toast(done); draw(out); refreshRail(S, rail, out, null); }
  catch (e) { K.toast(e.message || '바꾸지 못했습니다'); }
}

/** 구성원 더하기 — LX 직원 · 관리자 이름 목록에서 고른다(프로젝트장 넘기기는 사람 칸의 '넘기기' 창 — sheets.js) */
function peoplePicker(host, pr) {
  const sel = h('select.t-input.lxp-sel', { 'aria-label': '더할 구성원' });
  const b = h('button.t-btn.t-btn--2', { type: 'button', text: '구성원 더하기', disabled: true });
  host.append(h('div.lxp-add', {}, sel, b));
  api('/projects/people').then((j) => {
    const have = new Set([pr.lead?.id, ...(pr.members || []).map((m) => m.id)]);
    const opts = (j.items || []).filter((x) => !have.has(x.id));
    sel.innerHTML = '<option value="">구성원 고르기</option>' + opts.map((x) => `<option value="${esc(x.id)}">${esc(whoText(x))}</option>`).join('');
    sel.addEventListener('change', () => { b.disabled = !sel.value; });
  }).catch(() => { sel.disabled = true; });
  b.addEventListener('click', () => {
    if (!sel.value) return;
    act(() => api(`/projects/${pr.id}/members`, { method: 'POST', body: { user_id: sel.value } }), '구성원을 더했습니다');
  });
}

window.__lxProject = { get id() { return PID; }, load: () => loadProject() };   // e2e 관측(읽기 전용)

/* 열기 — 아래 상수(PER · 그림 보관)가 먼저 서도록 맨 끝에서 */
if (PID) await one(); else await list();
