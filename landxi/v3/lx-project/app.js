/* lx-project — 프로젝트 목록 · 관리 · 한 장(구현 2차 T1 · 확인 대장 R-D3 · 갈림길 ⓐ · 4차 P1 · 5차 역할-3 ⓑ · 6차 흐름-1 · 10차 메뉴-1 ⓐ · J-1).
   왼쪽 메뉴 = LX 직원 메뉴('프로젝트' 불) · 한 장에서는 마스트 아래 한 줄에 그 프로젝트의 단계 6(context.js) — 생산 6단계는 메뉴가 아니라 프로젝트 안.
   ?project= 없음 = 목록·관리: 내가 만든 · 참여한 · 보관(끝난 것) · 전체 · 새 프로젝트(사용자 10-01 "기존 내가 만든 프로젝트는 어디에서 관리하는지?")
                 = 프로젝트 진행 현황(직원-6 4차): 흐름도(네 단계 · ?stage= 거르기) + 표(지금 · 진행 n/4 · 마지막 활동 · 남은 일 · ?sort=) — board.js
   ?project=  있음 = 한 장: 지금 단계 · 다음 할 일 하나(그 단계 화면으로) · 단계 6(완료 조건 자동 판정 — 서버) · 사람(프로젝트장 · 구성원) · 재학습 · 기록 · 보관
              구현 5차(확인 17차 — 배치는 그대로 두고 칸 안만): 사람의 '넘기기'(P-5 ⓐ) · 재학습 근거 띠 + 사유 창(P-3 ⓐ) · 기록 · 메모 · 파일 최근 3줄 + 서랍(P-4 ⓐ) — sheets.js
   맨 위 알림 한 줄(프로젝트장을 넘겨받음 — context.js projectNotices · 대시보드 '내 프로젝트'와 같은 부품)
   숫자·판정은 전부 서버(GET /projects · /projects/{id}). 부품 = 키트(셸 · 관문 · 표 · 스텝퍼 · 빈 화면 · 토스트 · 가운데 창 · 서랍)만 조합. */
import * as K from '../kit/index.js';
import { h, api } from '../kit/util.js';
import { PID, projectRail, attachProject, refreshRail, stageHref, projectHref, loadProject, nb, projectNotices } from './context.js';
import { staffMenu, STAFF_HREF } from '../kit/lx-menu.js';
import { GROUPS, groupOf, flow, seg4El, doneN, kick, ago, sortBy } from './board.js';
import { openNewProject } from './new.js';
import { retrainCard, logCard, openHandover } from './sheets.js';

const who = await K.gate('lx-console');                  // 들어오는 사람 = LX 직원 대시보드와 같다(LX 직원 · 관리자)
const Q = new URLSearchParams(location.search);
const rail = projectRail(null) || staffMenu('projects');
const S = K.shell({ who, home: 'lx-project', rail });
K.devDrawer({ who });
const page = h('div.lxp-page');
S.main.append(page);

const regionWord = (rs = []) => (rs.length ? rs[0].name + (rs.length > 1 ? ` 외 ${rs.length - 1}곳` : '') : '—');
const stageText = (p) => (p.stage ? `${p.stage.index + 1} ${p.stage.label}` : '—');

if (PID) await one(); else await list();

/* ── 목록 · 관리 — 프로젝트 진행 현황(직원-6 4차 · 시안 design-r14/lx-staff-board/progress.html) ─────────
   맨 위 = 대시보드와 같은 흐름도(board.js · 단계 고르기 ?stage=) · 아래 = 표(프로젝트 · 지역 · 담당 · 지금 · 진행 n/4 · 마지막 활동 · 남은 일 · 열기)
   정렬 = 남은 일 먼저(기본 · 남은 일 → 오래된 활동 순) · 마지막 활동 · 이름(?sort=). 묶음 = 내 프로젝트 · 내가 만든 · 참여한 · 보관 · 전체(?scope=) */
async function list() {
  const TABS = [['mine', '내 프로젝트'], ['led', '내가 만든'], ['joined', '참여한'], ['archived', '보관'], ['all', '전체']];
  const SORTS = [['kick', '남은 일 먼저'], ['recent', '마지막 활동'], ['name', '이름']];
  const fromBoard = Q.get('from') === 'board';
  page.classList.add('lxp-page--pg');
  const sub = h('p.lxp-pg-s');
  const head = h('header.lxp-head.lxp-head--row.lxp-head--pg', {},
    h('div.lxp-pg-h', {}, fromBoard ? h('a.lxp-back', { href: STAFF_HREF.home, text: '대시보드' }) : null, h('h1.t-h3', { text: '프로젝트 진행 현황' }), sub),
    h('button.t-btn.lxp-newb', { type: 'button', text: '새 프로젝트', onclick: () => openNewProject() }));
  const tabs = h('div.lxp-tabs', { role: 'tablist', 'aria-label': '프로젝트 묶음' });
  const flowBox = h('section.t-card.lxp-flow', { 'aria-label': '단계 고르기' });
  const body = h('section.t-card.lxp-list');
  const notes = h('div.lxp-ntcs');
  page.append(head, notes, tabs, flowBox, body);
  projectNotices(notes);
  const wait = h('div'); body.append(wait);
  K.empty(wait, { kind: 'loading' });
  let scope = TABS.some(([k]) => k === Q.get('scope')) ? Q.get('scope') : null;
  let stage = GROUPS.some((g) => g.key === Q.get('stage')) ? Q.get('stage') : null;
  let sort = SORTS.some(([k]) => k === Q.get('sort')) ? Q.get('sort') : 'kick';
  let counts = null, items = [];
  const setQ = () => {
    const u = new URL(location.href);
    for (const [k, v] of [['scope', scope], ['stage', stage], ['sort', sort === 'kick' ? null : sort]]) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); }
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
  function drawFlow() {
    flowBox.hidden = archived() || !items.length;
    if (flowBox.hidden) return;
    flowBox.replaceChildren(flow(items, { picked: stage, onPick: (k) => { stage = k; setQ(); drawFlow(); drawTable(); } }));
  }
  function drawTable() {
    const gi = archived() ? -1 : GROUPS.findIndex((g) => g.key === stage);
    const rows = sortBy(gi >= 0 ? items.filter((p) => groupOf(p) === gi) : items, sort);
    const title = archived() ? '보관한 프로젝트' : gi >= 0 ? GROUPS[gi].label : '모든 단계';
    const sortBox = h('div.sb-sort', {}, h('span', { text: '정렬' }), ...SORTS.map(([k, l]) =>
      h('button.t-chip', { type: 'button', 'aria-pressed': String(k === sort), text: l, onclick: () => { sort = k; setQ(); drawTable(); } })));
    const hd = h('div.ld-h.lxp-tb-h', {}, h('h2', {}, title, h('small.ld-sub', { text: `${rows.length}개 · ${SORTS.find(([k]) => k === sort)[1]}` })), sortBox);
    if (!rows.length) {
      const x = h('div');
      body.replaceChildren(hd, x);
      K.empty(x, { kind: 'first', compact: true, title: gi >= 0 ? `${GROUPS[gi].label} 단계의 프로젝트가 없습니다` : '프로젝트가 없습니다' });
      return;
    }
    const tr = rows.map((p) => {
      const k = kick(p);
      return h('tr', { tabindex: '0', dataset: { id: p.id, stage: GROUPS[groupOf(p)].key },
        onclick: (e) => { if (!e.target.closest('a')) location.href = projectHref(p.id); },
        onkeydown: (e) => { if (e.key === 'Enter') location.href = projectHref(p.id); } },
        h('td', {}, h('b.acc-b', { text: p.name })),
        h('td', { title: (p.regions || []).map((g) => g.full || g.name).join(' · '), text: regionWord(p.regions) }),
        h('td.nw', { text: p.lead?.name || '—' }),
        h('td', { text: archived() ? '보관' : nb(p.next?.text || '—') }),
        h('td.nw', {}, archived() ? h('span.sb-none', { text: '—' }) : h('span.sb-prog', {}, seg4El(p), h('small.num', { text: `${doneN(p)}/4` }))),
        h('td.num.nw', { text: ago(p.last_at || p.updated_at) }),
        h('td', {}, k && !archived() ? h('span.sb-kick', { dataset: { kind: k.kind }, text: k.text }) : h('span.sb-none', { text: '—' })),
        h('td.nw', {}, h('a.sb-open-l', { href: projectHref(p.id), text: '열기' })));
    });
    const table = h('div.k-table-w', {}, h('table.k-table.sb-tb', {},
      h('thead', {}, h('tr', {}, ...['프로젝트', '지역', '담당', '지금', '진행', '마지막 활동', '남은 일', ''].map((t, i) => h('th', { class: i === 5 ? 'num' : '', text: t })))),
      h('tbody', {}, ...tr)));
    const foot = h('p.sb-pg-n', {}, h('span', { text: '위 단계를 누르면 그 단계의 프로젝트만 보입니다.' }), h('span', { text: '막대 = 네 단계 가운데 끝낸 단계.' }),
      h('span', { text: '빨간 점 = 앞 단계에 남은 일.' }));
    body.replaceChildren(hd, table, ...(archived() ? [] : [foot]));
  }
  async function show(k) {
    scope = k;
    setQ();
    drawTabs();
    body.innerHTML = ''; const w = h('div'); body.append(w); K.empty(w, { kind: 'loading' });
    let j;
    try { j = await api('/projects?scope=' + k); } catch (e) { body.innerHTML = ''; const x = h('div'); body.append(x); K.empty(x, { kind: 'error', title: '프로젝트를 불러오지 못했습니다', onRetry: () => show(k) }); return; }
    counts = j.counts || counts; drawTabs();
    S.fresh(j.as_of);
    items = j.items || [];
    const left = items.filter((p) => kick(p)?.kind === 'warn').length;
    const led = items.filter((p) => p.lead_is_me).length;
    sub.textContent = archived() ? `보관 ${items.length}` : [`진행 중 ${items.length}`, k === 'mine' || k === 'all' ? `내가 맡은 ${led}` : null, `남은 일 있는 프로젝트 ${left}`].filter(Boolean).join(' · ');
    drawFlow();
    if (!items.length) {
      body.innerHTML = '';
      const x = h('div'); body.append(x);
      const words = { mine: '진행 중인 내 프로젝트가 없습니다', led: '내가 만든 프로젝트가 없습니다', joined: '참여한 프로젝트가 없습니다', archived: '보관한 프로젝트가 없습니다', all: '진행 중인 프로젝트가 없습니다' };
      K.empty(x, { kind: 'first', title: words[k], action: k === 'archived' || k === 'joined' ? null : { label: '새 프로젝트', onClick: () => openNewProject() } });
      return;
    }
    drawTable();
  }
  /* 첫 묶음 — 주소(?scope=)가 없으면 내 프로젝트(내가 만든 · 참여한 진행 중 — 대시보드 흐름도와 같은 묶음) */
  await show(scope || 'mine');
  if (Q.get('new') === '1') openNewProject();
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
  if (!archived) nowCard.append(h('a.t-btn.lxp-go', { href: stageHref(pr, nx.stage, nx.target), text: `${now?.label || '단계'} 열기` }));
  left.append(nowCard);

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
